-- ===========================================================================
-- courierwala_hub_reports_verification.sql — 0061 smoke checks
-- ===========================================================================

do $$
declare
  v_keys text[] := array[
    'customer-awb-stock-report','customer-summary-report','daily-report',
    'destination-summary-report','location-summary-report','product-summary-report',
    'tax-report','tariff-rate-report','sales-executive-sales-report',
    'obc-report-checklist','customer-register-profit','vendor-profit-report',
    'billing-report','cod-report','invoice-report','void-report','zero-report',
    'bagging-report','bag-wise-detail-print','delivery-status-report',
    'forwarding-report','volumetric-weight-report','edi-csb-files-report',
    'unassigned-drs-report','unassigned-manifest-report','unassigned-obc-report',
    'forwarding-no-missing-report','comment-view-report','user-entry-log-report',
    'awb-printing-report'
  ];
  v_k text;
begin
  foreach v_k in array v_keys loop
    if not exists (
      select 1 from public.report_definitions
       where report_key = v_k and deleted_at is null and is_active
    ) then
      raise exception 'Missing report definition: %', v_k;
    end if;
  end loop;

  if to_regprocedure(
    'app.execute_courierwala_hub_report(uuid,public.report_definitions,jsonb,date,date,integer,integer,text,text)'
  ) is null then
    raise exception 'Missing app.execute_courierwala_hub_report';
  end if;

  if to_regprocedure(
    'app.execute_report_source_legacy_5e(uuid,public.report_definitions,jsonb,date,date,integer,integer,text,text)'
  ) is null then
    raise exception 'Missing app.execute_report_source_legacy_5e (rename from 5E failed)';
  end if;

  raise notice 'courierwala hub reports verification OK (% keys)', array_length(v_keys, 1);
end $$;
