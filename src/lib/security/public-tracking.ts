const TIMELINE_KEYS = ["status_text", "event_date", "event_time", "source", "created_at", "event_type"] as const;

function pickTimeline(value: unknown): Array<Record<string, string>> {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const out: Record<string, string> = {};
    for (const key of TIMELINE_KEYS) {
      const raw = row[key];
      if (raw != null && String(raw).trim()) out[key] = String(raw);
    }
    return out;
  });
}

/** Customer-safe tracking payload. Drops phones, remarks, charges, and any secret fields. */
export function toPublicTrackingView(raw: Record<string, unknown>): {
  found: boolean;
  shipment_number?: string;
  carrier_tracking_number?: string | null;
  current_status?: string;
  origin?: string;
  destination?: string;
  carrier_name?: string;
  pod_status?: string | null;
  estimated_delivery?: string | null;
  tracking_timeline: Array<Record<string, string>>;
  shipment_timeline: Array<Record<string, string>>;
} {
  if (raw.found !== true) return { found: false, tracking_timeline: [], shipment_timeline: [] };
  return {
    found: true,
    shipment_number: raw.shipment_number ? String(raw.shipment_number) : undefined,
    carrier_tracking_number: raw.carrier_tracking_number != null ? String(raw.carrier_tracking_number) : null,
    current_status: raw.current_status ? String(raw.current_status) : undefined,
    origin: raw.origin != null ? String(raw.origin) : undefined,
    destination: raw.destination != null ? String(raw.destination) : undefined,
    carrier_name: raw.carrier_name != null ? String(raw.carrier_name) : undefined,
    pod_status: raw.pod_status != null ? String(raw.pod_status) : null,
    estimated_delivery: raw.estimated_delivery != null ? String(raw.estimated_delivery) : null,
    tracking_timeline: pickTimeline(raw.tracking_timeline),
    shipment_timeline: pickTimeline(raw.shipment_timeline),
  };
}
