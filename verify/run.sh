#!/usr/bin/env bash
# MEMI verification harness (no live MySQL required).
#   1. Syntax-check every backend + frontend + admin JS file
#   2. Cache-version consistency across storefront + admin HTML
#   3. Frontend<->backend route-contract + lifecycle invariants
#   4. Order-flow simulation (mock DB pool + mock Stripe)
#   5. Stripe webhook simulation (mock DB pool + mock Stripe)
#   6. Gift-card redemption simulation (mock DB pool + mock Stripe)
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
FAIL=0
sec(){ echo; echo "== $* =="; }

sec "1. JS syntax (node --check)"
JS=$(
  find MEMI-Backend/src -name '*.js';
  ls "Memi Abbigliamento"/*.js 2>/dev/null;
  ls MEMI/js/*.js 2>/dev/null;
)
while IFS= read -r f; do
  [ -z "$f" ] && continue
  if node --check "$f" 2>/tmp/nc.err; then echo "  ok  $f"; else echo "  FAIL $f"; cat /tmp/nc.err; FAIL=1; fi
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
  npm install --prefix "$TMPD" express jsonwebtoken >/tmp/npm-verify.log 2>&1 || { echo "  FAIL npm install"; FAIL=1; }
  NP="$TMPD/node_modules"
fi
NODE_PATH="$NP" node MEMI-Backend/test/orders-logic.test.cjs || FAIL=1

sec "5. Stripe webhook simulation"
NODE_PATH="$NP" node MEMI-Backend/test/webhook-logic.test.cjs || FAIL=1

sec "6. Gift-card redemption simulation"
NODE_PATH="$NP" node MEMI-Backend/test/giftcard-logic.test.cjs || FAIL=1

echo
if [ "$FAIL" -eq 0 ]; then echo "✅  ALL VERIFICATION PASSED"; else echo "❌  VERIFICATION FAILED"; fi
exit $FAIL
