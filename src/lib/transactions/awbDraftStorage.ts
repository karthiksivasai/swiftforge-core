/**
 * AWB Entry draft persistence — localStorage (instant) + optional backend sync.
 * One unfinished draft per user; cleared on successful save/book.
 */
import { supabase } from "@/integrations/supabase/client";

export const AWB_DRAFT_VERSION = 1 as const;
export const AWB_DRAFT_STORAGE_PREFIX = "cms.awb-entry.draft.v1";
export const AWB_DRAFT_AUTOSAVE_MS = 700;

export type AwbDraftLookupPair = { id?: string; code: string; name: string };

/** Serializable snapshot of the AWB entry UI (full form + editor chrome). */
export type AwbEntryDraftPayload = {
  version: typeof AWB_DRAFT_VERSION;
  savedAt: string;
  userKey: string;
  form: unknown;
  editing: {
    id: string;
    rowVersion?: number;
    status?: string;
  } | null;
  activeTab: string;
  piecesDraft: unknown;
  chargeDraft: unknown;
  proformaDraft: unknown;
  vendorChargeDraft: unknown;
};

function storageKey(userKey: string): string {
  return `${AWB_DRAFT_STORAGE_PREFIX}:${userKey || "anon"}`;
}

export function draftUserKey(profileId?: string | null, authUserId?: string | null): string {
  return profileId || authUserId || "demo";
}

/** True when the form has enough content to bother restoring. */
export function isAwbDraftWorthKeeping(form: unknown): boolean {
  if (!form || typeof form !== "object") return false;
  const f = form as Record<string, unknown>;
  const pair = (v: unknown) => {
    if (!v || typeof v !== "object") return false;
    const p = v as AwbDraftLookupPair;
    return Boolean((p.code ?? "").trim() || (p.name ?? "").trim());
  };
  const party = f.shipper as Record<string, unknown> | undefined;
  const consignee = f.consignee as Record<string, unknown> | undefined;
  const lines = (v: unknown) => Array.isArray(v) && v.length > 0;

  return Boolean(
    pair(f.clientName) ||
      pair(f.product) ||
      pair(f.vendor) ||
      pair(f.service) ||
      pair(party?.companyName) ||
      pair(consignee?.companyName) ||
      pair(consignee?.origin) ||
      String(f.referenceNo ?? "").trim() ||
      String(f.instruction ?? "").trim() ||
      String(f.content ?? "").trim() ||
      String(f.airline ?? "").trim() ||
      String(party?.address1 ?? "").trim() ||
      String(consignee?.address1 ?? "").trim() ||
      String(party?.mobileNo ?? "").trim() ||
      String(consignee?.mobileNo ?? "").trim() ||
      lines(f.piecesLines) ||
      lines(f.chargeLines) ||
      (f.proforma &&
        typeof f.proforma === "object" &&
        lines((f.proforma as { lines?: unknown }).lines)) ||
      (f.forwarding &&
        typeof f.forwarding === "object" &&
        lines((f.forwarding as { vendorChargeLines?: unknown }).vendorChargeLines)) ||
      (f.kyc && typeof f.kyc === "object" && lines((f.kyc as { documents?: unknown }).documents)),
  );
}

export function readLocalAwbDraft(userKey: string): AwbEntryDraftPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(userKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AwbEntryDraftPayload;
    if (!parsed || parsed.version !== AWB_DRAFT_VERSION) return null;
    if (!isAwbDraftWorthKeeping(parsed.form)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeLocalAwbDraft(draft: AwbEntryDraftPayload): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(draft.userKey), JSON.stringify(draft));
  } catch {
    /* quota / private mode — ignore */
  }
}

export function clearLocalAwbDraft(userKey: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(userKey));
  } catch {
    /* ignore */
  }
}

export async function fetchRemoteAwbDraft(): Promise<AwbEntryDraftPayload | null> {
  const { data, error } = await supabase.rpc("get_awb_entry_draft");
  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object") return null;
  const parsed = data as AwbEntryDraftPayload;
  if (parsed.version !== AWB_DRAFT_VERSION) return null;
  if (!isAwbDraftWorthKeeping(parsed.form)) return null;
  return parsed;
}

export async function upsertRemoteAwbDraft(draft: AwbEntryDraftPayload): Promise<void> {
  const { error } = await supabase.rpc("upsert_awb_entry_draft", { p_payload: draft });
  if (error) throw new Error(error.message);
}

export async function clearRemoteAwbDraft(): Promise<void> {
  const { error } = await supabase.rpc("clear_awb_entry_draft");
  if (error) throw new Error(error.message);
}

/** Load draft: local first (instant), then merge newer remote if authenticated. */
export async function loadAwbDraft(args: {
  userKey: string;
  syncRemote: boolean;
}): Promise<AwbEntryDraftPayload | null> {
  const local = readLocalAwbDraft(args.userKey);
  if (!args.syncRemote) return local;

  try {
    const remote = await fetchRemoteAwbDraft();
    if (!remote) return local;
    if (!local) {
      writeLocalAwbDraft({ ...remote, userKey: args.userKey });
      return { ...remote, userKey: args.userKey };
    }
    const localTs = Date.parse(local.savedAt) || 0;
    const remoteTs = Date.parse(remote.savedAt) || 0;
    if (remoteTs >= localTs) {
      const merged = { ...remote, userKey: args.userKey };
      writeLocalAwbDraft(merged);
      return merged;
    }
    return local;
  } catch {
    return local;
  }
}

/** Persist draft locally always; best-effort remote when authenticated. */
export async function persistAwbDraft(args: {
  draft: AwbEntryDraftPayload;
  syncRemote: boolean;
}): Promise<void> {
  writeLocalAwbDraft(args.draft);
  if (!args.syncRemote) return;
  try {
    await upsertRemoteAwbDraft(args.draft);
  } catch {
    /* offline / permission — local still holds the draft */
  }
}

export async function clearAwbDraft(args: {
  userKey: string;
  syncRemote: boolean;
}): Promise<void> {
  clearLocalAwbDraft(args.userKey);
  if (!args.syncRemote) return;
  try {
    await clearRemoteAwbDraft();
  } catch {
    /* ignore */
  }
}

export function formatDraftSavedAt(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
