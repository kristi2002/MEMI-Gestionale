#!/usr/bin/env bash
# =============================================================
# MEMI smoke test — verifies the running stack end to end.
# =============================================================
# Usage:   ./smoke-test.sh [BASE_URL]
# Default BASE_URL: http://localhost:3000  (API as exposed by docker-compose.local.yml)
#
# Exit 0 = all checks passed  -> safe to deploy / safe for Claude to continue
# Exit 1 = at least one check failed
# =============================================================

set -uo pipefail

BASE="${1:-http://localhost:3000}"
ADMIN_EMAIL="admin@memi.it"
ADMIN_PASS="memi2026admin"

pass=0; fail=0
ok() { echo "  [ok] $1"; pass=$((pass+1)); }
ko() { echo "  [XX] $1"; fail=$((fail+1)); }
code() { curl -s -o /dev/null -w "%{http_code}" "$@"; }
# JSON field extractor — uses node (guaranteed present in this repo's toolchain).
# python3 was used before, but on Windows it's often a Store stub that errors out,
# silently turning every parsed value into "" and failing all token/count checks.
jget() { node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{try{console.log(JSON.parse(d)["'"$1"'"]??"")}catch(e){console.log("")}})' 2>/dev/null; }

echo "MEMI smoke test against $BASE"
echo

# 1 — Backend health
echo "[1] Backend health"
if curl -fsS "$BASE/health" 2>/dev/null | grep -q '"status"'; then
  ok "GET /health responding"
else
  ko "GET /health failed — is the stack up? (docker compose ... up)"
fi

# 2 — Product catalog (public)
echo "[2] Product catalog"
COUNT="$(curl -fsS "$BASE/api/products" 2>/dev/null | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{try{const j=JSON.parse(d);console.log(Array.isArray(j)?j.length:(j.products||[]).length)}catch(e){console.log(0)}})' 2>/dev/null)"
if [ "${COUNT:-0}" -gt 0 ]; then
  ok "GET /api/products -> $COUNT products"
else
  ko "GET /api/products returned no products (DB not seeded?)"
fi

# 3 — Admin login
echo "[3] Admin auth"
ADMIN_TOKEN="$(curl -fsS -X POST "$BASE/api/admin/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}" 2>/dev/null | jget token)"
if [ -n "$ADMIN_TOKEN" ]; then
  ok "POST /api/admin/auth/login -> token received"
else
  ko "admin login failed (default creds changed, or DB not seeded)"
fi

# 4 — Admin dashboard KPIs (auth required)
echo "[4] Admin dashboard"
if [ -n "$ADMIN_TOKEN" ]; then
  C="$(code -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE/api/admin/dashboard/kpis")"
  [ "$C" = "200" ] && ok "GET /api/admin/dashboard/kpis -> 200" || ko "kpis -> HTTP $C"
  C="$(code -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE/api/admin/dashboard/catalog-kpis")"
  [ "$C" = "200" ] && ok "GET /api/admin/dashboard/catalog-kpis -> 200" || ko "catalog-kpis -> HTTP $C"
  C="$(code -X PUT -H "Content-Type: application/json" -d '{"current_password":"x","new_password":"yyyyyyyy"}' "$BASE/api/admin/auth/password")"
  [ "$C" = "401" ] && ok "PUT /api/admin/auth/password without token -> 401" || ko "password change unauth -> HTTP $C"
else
  ko "skipped — no admin token"
fi

# 5 — Shipping zones (public)
echo "[5] Shipping zones"
C="$(code "$BASE/api/shipping/zones")"
[ "$C" = "200" ] && ok "GET /api/shipping/zones -> 200" || ko "shipping/zones -> HTTP $C"

# 6 — Customer register + me round-trip
echo "[6] Customer auth round-trip"
RND="smoke_$(date +%s)@example.com"
# Field is "nome" (Italian), not "name" — auth.js has always required nome; the old
# "name" payload made this check fail with a 400 whenever it actually ran.
CUST_TOKEN="$(curl -fsS -X POST "$BASE/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"nome\":\"Smoke Test\",\"email\":\"$RND\",\"password\":\"Test1234!\"}" 2>/dev/null | jget token)"
if [ -n "$CUST_TOKEN" ]; then
  C="$(code -H "Authorization: Bearer $CUST_TOKEN" "$BASE/api/auth/me")"
  [ "$C" = "200" ] && ok "register + GET /api/auth/me -> 200" || ko "auth/me -> HTTP $C"
else
  ko "POST /api/auth/register returned no token (check field names in auth.js)"
fi

echo
# 7 — Catalog write round-trip (admin create -> list -> image -> delete)
echo "[7] Catalog round-trip (create -> image -> delete)"
if [ -n "$ADMIN_TOKEN" ]; then
  PID="smoke-prod-$(date +%s)"
  CREATE_CODE="$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/products" \
    -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
    -d "{\"id\":\"$PID\",\"name\":\"Smoke $PID\",\"categoria\":\"vestiti\",\"price\":50,\"collections\":[\"shop-all\",\"vestiti\"],\"taglie\":[{\"taglia\":\"M\",\"stock\":3}]}")"
  [ "$CREATE_CODE" = "201" ] && ok "POST /api/products -> 201" || ko "create -> HTTP $CREATE_CODE"

  IN_COLL="$(curl -fsS "$BASE/api/products?collection=vestiti&limit=500" 2>/dev/null | grep -c "$PID")"
  [ "${IN_COLL:-0}" -gt 0 ] && ok "GET /api/products?collection=vestiti includes new product" || ko "collection filter missing new product"

  # Relative path on purpose: on Git Bash (Windows) the MSYS /tmp path is NOT
  # translated when embedded inside curl's -F "images=@/tmp/..." argument, so the
  # mingw curl can't open the file and fails with exit 26 before any HTTP happens.
  PNG="smoke-$PID.png"
  printf 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' | base64 -d > "$PNG" 2>/dev/null
  IMG_URL="$(curl -fsS -X POST "$BASE/api/products/$PID/images" -H "Authorization: Bearer $ADMIN_TOKEN" \
    -F "images=@$PNG;type=image/png" 2>/dev/null | grep -o '/api/uploads/[^"]*' | head -1)"
  if [ -n "$IMG_URL" ]; then
    IMG_CT="$(curl -s -o /dev/null -w "%{content_type}" "$BASE$IMG_URL")"
    case "$IMG_CT" in image/*) ok "image upload served ($IMG_CT)";; *) ko "uploaded image not served (ct=$IMG_CT)";; esac
  else
    ko "image upload returned no URL"
  fi
  rm -f "$PNG" 2>/dev/null

  DEL_CODE="$(code -X DELETE -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE/api/products/$PID")"
  [ "$DEL_CODE" = "200" ] && ok "DELETE /api/products/:id -> 200" || ko "delete -> HTTP $DEL_CODE"
else
  ko "skipped — no admin token"
fi

echo
echo "------------------------------"
echo "  passed: $pass   failed: $fail"
echo "------------------------------"
[ "$fail" -eq 0 ]
