import { getBranchAwbStockSummary } from "./awbStock";

export type AwbEntryStatus = {
  awbUserId: string | null;
  podUserId: string | null;
  limit: number | null;
  used: number | null;
  balance: number | null;
  manifestNo: string;
  manifestDate: string | null;
  invoiceNo: string | null;
  debitNoteNo: string;
  creditNoteNo: string;
  flightNo: string | null;
};

export async function getAwbEntryStatus(args: {
  userId?: string | null;
  branchName?: string | null;
  branchId?: string | null;
}): Promise<AwbEntryStatus> {
  try {
    const { authorizedFetch } = await import("@/lib/security/authorized-fetch");
    const res = await authorizedFetch("/api/awb-entry/status");
    if (res.ok) {
      const data = (await res.json()) as AwbEntryStatus;
      // Guarantee balance live calculation: balance = limit - used
      if (typeof data.limit === "number" && typeof data.used === "number") {
        data.balance = data.limit - data.used;
      }
      return data;
    }
  } catch {
    // API endpoint unavailable or client fallback
  }

  // Client-side fallback using stock summary RPC
  let limit: number | null = null;
  let used: number | null = null;
  let balance: number | null = null;

  try {
    const stock = await getBranchAwbStockSummary(args.branchId || undefined);
    limit = stock.limit;
    used = stock.used;
    balance = stock.limit - stock.used;
  } catch {
    // ignore stock fetch error
  }

  const fallbackUser = args.userId ? args.userId.toUpperCase() : "ADMINISTRATOR";

  return {
    awbUserId: fallbackUser,
    podUserId: null,
    limit,
    used,
    balance: limit !== null && used !== null ? limit - used : null,
    manifestNo: "0",
    manifestDate: null,
    invoiceNo: null,
    debitNoteNo: "0",
    creditNoteNo: "0",
    flightNo: null,
  };
}
