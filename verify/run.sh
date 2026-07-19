#!/usr/bin/env bash
# MEMI verification harness (no live MySQL required).
#   1. Syntax-check every backend + frontend + admin JS file
#   2. Cache-version consistency across storefront + admin HTML
#   3. Frontend<->backend route-contract + lifecycle invariants
#   4. Order-flow simulation (mock DB pool + mock Stripe)
#   5. Stripe webhook simulation (mock DB pool + mock Stripe)
#   6. Gift-card redemption simulation (mock DB pool + mock Stripe)
#   7. Input-validation (zod) schema tests
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
FAIL=0
sec(){ echo; echo "== $* =="; }
# Scratch files: honor $TMPDIR (some sandboxes have a non-writable /tmp)
NC_ERR="$(mktemp 2>/dev/null || echo "$ROOT/.nc.err.$$")"
NPM_LOG="$(mktemp 2>/dev/null || echo "$ROOT/.npm-verify.log.$$")"
trap 'rm -f "$NC_ERR" "$NPM_LOG"' EXIT

sec "1. JS syntax (node --check)"
JS=$(
  find MEMI-Backend/src -name '*.js';
  ls "Memi Abbigliamento"/*.js 2>/dev/null;
  ls MEMI/js/*.js 2>/dev/null;
)
while IFS= read -r f; do
  [ -z "$f" ] && continue
  if node --check "$f" 2>"$NC_ERR"; then echo "  ok  $f"; else echo "  FAIL $f"; cat "$NC_ERR"; FAIL=1; fi
done <<< "$JS"

sec "2. Cache-version consistency"
av=$(grep -rhoE 'app\.js\?v=[0-9]+' "Memi Abbigliamento" --include=*.html | sort -u)
cv=$(grep -rhoE 'api-client\.js\?v=[0-9]+' "Memi Abbigliamento" --include=*.html | sort -u)
echo "  storefront app.js versions: ${av//$'\n'/ }"
echo "  storefront api-client.js versions: ${cv//$'\n'/ }"
[ "$(echo "$av" | wc -l)" -eq 1 ] || { echo "  FAIL: app.js version drift"; FAIL=1; }
[ "$(echo "$cv" | wc -l)" -eq 1 ] || { echo "  FAIL: api-client.js version drift"; FAIL=1; }
[ "$FAIL" -eq 0 ] && echo "  ok  single version each"

sec "3. Route contract + lifecycle invariants"
node verify/contract.cjs || FAIL=1

sec "4. Order-flow simulation"
NP=""
if [ ! -d MEMI-Backend/node_modules/express ]; then
  TMPD=$(mktemp -d)
  echo "  (installing express+jsonwebtoken to temp: $TMPD)"
  npm install --prefix "$TMPD" express jsonwebtoken >"$NPM_LOG" 2>&1 || { echo "  FAIL npm install"; FAIL=1; }
  NP="$TMPD/node_modules"
fi
NODE_PATH="$NP" node MEMI-Backend/test/orders-logic.test.cjs || FAIL=1

sec "5. Stripe webhook simulation"
NODE_PATH="$NP" node MEMI-Backend/test/webhook-logic.test.cjs || FAIL=1

sec "6. Gift-card redemption simulation"
NODE_PATH="$NP" node MEMI-Backend/test/giftcard-logic.test.cjs || FAIL=1

sec "6b. Cancel/refund compensation simulation"
NODE_PATH="$NP" node MEMI-Backend/test/compensation-logic.test.cjs || FAIL=1

sec "6f. Order-status transactional email"
NODE_PATH="$NP" node MEMI-Backend/test/order-status-email.test.cjs || FAIL=1

sec "6g. Abandoned-cart recovery (modes + categories)"
NODE_PATH="$NP" node MEMI-Backend/test/carts-recovery.test.cjs || FAIL=1

sec "6d. Per-product discount scoping (preview ≡ order-creation)"
NODE_PATH="$NP" node MEMI-Backend/test/discount-scope.test.cjs || FAIL=1

sec "6e. Schema-drift guard (migrations.js vs schema.sql)"
NODE_PATH="$NP" node MEMI-Backend/test/schema-drift.test.cjs || FAIL=1

sec "6c. Lifecycle marketing-email simulation"
NODE_PATH="$NP" node MEMI-Backend/test/lifecycle-logic.test.cjs || FAIL=1

sec "7. Input-validation (zod) schema tests"
NODE_PATH="$NP" node MEMI-Backend/test/validation.test.cjs || FAIL=1

sec "7b. Go-live hardening (RBAC + PayPal gating)"
NODE_PATH="$NP" node MEMI-Backend/test/hardening-golive.test.cjs || FAIL=1

sec "7c. Checkout/server shipping parity"
# The storefront picks the amount charged; the server recomputes and 402s on any mismatch.
# Drift here breaks EVERY card order, so diff the two implementations directly.
NODE_PATH="$NP" node verify/shipping-parity.cjs || FAIL=1

sec "8. File-integrity (anti-truncation) checks"
# Every HTML file must end with </html> — catches the silent file-truncation
# corruption this repo has suffered (files cut mid-write by a sync tool).
BAD=0
while IFS= read -r -d '' f; do
  if ! tail -c 40 "$f" | grep -q "</html>"; then echo "  ✗ truncated HTML: $f"; BAD=1; fi
done < <(find "Memi Abbigliamento" MEMI -name "*.html" -not -path "*/node_modules/*" -print0)
if [ "$BAD" -eq 0 ]; then echo "  ✓ all HTML files end with </html>"; else FAIL=1; fi

sec "9. Backend module load check (catches boot-time ReferenceErrors)"
# node --check misses runtime errors like using a schema that was never imported.
# Actually require every route module (sharp stubbed) the way server.js would.
LOADFAIL=0
for rf in MEMI-Backend/src/routes/*.js; do
  if ! NODE_PATH="$NP" node -r ./verify/stub-sharp.cjs -e "require('./$rf')" >/dev/null 2>&1; then
    echo "  ✗ fails to load: $rf"; LOADFAIL=1
  fi
done
if [ "$LOADFAIL" -eq 0 ]; then echo "  ✓ all backend route modules load cleanly"; else FAIL=1; fi

echo
if [ "$FAIL" -eq 0 ]; then echo "✅  ALL VERIFICATION PASSED"; else echo "❌  VERIFICATION FAILED"; fi
exit $FAIL
