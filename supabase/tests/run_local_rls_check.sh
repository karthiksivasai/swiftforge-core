#!/usr/bin/env bash
# ===========================================================================
# run_local_rls_check.sh
# ---------------------------------------------------------------------------
# Spins up a throwaway local Postgres cluster, applies the local shim, all
# migrations, the local grants, then the RLS verification harness. Proves the
# SQL is valid and tenant isolation holds — WITHOUT touching any remote project.
#
# Requires local Postgres binaries on PATH (initdb, pg_ctl, createdb, psql).
# Usage:  bash supabase/tests/run_local_rls_check.sh
# ===========================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIG_DIR="$ROOT/supabase/migrations"
TEST_DIR="$ROOT/supabase/tests"

TMP="$(mktemp -d)"
DATA="$TMP/data"
SOCK="$TMP/sock"
PORT=55432
LOG="$TMP/pg.log"

cleanup() {
  pg_ctl -D "$DATA" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

echo "==> initdb ($TMP)"
initdb -D "$DATA" -U postgres --auth=trust >/dev/null

mkdir -p "$SOCK"
echo "==> starting ephemeral postgres on socket $SOCK (port $PORT)"
pg_ctl -D "$DATA" -l "$LOG" \
  -o "-p $PORT -k $SOCK -c listen_addresses=''" -w start >/dev/null

PSQL=(psql -X -q -h "$SOCK" -p "$PORT" -U postgres -v ON_ERROR_STOP=1)

createdb -h "$SOCK" -p "$PORT" -U postgres rlstest
DB=(--dbname=rlstest)

echo "==> applying local shim"
"${PSQL[@]}" "${DB[@]}" -f "$TEST_DIR/local_shim.sql"

echo "==> applying migrations"
for f in "$MIG_DIR"/[0-9]*.sql; do
  echo "    - $(basename "$f")"
  "${PSQL[@]}" "${DB[@]}" -f "$f"
done

echo "==> applying local grants"
"${PSQL[@]}" "${DB[@]}" -f "$TEST_DIR/local_grants.sql"

echo "==> running Phase 1 RLS verification"
"${PSQL[@]}" "${DB[@]}" -f "$TEST_DIR/rls_verification.sql"

echo "==> running Phase 2 RBAC verification"
"${PSQL[@]}" "${DB[@]}" -f "$TEST_DIR/rbac_verification.sql"

echo "==> running tenant bootstrap verification"
"${PSQL[@]}" "${DB[@]}" -f "$TEST_DIR/bootstrap_verification.sql"

echo "==> running Phase 3 master-core verification"
"${PSQL[@]}" "${DB[@]}" -f "$TEST_DIR/master_core_verification.sql"

echo "==> running Phase 3 import-pipeline verification"
"${PSQL[@]}" "${DB[@]}" -f "$TEST_DIR/import_pipeline_verification.sql"

echo "==> running Phase 3 lookup verification"
"${PSQL[@]}" "${DB[@]}" -f "$TEST_DIR/lookups_verification.sql"

echo "==> running Phase 3 catalog-masters verification"
"${PSQL[@]}" "${DB[@]}" -f "$TEST_DIR/catalog_masters_verification.sql"

echo "==> running Phase 3 complex-catalog-masters verification"
"${PSQL[@]}" "${DB[@]}" -f "$TEST_DIR/complex_catalog_masters_verification.sql"

echo "==> running Phase 3 aggregate-catalog-masters verification"
"${PSQL[@]}" "${DB[@]}" -f "$TEST_DIR/aggregate_catalog_masters_verification.sql"

echo "==> running Phase 3 party-masters verification"
"${PSQL[@]}" "${DB[@]}" -f "$TEST_DIR/party_masters_verification.sql"

echo "==> running Phase 3 customer-aggregate verification"
"${PSQL[@]}" "${DB[@]}" -f "$TEST_DIR/customer_aggregate_verification.sql"

echo "==> running Phase 3 customer-children verification"
"${PSQL[@]}" "${DB[@]}" -f "$TEST_DIR/customer_children_verification.sql"

echo "==> running Phase 3 vendor-aggregate verification"
"${PSQL[@]}" "${DB[@]}" -f "$TEST_DIR/vendor_aggregate_verification.sql"

echo "==> running Phase 3 vendor-wizard verification"
"${PSQL[@]}" "${DB[@]}" -f "$TEST_DIR/vendor_wizard_verification.sql"

echo "==> running Phase 3 service-mapping verification"
"${PSQL[@]}" "${DB[@]}" -f "$TEST_DIR/service_mapping_verification.sql"

echo "==> running Phase 3 vendor-contract verification"
"${PSQL[@]}" "${DB[@]}" -f "$TEST_DIR/vendor_contract_verification.sql"

echo "==> running Phase 3 local-branch verification"
"${PSQL[@]}" "${DB[@]}" -f "$TEST_DIR/local_branch_verification.sql"

echo "==> running Phase 4 transaction-core verification"
"${PSQL[@]}" "${DB[@]}" -f "$TEST_DIR/transaction_core_verification.sql"

echo "==> running Phase 4 pickup verification"
"${PSQL[@]}" "${DB[@]}" -f "$TEST_DIR/pickup_verification.sql"

echo "==> running Phase 4 shipment-foundation verification"
"${PSQL[@]}" "${DB[@]}" -f "$TEST_DIR/shipment_foundation_verification.sql"

echo "==> running Phase 4 shipment-booking verification"
"${PSQL[@]}" "${DB[@]}" -f "$TEST_DIR/shipment_booking_verification.sql"

echo "==> running Phase 4 manifest-foundation verification"
"${PSQL[@]}" "${DB[@]}" -f "$TEST_DIR/manifest_foundation_verification.sql"

echo "==> running Phase 4 manifest-inscan verification"
"${PSQL[@]}" "${DB[@]}" -f "$TEST_DIR/manifest_inscan_verification.sql"

echo "==> running Phase 4 drs-foundation verification"
"${PSQL[@]}" "${DB[@]}" -f "$TEST_DIR/drs_foundation_verification.sql"

echo "==> running Phase 4 drs-completion verification"
"${PSQL[@]}" "${DB[@]}" -f "$TEST_DIR/drs_completion_verification.sql"

echo "==> running Phase 4 pod-foundation verification"
"${PSQL[@]}" "${DB[@]}" -f "$TEST_DIR/pod_foundation_verification.sql"

echo "==> running Phase 4 tracking-foundation verification"
"${PSQL[@]}" "${DB[@]}" -f "$TEST_DIR/tracking_foundation_verification.sql"

echo "==> running Phase 4 finance-foundation verification"
"${PSQL[@]}" "${DB[@]}" -f "$TEST_DIR/finance_foundation_verification.sql"

echo "==> running Phase 4 rating-engine verification"
"${PSQL[@]}" "${DB[@]}" -f "$TEST_DIR/rating_engine_verification.sql"

echo "==> running Phase 5 reporting-foundation verification"
"${PSQL[@]}" "${DB[@]}" -f "$TEST_DIR/reporting_foundation_verification.sql"

echo "==> running Phase 5 operational-reports verification"
"${PSQL[@]}" "${DB[@]}" -f "$TEST_DIR/operational_reports_verification.sql"

echo "==> running Phase 5 financial-reports verification"
"${PSQL[@]}" "${DB[@]}" -f "$TEST_DIR/financial_reports_verification.sql"

echo "==> running Phase 5 accounts-receivable-reports verification"
"${PSQL[@]}" "${DB[@]}" -f "$TEST_DIR/accounts_receivable_reports_verification.sql"

echo "==> running Phase 5 audit-security-reports verification"
"${PSQL[@]}" "${DB[@]}" -f "$TEST_DIR/audit_security_reports_verification.sql"

echo "==> running Phase 5 dashboard-rollups verification"
"${PSQL[@]}" "${DB[@]}" -f "$TEST_DIR/dashboard_rollups_verification.sql"

echo "==> running Phase 5 report-jobs verification"
"${PSQL[@]}" "${DB[@]}" -f "$TEST_DIR/report_jobs_verification.sql"

echo "==> running Phase 6 excel-import-suite verification"
"${PSQL[@]}" "${DB[@]}" -f "$TEST_DIR/excel_import_suite_verification.sql"

echo "==> running Phase 6 rate-update-jobs verification"
"${PSQL[@]}" "${DB[@]}" -f "$TEST_DIR/rate_update_jobs_verification.sql"

echo "==> running Phase 6 zone-update-jobs verification"
"${PSQL[@]}" "${DB[@]}" -f "$TEST_DIR/zone_update_jobs_verification.sql"

echo "==> running Phase 6 tax-fuel-setup verification"
"${PSQL[@]}" "${DB[@]}" -f "$TEST_DIR/tax_fuel_setup_verification.sql"

echo "==> running Phase 6 notifications-email-configuration verification"
"${PSQL[@]}" "${DB[@]}" -f "$TEST_DIR/notifications_email_configuration_verification.sql"

echo "==> running Phase 6 serviceable-pincode verification"
"${PSQL[@]}" "${DB[@]}" -f "$TEST_DIR/serviceable_pincode_verification.sql"

echo "==> running Phase 7 integration-framework verification"
"${PSQL[@]}" "${DB[@]}" -f "$TEST_DIR/integration_framework_verification.sql"

echo "==> running Phase 7 carrier-booking-tracking verification"
"${PSQL[@]}" "${DB[@]}" -f "$TEST_DIR/carrier_booking_tracking_verification.sql"

echo "==> running Phase 7 public-tracking-webhooks verification"
"${PSQL[@]}" "${DB[@]}" -f "$TEST_DIR/public_tracking_webhooks_verification.sql"

echo "==> running Phase 7 notification-delivery verification"
"${PSQL[@]}" "${DB[@]}" -f "$TEST_DIR/notification_delivery_verification.sql"

echo "==> running Phase 7 irn-integration verification"
"${PSQL[@]}" "${DB[@]}" -f "$TEST_DIR/irn_integration_verification.sql"

echo "==> running Phase 7 customs-edi verification"
"${PSQL[@]}" "${DB[@]}" -f "$TEST_DIR/customs_edi_verification.sql"

echo "==> OK: migrations applied cleanly and all verifications passed."
