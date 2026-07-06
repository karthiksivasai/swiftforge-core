import { createFileRoute } from "@tanstack/react-router";
import { useState, type KeyboardEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { FieldWrapper, MasterBreadcrumb } from "@/components/master-table-kit";

const MISS_ROUTE_EVENT = "Shipment Mis routed";

type MissRouteScanRecord = {
  id: string;
  scanDate: string;
  scanTime: string;
  serviceCenter: string;
  awbNo: string;
  event: string;
};

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const nowScanTime = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
};

const formatDisplayDate = (iso: string) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
};

export const Route = createFileRoute("/transaction/miss-route-scan")({
  head: () => ({
    meta: [
      { title: "Miss Route Scan — Transaction — Courier ERP" },
      {
        name: "description",
        content: "Scan shipments that were mis-routed at the service centre.",
      },
    ],
  }),
  component: MissRouteScanPage,
});

function MissRouteScanPage() {
  const [records, setRecords] = useState<MissRouteScanRecord[]>([]);
  const [sessionCount, setSessionCount] = useState(0);
  const [awbNo, setAwbNo] = useState("");

  const displayScanDate = todayIso();
  const displayScanTime = nowScanTime();
  const serviceCenter = "HYD";

  const handleSave = () => {
    const awb = awbNo.trim();
    if (!awb) return toast.error("AWB No is required");

    const payload: MissRouteScanRecord = {
      id: crypto.randomUUID(),
      scanDate: displayScanDate,
      scanTime: displayScanTime,
      serviceCenter,
      awbNo: awb,
      event: MISS_ROUTE_EVENT,
    };

    setRecords((prev) => [payload, ...prev]);
    setSessionCount((count) => count + 1);
    setAwbNo("");
    toast.success(`AWB ${awb} saved`);
  };

  const onAwbKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    }
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-5 px-4 py-6 md:px-8 md:py-8">
      <MasterBreadcrumb trail={["Transaction", "Miss Route Scan"]} />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Miss Route Scan</h1>
        <p className="text-sm text-muted-foreground">
          Record mis-routed shipments scanned at the service centre.
        </p>
      </div>

      <Card className="min-w-0 overflow-hidden border p-4 md:p-6">
        <FormSection title="Inscan">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <FieldWrapper label="Scan Date" required>
              <Input value={formatDisplayDate(displayScanDate)} disabled readOnly />
            </FieldWrapper>
            <FieldWrapper label="Scan Time" required>
              <Input value={displayScanTime} disabled readOnly placeholder="HHmm" />
            </FieldWrapper>
            <FieldWrapper label="Service Center">
              <Input value={serviceCenter} disabled readOnly />
            </FieldWrapper>
            <FieldWrapper label="AWB No." required>
              <Input
                value={awbNo}
                onChange={(e) => setAwbNo(e.target.value)}
                onKeyDown={onAwbKeyDown}
                autoFocus
              />
            </FieldWrapper>
          </div>

          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
              <p>
                <span className="font-medium text-foreground">Event</span>{" "}
                <span className="text-muted-foreground">{MISS_ROUTE_EVENT}</span>
              </p>
              <p>
                <span className="font-medium text-foreground">Count</span>{" "}
                <span className="text-muted-foreground">{sessionCount || ""}</span>
              </p>
            </div>

            <Button
              onClick={handleSave}
              className="min-w-24 bg-emerald-600 text-white hover:bg-emerald-600/90"
            >
              Save
            </Button>
          </div>
        </FormSection>
      </Card>

      {records.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {records.length} miss route scan{records.length === 1 ? "" : "s"} recorded this session.
        </p>
      ) : null}
    </div>
  );
}

function FormSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="relative rounded-md border p-4 pt-6">
      <span className="absolute -top-2.5 left-3 bg-card px-2 text-sm font-medium text-foreground">
        {title}
      </span>
      {children}
    </div>
  );
}
