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
  # Bulk photo import (ZIP): route exists + validates — no file should be 400, not 404
  C="$(code -X POST -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE/api/admin/products/bulk-images")"
  [ "$C" = "400" ] && ok "POST /api/admin/products/bulk-images (no zip) -> 400" || ko "bulk-images route -> HTTP $C (expected 400)"
  # Demo-reviews seed: route exists + is admin-protected (non lo eseguiamo:
  # inserirebbe dati e richiede il catalogo demo importato)
  C="$(code -X POST "$BASE/api/reviews/admin/seed-demo")"
  [ "$C" = "401" ] && ok "POST /api/reviews/admin/seed-demo without token -> 401" || ko "seed-demo unauth -> HTTP $C (expected 401)"
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
# 8 — Order lifecycle: compensation (cancel / manual refund) + auto-invoice
echo "[8] Order lifecycle (compensation + auto-invoice)"
if [ -n "$ADMIN_TOKEN" ]; then
  P8="smoke-life-$(date +%s)"
  C="$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/products" \
    -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
    -d "{\"id\":\"$P8\",\"name\":\"Smoke Life\",\"categoria\":\"vestiti\",\"price\":40,\"taglie\":[{\"taglia\":\"M\",\"stock\":3}]}")"
  [ "$C" = "201" ] && ok "lifecycle product created" || ko "lifecycle product create -> HTTP $C"

  stock8() { curl -fsS "$BASE/api/products/$P8" 2>/dev/null | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{try{const j=JSON.parse(d);const t=(j.taglie||[]).find(x=>String(x.taglia).toUpperCase()==="M");console.log(t?t.stock:"")}catch(e){console.log("")}})'; }

  # a) create an admin order (qty 1) -> stock 3->2
  OID="$(curl -fsS -X POST "$BASE/api/orders/admin" -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
    -d "{\"nome\":\"Smoke\",\"email\":\"smoke-life@example.com\",\"items\":[{\"product_id\":\"$P8\",\"taglia\":\"M\",\"qty\":1}]}" 2>/dev/null | jget id)"
  [ -n "$OID" ] && ok "admin order created (id $OID)" || ko "admin order create failed"
  [ "$(stock8)" = "2" ] && ok "stock decremented 3->2" || ko "stock after order = $(stock8) (expected 2)"

  # b) cancel -> stock restored; annullato is terminal; delete doesn't double-restock
  if [ -n "$OID" ]; then
    C="$(code -X PUT -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' -d '{"order_status":"annullato"}' "$BASE/api/orders/admin/$OID/status")"
    [ "$C" = "200" ] && ok "order cancelled" || ko "cancel -> HTTP $C"
    [ "$(stock8)" = "3" ] && ok "cancel restored stock 2->3" || ko "stock after cancel = $(stock8) (expected 3)"
    C="$(code -X PUT -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' -d '{"order_status":"in_preparazione"}' "$BASE/api/orders/admin/$OID/status")"
    [ "$C" = "409" ] && ok "annullato is terminal (reactivation -> 409)" || ko "reactivation -> HTTP $C (expected 409)"
    C="$(code -X DELETE -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE/api/orders/admin/$OID")"
    [ "$C" = "200" ] && ok "cancelled order deleted" || ko "order delete -> HTTP $C"
    [ "$(stock8)" = "3" ] && ok "delete after cancel: no double restock" || ko "stock after delete = $(stock8) (expected 3)"
  fi

  # c) paid order -> auto-invoice; manual refund -> restock + rimborsato
  OID2="$(curl -fsS -X POST "$BASE/api/orders/admin" -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
    -d "{\"nome\":\"Smoke\",\"email\":\"smoke-life@example.com\",\"payment_method\":\"paypal\",\"items\":[{\"product_id\":\"$P8\",\"taglia\":\"M\",\"qty\":1}]}" 2>/dev/null | jget id)"
  if [ -n "$OID2" ]; then
    C="$(code -X PUT -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' -d '{"payment_status":"pagato"}' "$BASE/api/orders/admin/$OID2/status")"
    [ "$C" = "200" ] && ok "order marked pagato" || ko "mark pagato -> HTTP $C"
    sleep 1
    INV="$(curl -fsS -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE/api/admin/invoices?limit=500" 2>/dev/null | grep -c "\"order_id\":$OID2")"
    [ "${INV:-0}" -gt 0 ] && ok "invoice auto-emitted on pagato" || ko "no auto-invoice for order $OID2"
    RID="$(curl -fsS -X POST "$BASE/api/admin/resi" -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
      -d "{\"order_id\":$OID2,\"motivo\":\"smoke\"}" 2>/dev/null | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{try{console.log(JSON.parse(d).reso.id)}catch(e){console.log("")}})')"
    [ -n "$RID" ] && ok "reso created (id $RID)" || ko "reso create failed"
    if [ -n "$RID" ]; then
      C="$(code -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' -d '{"manual":true}' "$BASE/api/admin/resi/$RID/refund")"
      [ "$C" = "200" ] && ok "manual refund -> 200" || ko "manual refund -> HTTP $C"
      [ "$(stock8)" = "3" ] && ok "refund restocked 2->3" || ko "stock after refund = $(stock8) (expected 3)"
      C="$(code -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' -d '{"manual":true}' "$BASE/api/admin/resi/$RID/refund")"
      [ "$C" = "409" ] && ok "second refund rejected (409)" || ko "second refund -> HTTP $C (expected 409)"
    fi
    C="$(code -X DELETE -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE/api/orders/admin/$OID2")"
    [ "$C" = "200" ] && ok "refunded order deleted (cleanup)" || ko "order2 delete -> HTTP $C"
    [ "$(stock8)" = "3" ] && ok "delete after refund: no double restock" || ko "stock after delete2 = $(stock8) (expected 3)"
  else
    ko "second admin order create failed"
  fi
  C="$(code -X DELETE -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE/api/products/$P8")"
  [ "$C" = "200" ] && ok "lifecycle product deleted (cleanup)" || ko "product cleanup -> HTTP $C"
