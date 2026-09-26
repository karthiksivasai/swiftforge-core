import { supabase } from "@/integrations/supabase/client";

export type LookupPair = { code: string; name: string };

export type ObcChargeLine = {
  id: string;
  description: string;
  rate: string;
  amount: string;
  fuelApply: string;
  fuelAmt: string;
  taxOnFuel: string;
  taxApply: string;
  igst: string;
  sgst: string;
  cgst: string;
  total: string;
  chargesType: string;
};

export type ObcForm = {
  cdNo: string;
  payType: string;
  obc: LookupPair;
  product: LookupPair;
  origin: LookupPair;
  flight: LookupPair;
  destination: LookupPair;
  bookDate: string;
  bookTime: string;
  mawbNo: string;
  deliveryVendor: LookupPair;
  obcService: LookupPair;
  userId: string;
  masterEawb: string;
  locked: boolean;
  consigneeName: string;
  address1: string;
  address2: string;
  address3: string;
  pinCode: string;
  bagDox: string;
  bagNonDox: string;
  actualWeight: string;
  chargeWeight: string;
  manifestNos: string[];
  chargeLines: ObcChargeLine[];
};

export type ObcRow = {
  id: string;
  manifestNo: string;
  despDate: string;
  origin: string;
  destination: string;
  form: ObcForm;
};

export type ObcOperationResult = {
  success: boolean;
  error?: string;
};

/**
 * Fetch list of OBC manifest entries from Supabase.
 */
export async function listObcEntries(): Promise<ObcRow[]> {
  try {
    const { data, error } = await supabase
      .from("obc_entries")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data && data.length > 0) {
      return data.map((item) => ({
        id: String(item.id),
        manifestNo: String(item.manifest_no || item.manifestNo || ""),
        despDate: String(item.desp_date || item.despDate || ""),
        origin: String(item.origin || ""),
        destination: String(item.destination || ""),
        form: (item.form_data || item.form || {}) as ObcForm,
      }));
    }
  } catch {
    /* Fallback if table doesn't exist yet */
  }

  // Fallback to query manifests table where manifest_type = 'OBC'
  try {
    const { data, error } = await supabase
      .from("manifests")
      .select("id, manifest_no, manifest_date, origin_code, destination_code, obc_name")
      .eq("manifest_type", "OBC")
      .is("deleted_at", null);

    if (!error && data && data.length > 0) {
      return data.map((m) => ({
        id: String(m.id),
        manifestNo: String(m.manifest_no),
        despDate: String(m.manifest_date || ""),
        origin: String(m.origin_code || "HYD"),
        destination: String(m.destination_code || "BOM"),
        form: {
          cdNo: "",
          payType: "Cash",
          obc: { code: "", name: m.obc_name || "" },
          product: { code: "", name: "" },
          origin: { code: m.origin_code || "HYD", name: m.origin_code || "HYDERABAD" },
          flight: { code: "", name: "" },
          destination: { code: m.destination_code || "", name: m.destination_code || "" },
          bookDate: m.manifest_date || "",
          bookTime: "0000",
          mawbNo: "",
          deliveryVendor: { code: "", name: "" },
          obcService: { code: "", name: "" },
          userId: "SURYAA",
          masterEawb: "",
          locked: false,
          consigneeName: "",
          address1: "",
          address2: "",
          address3: "",
          pinCode: "",
          bagDox: "",
          bagNonDox: "",
          actualWeight: "",
          chargeWeight: "",
          manifestNos: [],
          chargeLines: [],
        },
      }));
    }
  } catch {
    /* Fallback query error */
  }

  return [];
}

/**
 * Persist an OBC entry (create or update) to Supabase.
 */
export async function saveObcEntry(row: ObcRow): Promise<ObcOperationResult> {
  if (!row.manifestNo) {
    return { success: false, error: "Manifest No is required" };
  }

  try {
    const payload = {
      id: row.id,
      manifest_no: row.manifestNo,
      desp_date: row.despDate,
      origin: row.origin,
      destination: row.destination,
      form_data: row.form,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("obc_entries")
      .upsert(payload, { onConflict: "id" });

    if (error) {
      // Fallback to update manifests table
      const mPayload = {
        id: row.id,
        manifest_no: row.manifestNo,
        manifest_date: row.despDate,
        origin_code: row.origin,
        destination_code: row.destination,
        manifest_type: "OBC",
        obc_name: row.form.obc.name || row.form.obc.code,
      };
      await supabase.from("manifests").upsert(mPayload, { onConflict: "id" });
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Delete an OBC entry by ID from Supabase.
 */
export async function deleteObcEntry(id: string): Promise<ObcOperationResult> {
  if (!id) {
    return { success: false, error: "ID is required for deletion" };
  }

  try {
    const { error } = await supabase
      .from("obc_entries")
      .delete()
      .eq("id", id);

    if (error) {
      await supabase.from("manifests").delete().eq("id", id);
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
