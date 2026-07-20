/**
 * AWB party contact memory — search + remember shipper/consignee.
 */
import { supabase } from "@/integrations/supabase/client";

export type PartyContactRole = "shipper" | "consignee";

export type PartyContactHit = {
  id: string;
  code: string;
  name: string;
  contact_name: string;
  address1: string;
  address2: string;
  pin_code: string;
  city: string;
  state_name: string;
  country_name: string;
  telephone: string;
  mobile: string;
  email: string;
  document_type: string;
  document_no: string;
  iec_no: string;
  geo_code: string;
  geo_name: string;
  geo_id: string | null;
  last_used_at: string | null;
  shipment_count: number;
};

export type PartyContactFields = {
  id?: string | null;
  code?: string | null;
  name: string;
  contact_name?: string | null;
  address1?: string | null;
  address2?: string | null;
  pin_code?: string | null;
  pincode?: string | null;
  city?: string | null;
  state?: string | null;
  state_name?: string | null;
  country?: string | null;
  telephone?: string | null;
  mobile?: string | null;
  email?: string | null;
  document_type?: string | null;
  document_no?: string | null;
  iec_no?: string | null;
  geo_id?: string | null;
  geo_code?: string | null;
  origin_code?: string | null;
  destination_code?: string | null;
};

export async function searchPartyContacts(
  role: PartyContactRole,
  q?: string | null,
  limit = 15,
): Promise<PartyContactHit[]> {
  const { data, error } = await supabase.rpc("search_party_contacts", {
    p_role: role,
    p_q: q?.trim() ? q.trim() : null,
    p_limit: limit,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as PartyContactHit[];
}

/** Full contact hydrate for select — guarantees every party field. */
export async function getPartyContact(
  role: PartyContactRole,
  id: string,
): Promise<PartyContactHit | null> {
  const { data, error } = await supabase.rpc("get_party_contact", {
    p_role: role,
    p_id: id,
  });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object") return null;
  return data as PartyContactHit;
}

export async function rememberPartyContact(
  role: PartyContactRole,
  fields: PartyContactFields,
): Promise<{ ok: boolean; id?: string; reason?: string }> {
  const { data, error } = await supabase.rpc("remember_party_contact", {
    p_role: role,
    p_fields: fields,
  });
  if (error) throw new Error(error.message);
  return (data ?? { ok: false }) as { ok: boolean; id?: string; reason?: string };
}

/** Map AWB party form slice → remember_party_contact payload. */
export function partyFormToRememberFields(party: {
  companyName: { id?: string; code: string; name: string };
  contactName: string;
  address1: string;
  address2: string;
  pincode: string;
  city: string;
  state: string;
  country: string;
  telephone: string;
  mobileNo: string;
  email: string;
  documentType: string;
  documentNo: string;
  iecNo: string;
  origin: { id?: string; code: string; name: string };
}): PartyContactFields {
  return {
    id: party.companyName.id ?? null,
    code: party.companyName.code || null,
    name: party.companyName.name.trim(),
    contact_name: party.contactName,
    address1: party.address1,
    address2: party.address2,
    pincode: party.pincode,
    city: party.city,
    state: party.state,
    country: party.country,
    telephone: party.telephone,
    mobile: party.mobileNo,
    email: party.email,
    document_type: party.documentType,
    document_no: party.documentNo,
    iec_no: party.iecNo,
    geo_id: party.origin.id ?? null,
    geo_code: party.origin.code || null,
    origin_code: party.origin.code || null,
    destination_code: party.origin.code || null,
  };
}

/** Best-effort remember after AWB save — never throws. */
export async function rememberPartiesAfterAwbSave(parties: {
  shipper: Parameters<typeof partyFormToRememberFields>[0];
  consignee: Parameters<typeof partyFormToRememberFields>[0];
}): Promise<void> {
  const tasks: Promise<unknown>[] = [];
  if (parties.shipper.companyName.name.trim()) {
    tasks.push(
      rememberPartyContact("shipper", partyFormToRememberFields(parties.shipper)).catch(() => null),
    );
  }
  if (parties.consignee.companyName.name.trim()) {
    tasks.push(
      rememberPartyContact("consignee", partyFormToRememberFields(parties.consignee)).catch(
        () => null,
      ),
    );
  }
  if (tasks.length) await Promise.all(tasks);
}

/** Format last_used_at for dropdown / popup. */
export function formatLastUsed(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Never";
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startThat = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((startToday.getTime() - startThat.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays > 1 && diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString();
}
