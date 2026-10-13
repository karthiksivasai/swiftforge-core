-- ===========================================================================
-- 0129  Drain the credit-limit reevaluation queue
-- ---------------------------------------------------------------------------
-- save_utility_miscellaneous still evaluates only the first page (200).
-- This worker walks every pending tenant until process_credit_limit_reeval_batch
-- returns 0. pg_cron runs it once a minute. A second pass does not send
-- another alert: evaluate_credit_limit_alert returns when above_threshold
-- is already true, and a finished queue is not walked again.
--
-- Production order for a database that does not have these versions yet:
--   0125, 0126, 0127, 0128, 0129.
-- 0128 does not read or replace objects from 0125–0127, so a database that
-- already has 0128 can apply 0125, 0126, 0127, then 0129.
-- ===========================================================================

create or replace function app.drain_credit_limit_reeval_queues(
  p_batch integer default 200,
  p_max_rounds integer default 500
)
returns integer
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_round integer := 0;
  v_moved integer := 0;
  v_total integer := 0;
  v_tenant uuid;
  v_n integer;
begin
  loop
    v_round := v_round + 1;
    if v_round > greatest(coalesce(p_max_rounds, 500), 1) then
      exit;
    end if;
    v_moved := 0;
    for v_tenant in
      select q.tenant_id
        from public.credit_limit_reeval_queue q
       where q.pending
       order by q.updated_at, q.tenant_id
    loop
      v_n := app.process_credit_limit_reeval_batch(
        v_tenant, greatest(1, least(coalesce(p_batch, 200), 500)));
      v_total := v_total + v_n;
      v_moved := v_moved + v_n;
    end loop;
    exit when v_moved = 0;
  end loop;
  return v_total;
end
$$;

revoke all on function app.drain_credit_limit_reeval_queues(integer, integer) from public;
grant execute on function app.drain_credit_limit_reeval_queues(integer, integer)
  to service_role;

comment on function app.drain_credit_limit_reeval_queues(integer, integer) is
  'Calls process_credit_limit_reeval_batch for every pending tenant until each call returns 0.';

do $$
begin
  begin
    create extension if not exists pg_cron with schema extensions;
  exception when others then
    begin
      create extension if not exists pg_cron;
    exception when others then
      raise warning 'pg_cron is not available: %', sqlerrm;
      return;
    end;
  end;

  if exists (
    select 1 from cron.job where jobname = 'credit-limit-reeval-drain'
  ) then
    perform cron.unschedule('credit-limit-reeval-drain');
  end if;

  perform cron.schedule(
    'credit-limit-reeval-drain',
    '* * * * *',
    'select app.drain_credit_limit_reeval_queues(200, 500)');
end
$$;
