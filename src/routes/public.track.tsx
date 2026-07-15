import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toErrorMessage } from "@/lib/masters/screen";
import { publicTrackShipment, type PublicTrackingResult } from "@/lib/integrations/webhooks";

export const Route = createFileRoute("/public/track")({
  head: () => ({
    meta: [
      { title: "Track Shipment — Public" },
      {
        name: "description",
        content: "Track a shipment by AWB or carrier tracking number.",
      },
    ],
  }),
  component: PublicTrackPage,
});

function PublicTrackPage() {
  const [awbNo, setAwbNo] = useState("");
  const [carrierTrackingNo, setCarrierTrackingNo] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PublicTrackingResult | null>(null);

  const onSearch = async () => {
    if (!awbNo.trim() && !carrierTrackingNo.trim()) {
      return toast.error("Enter an AWB number or carrier tracking number");
    }
    setBusy(true);
    try {
      const data = await publicTrackShipment({
        awbNo: awbNo.trim() || null,
        carrierTrackingNo: carrierTrackingNo.trim() || null,
      });
      setResult(data);
      if (!data.found) toast.error("No shipment found");
      else toast.success(`Found ${data.shipment_number}`);
    } catch (e) {
      setResult(null);
      toast.error(toErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-6 md:p-10">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Public tracking</p>
        <h1 className="text-3xl font-semibold tracking-tight">Track your shipment</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter an AWB or carrier tracking number. No sign-in required.
        </p>
      </div>

      <Card className="border p-4 md:p-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-medium">
            AWB number
            <Input
              value={awbNo}
              onChange={(e) => setAwbNo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void onSearch();
              }}
              className="h-10"
              placeholder="e.g. 30403927"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium">
            Carrier tracking number
            <Input
              value={carrierTrackingNo}
              onChange={(e) => setCarrierTrackingNo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void onSearch();
              }}
              className="h-10"
              placeholder="Optional"
            />
          </label>
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            disabled={busy}
            onClick={() => void onSearch()}
            className="h-9 gap-1.5 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
          >
            <Search className="h-4 w-4" />
            Track
          </Button>
        </div>
      </Card>

      {result?.found ? (
        <Card className="space-y-4 border p-4 md:p-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <Info label="Shipment number" value={result.shipment_number} />
            <Info label="Current status" value={result.current_status} />
            <Info label="Origin" value={result.origin} />
            <Info label="Destination" value={result.destination} />
            <Info label="Carrier" value={result.carrier_name} />
            <Info label="POD status" value={result.pod_status ?? "—"} />
            <Info label="Carrier tracking" value={result.carrier_tracking_number ?? "—"} />
            <Info label="Estimated delivery" value={result.estimated_delivery ?? "—"} />
          </div>

          <div>
            <h2 className="mb-2 text-sm font-semibold">Tracking timeline</h2>
            {(result.tracking_timeline ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No tracking events yet.</p>
            ) : (
              <ul className="space-y-2">
                {(result.tracking_timeline ?? []).map((ev, i) => (
                  <li key={i} className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                    <div className="font-medium">{String(ev.status_text ?? "")}</div>
                    <div className="text-xs text-muted-foreground">
                      {[ev.event_date, ev.event_time, ev.remark]
                        .filter(Boolean)
                        .map(String)
                        .join(" · ")}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value || "—"}</div>
    </div>
  );
}
