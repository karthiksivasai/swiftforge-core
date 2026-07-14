import { describe, expect, it } from "vitest";
import {
  trackingCommentSchema,
  trackingHoldSchema,
  trackingProgressSchema,
} from "@/lib/transactions/schemas/tracking";
import { mapTrackingToAwbQuery } from "@/lib/transactions/trackingUiMap";

describe("tracking schemas", () => {
  it("requires progress date and comment text", () => {
    expect(() => trackingProgressSchema.parse({ event_date: "" })).toThrow();
    const ok = trackingProgressSchema.parse({
      event_date: "2026-07-14",
      event_time: "1430",
      remark: "ok",
    });
    expect(ok.allow_if_delivered).toBe(false);
    expect(() => trackingCommentSchema.parse({ comment: "" })).toThrow();
  });

  it("accepts hold fields", () => {
    const hold = trackingHoldSchema.parse({ remark: "docs", send_mail: true });
    expect(hold.send_mail).toBe(true);
  });
});

describe("trackingUiMap", () => {
  it("maps timeline payload into AWB Query shape", () => {
    const mapped = mapTrackingToAwbQuery({
      found: true,
      awb_no: "A1",
      current_status: "BOOKED",
      is_hold: false,
      shipment: {
        awb_no: "A1",
        row_version: 2,
        current_status: "BOOKED",
        customer_code: "C1",
        customer_name: "Client",
        origin_code: "HYD",
        destination_code: "BLR",
        book_date: "2026-07-14",
        pieces: 1,
      },
      tracking_events: [
        {
          event_date: "2026-07-14",
          event_time: "14:30:00",
          status_text: "Booked",
          remark: null,
          user_id: "u1",
          payload: { service_center_code: "HYD" },
        },
      ],
      shipment_events: [
        { event_type: "BOOKED", event_text: "Booked", created_at: "2026-07-14T10:00:00Z" },
      ],
      comments: [{ comment: "hi", commented_at: "2026-07-14T11:00:00Z", created_by: "u2" }],
      holds: [],
      pod: null,
    });
    expect(mapped?.awbNo).toBe("A1");
    expect(mapped?.progress).toHaveLength(1);
    expect(mapped?.comments[0]?.comment).toBe("hi");
    expect(mapped?.shipmentDetails.origin).toBe("HYD");
  });
});
