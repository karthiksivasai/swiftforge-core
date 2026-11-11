-- 0153  Allow rate and zone audit actions.
-- The original audit_logs check only listed ADD/MODIFY/DELETE/LOGIN/LOGOUT/ACCESS.
-- Rate Update writes RATE_UPDATE with the old and new amounts. Zone import writes
-- ZONE_IMPORT (insert or replace) and ZONE_MAPPING_DELETE. Those rows were rejected
-- by the check, so the audit never landed.

alter table public.audit_logs drop constraint if exists audit_logs_action_check;

alter table public.audit_logs
  add constraint audit_logs_action_check
  check (action in (
    'ADD', 'MODIFY', 'DELETE', 'LOGIN', 'LOGOUT', 'ACCESS',
    'RATE_UPDATE', 'ZONE_IMPORT', 'ZONE_MAPPING_DELETE'
  ));
