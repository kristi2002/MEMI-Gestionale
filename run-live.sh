#!/usr/bin/env bash
# Live end-to-end smoke test against a running stack (real MySQL + backend).
# Prereqs: the full docker stack is up (see LOCAL-RUN.md), API reachable at $API.
#   API=http://localhost:3000 ./run-live.sh
set -u
API="${API:-http://localhost:3000}"
pass=0; fail=0
chk(){ local d="$1" exp="$2" got="$3"; if [ "$got" = "$exp" ]; then echo "  ok  $d ($got)"; pass=$((pass+1)); else echo "  FAIL $d: expected $exp got $got"; fail=$((fail+1)); fi; }
code(){ curl -s -o /dev/null -w '%{http_code}' "$@"; }

echo "== Live smoke against $API =="
chk "health 200"                200 "$(code $API/health)"
chk "products list 200"         200 "$(code $API/api/products)"
chk "reviews/product path 200"  200 "$(code $API/api/reviews/product/vestito-lino-cannes)"
chk "orders/my needs auth 401"  401 "$(code $API/api/orders/my)"
chk "admin orders needs auth 401" 401 "$(code $API/api/orders/admin/list)"
chk "resi/request bad body 400" 400 "$(code -X POST -H 'Content-Type: application/json' -d '{}' $API/api/resi/request)"
chk "unknown endpoint 404"      404 "$(code $API/api/nope)"
# order with faked price + no stripe verification should not 500
chk "order bad payload 400"     400 "$(code -X POST -H 'Content-Type: application/json' -d '{}' $API/api/orders)"

echo; echo "passed=$pass failed=$fail"
[ "$fail" -eq 0 ] || exit 1
