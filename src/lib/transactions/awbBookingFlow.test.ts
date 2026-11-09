import { describe, expect, it } from "vitest";

import { consigneeBookingErrors } from "@/lib/transactions/awbEntryRules";

/**
 * The Save button books in one step. This walks that flow without a database:
 * a failed check writes nothing, a passing save is BOOKED, a lock blocks the
 * next save, an admin unlock records who and when, and the next save stays BOOKED.
 * The live AWB cases check the same steps against the database.
 */
type BookedAwb = {
  awbNo: string;
  status: "BOOKED";
  locked: boolean;
  lockedBy: string | null;
  lockedAt: string | null;
  unlockedBy: string | null;
  unlockedAt: string | null;
  total: number;
  reference: string;
  audit: Array<{
    action: string;
    by: string;
    at: string;
    lockedBy?: string | null;
    lockedAt?: string | null;
  }>;
};

type SaveInput = {
  consignee: {
    companyName: string;
    address1: string;
    city: string;
    postcode: string;
    country: string;
    phone: string;
  };
  serverTotal: number;
  reference: string;
  lock?: boolean;
};

const admin = { id: "admin-1", canUnlock: true };
const clerk = { id: "clerk-1", canUnlock: false };

function saveAwb(
  current: BookedAwb | null,
  input: SaveInput,
  now: string,
): { awb: BookedAwb | null; errors: string[] } {
  const errors = consigneeBookingErrors(input.consignee);
  if (current?.locked) errors.push("This AWB is locked. An admin has to unlock it before it can be saved.");
  if (!Number.isFinite(input.serverTotal) || input.serverTotal <= 0) {
    errors.push("No customer rate was found for this origin, destination, and product");
  }
  if (errors.length > 0) return { awb: current, errors };

  const awbNo = current?.awbNo ?? "000035";
  return {
    awb: {
      awbNo,
      status: "BOOKED",
      locked: input.lock === true,
      lockedBy: input.lock === true ? admin.id : (current?.lockedBy ?? null),
      lockedAt: input.lock === true ? now : (current?.lockedAt ?? null),
      unlockedBy: current?.unlockedBy ?? null,
      unlockedAt: current?.unlockedAt ?? null,
      total: input.serverTotal,
      reference: input.reference,
      audit: [
        ...(current?.audit ?? []),
        {
          action: current ? "MODIFY" : "BOOK",
          by: admin.id,
          at: now,
        },
      ],
    },
    errors: [],
  };
}

function unlockAwb(awb: BookedAwb, user: { id: string; canUnlock: boolean }, now: string) {
  if (!user.canUnlock) return { awb, error: "Permission denied: txn.awb-unlock" };
  return {
    awb: {
      ...awb,
      locked: false,
      lockedBy: null,
      lockedAt: null,
      unlockedBy: user.id,
      unlockedAt: now,
      audit: [
        ...awb.audit,
        {
          action: "UNLOCK",
          by: user.id,
          at: now,
          lockedBy: awb.lockedBy,
          lockedAt: awb.lockedAt,
        },
      ],
    },
    error: null,
  };
}

const consignee = {
  companyName: "Receiver LLC",
  address1: "1 Market Street",
  city: "New York",
  postcode: "10001",
  country: "United States of America",
  phone: "2125550100",
};

describe("AWB save books, locks, and unlocks", () => {
  it("writes nothing when a required consignee field is missing", () => {
    const result = saveAwb(
      null,
      { ...{ consignee: { ...consignee, phone: "" }, serverTotal: 324.5, reference: "TEST_AWB_A" } },
      "2026-11-09T10:00:00Z",
    );
    expect(result.awb).toBeNull();
    expect(result.errors).toContain("Consignee phone is required");
  });

  it("books, locks, lets an admin unlock, then saves again as BOOKED", () => {
    const booked = saveAwb(
      null,
      { consignee, serverTotal: 324.5, reference: "TEST_AWB_A" },
      "2026-11-09T10:00:00Z",
    );
    expect(booked.errors).toEqual([]);
    expect(booked.awb).toMatchObject({ awbNo: "000035", status: "BOOKED", total: 324.5, locked: false });

    const locked = saveAwb(
      booked.awb,
      { consignee, serverTotal: 324.5, reference: "TEST_AWB_A", lock: true },
      "2026-11-09T10:05:00Z",
    );
    expect(locked.awb).toMatchObject({
      locked: true,
      status: "BOOKED",
      lockedBy: "admin-1",
      lockedAt: "2026-11-09T10:05:00Z",
    });

    const blocked = saveAwb(
      locked.awb,
      { consignee, serverTotal: 400, reference: "TEST_AWB_A" },
      "2026-11-09T10:06:00Z",
    );
    expect(blocked.awb).toBe(locked.awb);
    expect(blocked.errors[0]).toMatch(/locked/i);

    const denied = unlockAwb(locked.awb!, clerk, "2026-11-09T10:07:00Z");
    expect(denied.error).toMatch(/txn.awb-unlock/);
    expect(denied.awb.locked).toBe(true);

    const unlocked = unlockAwb(locked.awb!, admin, "2026-11-09T10:08:00Z");
    expect(unlocked.error).toBeNull();
    expect(unlocked.awb).toMatchObject({
      locked: false,
      lockedBy: null,
      lockedAt: null,
      unlockedBy: "admin-1",
      unlockedAt: "2026-11-09T10:08:00Z",
    });
    expect(unlocked.awb.audit.at(-1)).toEqual({
      action: "UNLOCK",
      by: "admin-1",
      at: "2026-11-09T10:08:00Z",
      lockedBy: "admin-1",
      lockedAt: "2026-11-09T10:05:00Z",
    });

    const edited = saveAwb(
      unlocked.awb,
      { consignee, serverTotal: 649, reference: "TEST_AWB_A" },
      "2026-11-09T10:09:00Z",
    );
    expect(edited.errors).toEqual([]);
    expect(edited.awb).toMatchObject({
      awbNo: "000035",
      status: "BOOKED",
      locked: false,
      total: 649,
    });
    expect(edited.awb?.audit.map((row) => row.action)).toEqual(["BOOK", "MODIFY", "UNLOCK", "MODIFY"]);
  });
});