else
  ko "skipped — no admin token"
fi

# 8b — Lifecycle marketing emails (GDPR-gated, idempotent, dry-runnable)
echo
echo "[8b] Lifecycle emails"
C="$(code "$BASE/api/admin/lifecycle")"
[ "$C" = "401" ] && ok "GET /api/admin/lifecycle without token -> 401" || ko "lifecycle unauth -> HTTP $C (expected 401)"
if [ -n "${ADMIN_TOKEN:-}" ]; then
  C="$(code -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE/api/admin/lifecycle")"
  [ "$C" = "200" ] && ok "GET /api/admin/lifecycle -> 200 (catalog+settings)" || ko "lifecycle get -> HTTP $C"
  C="$(code -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' -d '{"dryRun":true}' "$BASE/api/admin/lifecycle/run")"
  [ "$C" = "200" ] && ok "POST /api/admin/lifecycle/run {dryRun} -> 200" || ko "lifecycle dry-run -> HTTP $C"
  C="$(code -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' "$BASE/api/admin/lifecycle/birthday/preview")"
  [ "$C" = "200" ] && ok "POST /api/admin/lifecycle/birthday/preview -> 200" || ko "birthday preview -> HTTP $C"
  C="$(code -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' -d '{}' "$BASE/api/admin/lifecycle/season")"
  [ "$C" = "400" ] && ok "POST /api/admin/lifecycle/season (no season) -> 400" || ko "season validation -> HTTP $C (expected 400)"
fi

