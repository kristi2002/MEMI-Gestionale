#!/usr/bin/env bash
# =============================================================================
# MEMI — install the backup schedule into the host crontab (idempotent).
# =============================================================================
# backup.sh has always been correct; it was simply never installed, so a box that
# looked "backed up" had zero archives. This script does the install, verifies it,
# and — unless you skip it — proves the setup by taking one backup immediately.
#
# Usage (on the Hetzner box, as the user that can run docker):
#   MYSQL_ROOT_PASSWORD='...' ./deploy/install-backup-cron.sh
#
# Env:
#   MYSQL_ROOT_PASSWORD   required — same value as the stack's env
#   BACKUP_DIR            where archives go            (default: /backups)
#   RETENTION_DAYS        prune archives older than N  (default: 30)
#   DB_HOUR / UPLOADS_DOW when to run                  (default: 03:00 daily / Sunday 04:00)
#   SKIP_TEST_RUN=1       don't take a verification backup during install
#
# Uninstall:  crontab -l | grep -v 'MEMI-BACKUP' | crontab -
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_SCRIPT="$SCRIPT_DIR/backup.sh"
MARKER="# MEMI-BACKUP (managed by deploy/install-backup-cron.sh — do not edit by hand)"

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
DB_HOUR="${DB_HOUR:-3}"
UPLOADS_DOW="${UPLOADS_DOW:-0}"

die() { echo "ERROR: $*" >&2; exit 1; }
ok()  { echo "  ✓ $*"; }

echo "== MEMI backup cron installer =="

# ── Preflight ────────────────────────────────────────────────────────────────
[ -f "$BACKUP_SCRIPT" ] || die "backup.sh not found next to this script ($BACKUP_SCRIPT)"
[ -x "$BACKUP_SCRIPT" ] || { chmod +x "$BACKUP_SCRIPT"; ok "made backup.sh executable"; }
command -v crontab >/dev/null 2>&1 || die "crontab not available — install cron (apt install cron)"
command -v docker  >/dev/null 2>&1 || die "docker not on PATH"
[ -n "${MYSQL_ROOT_PASSWORD:-}" ] || die "MYSQL_ROOT_PASSWORD is required (same value as the stack's env)"

mkdir -p "$BACKUP_DIR" || die "cannot create BACKUP_DIR=$BACKUP_DIR"
ok "backup dir: $BACKUP_DIR"

# The password ends up in the crontab, which must not be world-readable. The crontab
# file itself is 0600 by default, but the secret is still visible to root — that is
# accepted here; the alternative (an env file) has exactly the same exposure.
chmod 700 "$BACKUP_DIR" 2>/dev/null || true

# ── Build the schedule ───────────────────────────────────────────────────────
ENVPREFIX="MYSQL_ROOT_PASSWORD='${MYSQL_ROOT_PASSWORD}' BACKUP_DIR='${BACKUP_DIR}' RETENTION_DAYS='${RETENTION_DAYS}'"
LOG="/var/log/memi-backup.log"
touch "$LOG" 2>/dev/null || LOG="$BACKUP_DIR/memi-backup.log"

NEW_CRON="$(cat <<EOF
$MARKER
0 $DB_HOUR * * *          $ENVPREFIX $BACKUP_SCRIPT db      >> $LOG 2>&1
0 4 * * $UPLOADS_DOW      $ENVPREFIX $BACKUP_SCRIPT uploads >> $LOG 2>&1
EOF
)"

# ── Install (replace any previous managed block) ─────────────────────────────
CURRENT="$(crontab -l 2>/dev/null || true)"
CLEANED="$(printf '%s\n' "$CURRENT" | grep -v 'MEMI-BACKUP' | grep -v "$BACKUP_SCRIPT" || true)"
printf '%s\n%s\n' "$CLEANED" "$NEW_CRON" | sed '/^$/N;/^\n$/D' | crontab -

ok "crontab installed — db daily at ${DB_HOUR}:00, uploads weekly (day $UPLOADS_DOW) at 04:00"
ok "log: $LOG"

# ── Verify by actually running one ───────────────────────────────────────────
# An installed-but-broken backup is indistinguishable from a working one until the
# day you need it, so take a real archive now and check it landed.
if [ "${SKIP_TEST_RUN:-0}" != "1" ]; then
  echo
  echo "-- verification run (db) --"
  if MYSQL_ROOT_PASSWORD="$MYSQL_ROOT_PASSWORD" BACKUP_DIR="$BACKUP_DIR" RETENTION_DAYS="$RETENTION_DAYS" "$BACKUP_SCRIPT" db; then
    LATEST="$(ls -t "$BACKUP_DIR"/*.sql.gz 2>/dev/null | head -1 || true)"
    [ -n "$LATEST" ] || die "backup.sh reported success but no archive appeared in $BACKUP_DIR"
    SIZE=$(stat -c%s "$LATEST" 2>/dev/null || stat -f%z "$LATEST")
    [ "$SIZE" -gt 1024 ] || die "archive $LATEST is suspiciously small (${SIZE} bytes) — check the dump"
    ok "verified: $LATEST ($((SIZE / 1024)) KB)"
  else
    die "verification run failed — the cron entry is installed but WILL NOT produce backups until this is fixed"
  fi
fi

cat <<'NEXT'

Done. Two things this does NOT cover — do them next:

  1. OFF-SITE COPY. These archives sit on the same disk as the database. A disk
     failure takes both. Add a second cron pushing $BACKUP_DIR to a Hetzner
     Storage Box / S3 bucket (rclone or restic).

  2. RESTORE REHEARSAL. Run deploy/restore.sh against a throwaway stack and
     confirm the shop comes up with the data. An unrehearsed backup is a guess.

Check the schedule any time with:  crontab -l | grep -A2 MEMI-BACKUP
NEXT
