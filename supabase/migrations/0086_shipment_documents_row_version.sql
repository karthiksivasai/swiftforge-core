-- shipment_documents uses app.tg_touch_row() which requires row_version.
-- The original table omitted it, causing save_shipment_document 400 errors.

alter table public.shipment_documents
  add column if not exists row_version integer not null default 1;