# 9 — Colors (dynamic palette + product color_hex join + AI suggest)
echo
echo "[9] Colors (dynamic palette)"
NCOL="$(curl -fsS "$BASE/api/colors" 2>/dev/null | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{try{const j=JSON.parse(d);console.log(Array.isArray(j)?j.length:0)}catch(e){console.log(0)}})' 2>/dev/null)"
[ "${NCOL:-0}" -ge 7 ] && ok "GET /api/colors -> $NCOL colors (seed present)" || ko "GET /api/colors -> ${NCOL:-0} (expected >= 7)"
C="$(code -X POST -H 'Content-Type: application/json' -d '{"name":"x","hex":"#112233"}' "$BASE/api/admin/colors")"
[ "$C" = "401" ] && ok "POST /api/admin/colors without token -> 401" || ko "colors create unauth -> HTTP $C"
if [ -n "${ADMIN_TOKEN:-}" ]; then
  CSLUG="smoke-color-$"
  CID="$(curl -fsS -X POST "$BASE/api/admin/colors" -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
    -d "{\"name\":\"Smoke Oliva\",\"hex\":\"#556B2F\",\"slug\":\"$CSLUG\"}" 2>/dev/null | jget id)"
  [ -n "$CID" ] && ok "color created (id $CID)" || ko "color create failed"
  C="$(code -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' -d "{\"name\":\"Dup\",\"hex\":\"#000000\",\"slug\":\"$CSLUG\"}" "$BASE/api/admin/colors")"
  [ "$C" = "409" ] && ok "duplicate color slug -> 409" || ko "duplicate slug -> HTTP $C (expected 409)"
  C="$(code -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
    -d "{\"id\":\"$CSLUG-prod\",\"name\":\"Smoke Color Prod\",\"categoria\":\"vestiti\",\"price\":10,\"colore\":\"$CSLUG\",\"color_label\":\"Smoke Oliva\"}" "$BASE/api/products")"
  [ "$C" = "201" ] || ko "color product create -> HTTP $C"
  CHEX="$(curl -fsS "$BASE/api/products/$CSLUG-prod" 2>/dev/null | jget color_hex)"
  [ "$CHEX" = "#556B2F" ] && ok "product detail exposes color_hex ($CHEX)" || ko "color_hex = '$CHEX' (expected #556B2F)"
  C="$(code -X DELETE -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE/api/admin/colors/$CID")"
  [ "$C" = "409" ] && ok "delete color in use -> 409" || ko "delete in-use color -> HTTP $C (expected 409)"
  PNG9="smoke-color-$.png"
  printf 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' | base64 -d > "$PNG9" 2>/dev/null
  SUG="$(curl -fsS -X POST "$BASE/api/admin/colors/suggest-from-image" -H "Authorization: Bearer $ADMIN_TOKEN" -F "image=@$PNG9;type=image/png" 2>/dev/null)"
  rm -f "$PNG9" 2>/dev/null
  echo "$SUG" | grep -q '"hex":"#' && ok "suggest-from-image returns dominant hex" || ko "suggest-from-image: $SUG"
  C="$(code -X DELETE -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE/api/products/$CSLUG-prod")"
  [ "$C" = "200" ] || ko "color product cleanup -> HTTP $C"
  C="$(code -X DELETE -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE/api/admin/colors/$CID")"
  [ "$C" = "200" ] && ok "unused color deleted (cleanup)" || ko "color delete -> HTTP $C"
else
  ko "skipped colors admin checks — no admin token"
fi

echo
# 10 — Payments config + PayPal provider gating (go-live pass)
echo "[10] Payments config + provider gating"
CFG="$(curl -fsS "$BASE/api/payments/config" 2>/dev/null)"
if echo "$CFG" | grep -q '"providers"'; then
  ok "GET /api/payments/config -> providers advertised"
else
  ko "GET /api/payments/config missing providers object"
fi
# With no PayPal creds set, the provider endpoints must fail safe with 503 (never a silent order).
C="$(code -X POST -H 'Content-Type: application/json' -d '{"amount_cents":5000}' "$BASE/api/payments/paypal/create-order")"
[ "$C" = "503" ] && ok "POST /paypal/create-order unconfigured -> 503" || ko "paypal/create-order -> HTTP $C (expected 503 when PAYPAL_* unset)"

echo
echo "------------------------------"
echo "  passed: $pass   failed: $fail"
echo "------------------------------"
[ "$fail" -eq 0 ]
