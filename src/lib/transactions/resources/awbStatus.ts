export type AwbEntryStatus = {
  awbUserId: string | null;
  podUserId: string | null;
  manifestNo: string;
  manifestDate: string | null;
  invoiceNo: string | null;
  debitNoteNo: string;
  creditNoteNo: string;
  flightNo: string | null;
};

export async function getAwbEntryStatus(args: {
  userId?: string | null;
}): Promise<AwbEntryStatus> {
  try {
    const { authorizedFetch } = await import("@/lib/security/authorized-fetch");
    const res = await authorizedFetch("/api/awb-entry/status");
    if (res.ok) {
      return (await res.json()) as AwbEntryStatus;
    }
  } catch {
    // API endpoint unavailable or client fallback
  }

  const fallbackUser = args.userId ? args.userId.toUpperCase() : "ADMINISTRATOR";

  return {
    awbUserId: fallbackUser,
    podUserId: null,
    manifestNo: "0",
    manifestDate: null,
    invoiceNo: null,
    debitNoteNo: "0",
    creditNoteNo: "0",
    flightNo: null,
  };
}
