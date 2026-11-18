-- Migration 0170: Forwarding Batch 3 - Add side column to charges master (CUSTOMER, VENDOR, BOTH)
-- FW-09: vendor charge descriptions dynamically populated from charge master where side in ('VENDOR', 'BOTH')

alter table public.charges
  add column if not exists side text not null default 'CUSTOMER';

alter table public.charges
  drop constraint if exists charges_side_chk;

alter table public.charges
  add constraint charges_side_chk
  check (side in ('CUSTOMER', 'VENDOR', 'BOTH'));

-- Update existing vendor charges to side = 'VENDOR' and FREIGHT to side = 'BOTH'
update public.charges
   set side = 'VENDOR'
 where upper(name) in (
   'COVID CHARGE VENDOR',
   'DEMAND SURCHARGE VENDOR',
   'GOGREEN VENDOR',
   'MEDICAL CHARGES VENDOR'
 ) or upper(name) like '%VENDOR%';

update public.charges
   set side = 'BOTH'
 where upper(name) in ('FREIGHT', 'FRT');

