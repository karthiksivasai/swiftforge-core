import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Filter, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FieldWrapper, IconButton, MasterBreadcrumb } from "@/components/master-table-kit";
import { MasterLookupDialog } from "@/components/master-lookup-dialog";
import { type LookupKey, type LookupOption } from "@/lib/master-lookups";
import { useAuth } from "@/lib/auth";
import { lookup } from "@/lib/masters/core/lookup";
import { toErrorMessage } from "@/lib/masters/screen";
import { getManifestInscanBoard, scanManifest } from "@/lib/transactions/resources/manifestInscan";
import {
  countsFromBoard,
  mapInscanScanResult,
  pendingLinesFromBoard,
  uiModeToRpcMode,
  validateInscanAttempt,
} from "@/lib/transactions/manifestInscanUiMap";

type LookupPair = { code: string; name: string };
type ScanMode = "bag" | "awb";

type InscanHeader = {
  inscanDate: string;
  inscanTime: string;
  serviceCentre: LookupPair;
  manifestNo: string;
  manifestId: string;
  bagNo: string;
};

type BagLineDraft = {
  manifestNo: string;
  bagNo: string;
  awbNo: string;
  pieces: string;
  weight: string;
};

type AwbLineDraft = {
  manifestNo: string;
  bagNo: string;
  awbNo: string;
  weight: string;
  length: string;
  breadth: string;
  height: string;
  volWeight: string;
  remark: string;
  bookingWeight: boolean;
};

type ScannedLine =
  ({ id: string; mode: "bag" } & BagLineDraft) | ({ id: string; mode: "awb" } & AwbLineDraft);

type InscanFilterType = "" | "short" | "excess";

type InscanFilter = {
  fromDate: string;
  toDate: string;
  manifestNo: string;
  destination: LookupPair;
  inscanType: InscanFilterType;
};

const INSCAN_TYPE_OPTIONS = [
  { value: "", label: "Inscan Type" },
  { value: "short", label: "Short" },
  { value: "excess", label: "Excess" },
] as const;

const emptyPair = (): LookupPair => ({ code: "", name: "" });

const todayIso = () => new Date().toISOString().slice(0, 10);

const nowInscanTime = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
};

const emptyHeader = (): InscanHeader => ({
  inscanDate: todayIso(),
  inscanTime: nowInscanTime(),
  serviceCentre: emptyPair(),
  manifestNo: "",
  manifestId: "",
  bagNo: "",
});

const emptyBagLine = (header: InscanHeader): BagLineDraft => ({
  manifestNo: header.manifestNo,
  bagNo: header.bagNo,
  awbNo: "",
  pieces: "",
  weight: "",
});

const emptyAwbLine = (header: InscanHeader): AwbLineDraft => ({
  manifestNo: header.manifestNo,
  bagNo: header.bagNo,
  awbNo: "",
  weight: "",
  length: "",
  breadth: "",
  height: "",
  volWeight: "",
  remark: "",
  bookingWeight: false,
});

const emptyFilter = (): InscanFilter => ({
  fromDate: todayIso(),
  toDate: todayIso(),
  manifestNo: "",
  destination: emptyPair(),
  inscanType: "",
});

export const Route = createFileRoute("/transaction/manifest-in-scan")({
  head: () => ({
    meta: [
      { title: "Manifest In Scan — Transaction — Courier ERP" },
      {
        name: "description",
        content: "Inscan manifest bags and AWBs at the service centre.",
      },
    ],
  }),
  component: ManifestInScanPage,
});

function ManifestInScanPage() {
  const { isAuthenticated: authed } = useAuth();
  const queryClient = useQueryClient();
  const [scanMode, setScanMode] = useState<ScanMode>("bag");
  const [header, setHeader] = useState<InscanHeader>(emptyHeader);
  const [bagLine, setBagLine] = useState<BagLineDraft>(emptyBagLine(emptyHeader()));
  const [awbLine, setAwbLine] = useState<AwbLineDraft>(emptyAwbLine(emptyHeader()));
  const [lines, setLines] = useState<ScannedLine[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterDraft, setFilterDraft] = useState<InscanFilter>(emptyFilter);
  const [filterApplied, setFilterApplied] = useState<InscanFilter | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedShipmentId, setSelectedShipmentId] = useState<string>("");

  const boardQuery = useQuery({
    queryKey: ["manifest-inscan", "board", header.manifestId],
    queryFn: () => getManifestInscanBoard(header.manifestId),
    enabled: authed && Boolean(header.manifestId),
  });

  const liveCounts = boardQuery.data ? countsFromBoard(boardQuery.data) : null;
  const pendingLines = boardQuery.data ? pendingLinesFromBoard(boardQuery.data.lines) : [];

  const syncLineFromHeader = (nextHeader: InscanHeader) => {
    setBagLine((line) => ({
      ...line,
      manifestNo: nextHeader.manifestNo,
      bagNo: nextHeader.bagNo,
    }));
    setAwbLine((line) => ({
      ...line,
      manifestNo: nextHeader.manifestNo,
      bagNo: nextHeader.bagNo,
    }));
  };

  const updateHeader = (patch: Partial<InscanHeader>) => {
    setHeader((prev) => {
      const next = { ...prev, ...patch };
      syncLineFromHeader(next);
      return next;
    });
  };

  const resolveManifest = async (manifestNo: string): Promise<string | null> => {
    const q = manifestNo.trim();
    if (!q) return null;
    if (!authed) return header.manifestId || "demo-manifest";
    const hits = await lookup("manifest", q, 20);
    const exact = hits.find((h) => h.code.toLowerCase() === q.toLowerCase()) ?? hits[0];
    if (!exact) {
      toast.error("CLOSED manifest not found");
      return null;
    }
    updateHeader({ manifestNo: exact.code, manifestId: exact.id });
    await queryClient.invalidateQueries({ queryKey: ["manifest-inscan", "board"] });
    return exact.id;
  };

  const resetLineDraft = () => {
    setBagLine(emptyBagLine(header));
    setAwbLine(emptyAwbLine(header));
    setSelectedShipmentId("");
  };

  const handleReset = () => {
    resetLineDraft();
    toast.success("Line fields reset");
  };

  const currentAwb = () => (scanMode === "bag" ? bagLine.awbNo.trim() : awbLine.awbNo.trim());

  const handleSave = async () => {
    if (!header.inscanDate) return toast.error("Manifest Inscan Date is required");
    if (!header.inscanTime.trim()) return toast.error("Manifest Inscan Time is required");

    const awbNo = currentAwb();
    const bagNo =
      (scanMode === "bag" ? bagLine.bagNo : awbLine.bagNo).trim() || header.bagNo.trim();

    if (selectedShipmentId && !awbNo && boardQuery.data) {
      const line = boardQuery.data.lines.find((l) => l.shipment_id === selectedShipmentId);
      if (line) {
        if (scanMode === "bag") setBagLine((l) => ({ ...l, awbNo: line.awb_no }));
        else setAwbLine((l) => ({ ...l, awbNo: line.awb_no }));
      }
    }

    const effectiveAwb =
      awbNo ||
      (selectedShipmentId
        ? (boardQuery.data?.lines.find((l) => l.shipment_id === selectedShipmentId)?.awb_no ?? "")
        : "");

    if (authed) {
      setSaving(true);
      try {
        let manifestId = header.manifestId;
        if (!manifestId) {
          manifestId = (await resolveManifest(header.manifestNo)) ?? "";
        }
        if (!manifestId) return;

        const board = boardQuery.data ?? (await getManifestInscanBoard(manifestId));
        const known = new Set(board.lines.map((l) => l.awb_no));
        const scanned = new Set(
          board.lines.filter((l) => l.scanned).map((l) => l.awb_no.toUpperCase()),
        );
        const statusMap = new Map(board.lines.map((l) => [l.awb_no, l.shipment_status]));

        const decision = validateInscanAttempt(
          {
            awbNo: effectiveAwb,
            shipmentId: selectedShipmentId || undefined,
            bagNo,
            mode: scanMode,
          },
          {
            manifestId,
            knownAwbs: known,
            scannedAwbs: scanned,
            shipmentStatusByAwb: statusMap,
          },
        );
        if (decision.kind === "invalid") {
          toast.error(decision.message);
          return;
        }
        if (decision.kind === "duplicate") {
          toast.warning(decision.message);
          return;
        }

        const result = await scanManifest({
          manifest_id: manifestId,
          awb_no: effectiveAwb || null,
          shipment_id: selectedShipmentId || null,
          bag_no: bagNo || null,
          mode: uiModeToRpcMode(scanMode),
        });
        const mapped = mapInscanScanResult(result);
        if (mapped.toast === "warning") toast.warning(mapped.message);
        else if (mapped.toast === "error") toast.error(mapped.message);
        else toast.success(mapped.message);

        if (!result.duplicate) {
          if (scanMode === "bag") {
            setLines((prev) => [
              {
                id: crypto.randomUUID(),
                mode: "bag",
                manifestNo: header.manifestNo,
                bagNo,
                awbNo: result.awb_no ?? effectiveAwb,
                pieces: bagLine.pieces.trim(),
                weight: bagLine.weight.trim(),
              },
              ...prev,
            ]);
            setBagLine((line) => ({
              ...emptyBagLine(header),
              manifestNo: line.manifestNo,
              bagNo: line.bagNo,
            }));
          } else {
            setLines((prev) => [
              {
                id: crypto.randomUUID(),
                mode: "awb",
                manifestNo: header.manifestNo,
                bagNo,
                awbNo: result.awb_no ?? effectiveAwb,
                weight: awbLine.weight.trim(),
                length: awbLine.length.trim(),
                breadth: awbLine.breadth.trim(),
                height: awbLine.height.trim(),
                volWeight: awbLine.volWeight.trim(),
                remark: awbLine.remark.trim(),
                bookingWeight: awbLine.bookingWeight,
              },
              ...prev,
            ]);
            setAwbLine((line) => ({
              ...emptyAwbLine(header),
              manifestNo: line.manifestNo,
              bagNo: line.bagNo,
            }));
          }
          setSelectedShipmentId("");
        }
        await queryClient.invalidateQueries({ queryKey: ["manifest-inscan", "board", manifestId] });
      } catch (err) {
        toast.error(toErrorMessage(err));
      } finally {
        setSaving(false);
      }
      return;
    }

    // Demo mode
    const scannedDemo = new Set(lines.map((l) => l.awbNo.trim().toUpperCase()).filter(Boolean));
    const decision = validateInscanAttempt(
      { awbNo: effectiveAwb, mode: scanMode, bagNo },
      {
        manifestNo: header.manifestNo || "DEMO",
        scannedAwbs: scannedDemo,
      },
    );
    if (decision.kind === "invalid") return toast.error(decision.message);
    if (decision.kind === "duplicate") return toast.warning(decision.message);

    if (scanMode === "bag") {
      if (!effectiveAwb) return toast.error("AWB No is required");
      const row: ScannedLine = {
        id: crypto.randomUUID(),
        mode: "bag",
        manifestNo: bagLine.manifestNo.trim() || header.manifestNo.trim(),
        bagNo,
        awbNo: effectiveAwb,
        pieces: bagLine.pieces.trim(),
        weight: bagLine.weight.trim(),
      };
      setLines((prev) => [row, ...prev]);
      setBagLine((line) => ({
        ...emptyBagLine(header),
        manifestNo: line.manifestNo,
        bagNo: line.bagNo,
      }));
      toast.success("Bag/Manifest line saved");
      return;
    }

    if (!effectiveAwb) return toast.error("AWB No is required");
    const row: ScannedLine = {
      id: crypto.randomUUID(),
      mode: "awb",
      manifestNo: awbLine.manifestNo.trim() || header.manifestNo.trim(),
      bagNo,
      awbNo: effectiveAwb,
      weight: awbLine.weight.trim(),
      length: awbLine.length.trim(),
      breadth: awbLine.breadth.trim(),
      height: awbLine.height.trim(),
      volWeight: awbLine.volWeight.trim(),
      remark: awbLine.remark.trim(),
      bookingWeight: awbLine.bookingWeight,
    };
    setLines((prev) => [row, ...prev]);
    setAwbLine((line) => ({
      ...emptyAwbLine(header),
      manifestNo: line.manifestNo,
      bagNo: line.bagNo,
    }));
    toast.success("AWB line saved");
  };

  const onLineEnter = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleSave();
    }
  };

  const openFilter = () => {
    setFilterDraft(filterApplied ?? emptyFilter());
    setFilterOpen(true);
  };

  const closeFilter = () => {
    setFilterOpen(false);
  };

  const handleFilterView = () => {
    if (!filterDraft.fromDate) return toast.error("From Date is required");
    if (!filterDraft.toDate) return toast.error("To Date is required");
    setFilterApplied({ ...filterDraft });
    setFilterOpen(false);
    toast.success("Filter applied — view will be enabled with backend wiring");
  };

  const filteredLines = useMemo(() => {
    if (!filterApplied) return lines;
    return lines.filter((line) => {
      if (filterApplied.manifestNo.trim()) {
        const manifest = line.manifestNo.toLowerCase();
        if (!manifest.includes(filterApplied.manifestNo.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [lines, filterApplied]);

  const displayCounts = useMemo(() => {
    if (authed && liveCounts) {
      return {
        scanned: liveCounts.scanned,
        pending: liveCounts.pending,
        total: liveCounts.scanned + liveCounts.pending,
        pieces: liveCounts.scanned,
      };
    }
    const source = filterApplied ? filteredLines : lines;
    const total = source.length;
    const pieces = source.reduce((sum, line) => {
      if (line.mode === "bag") {
        const n = Number.parseInt(line.pieces, 10);
        return sum + (Number.isFinite(n) ? n : 0);
      }
      return sum + 1;
    }, 0);
    return { scanned: total, pending: 0, total, pieces };
  }, [authed, liveCounts, filteredLines, filterApplied, lines]);

  const onSelectPendingShipment = (shipmentId: string) => {
    setSelectedShipmentId(shipmentId);
    const line = boardQuery.data?.lines.find((l) => l.shipment_id === shipmentId);
    if (!line) return;
    if (scanMode === "bag") {
      setBagLine((l) => ({
        ...l,
        awbNo: line.awb_no,
        bagNo: line.bag_no ?? l.bagNo,
      }));
    } else {
      setAwbLine((l) => ({
        ...l,
        awbNo: line.awb_no,
        bagNo: line.bag_no ?? l.bagNo,
      }));
    }
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-5 px-4 py-6 md:px-8 md:py-8">
      <MasterBreadcrumb trail={["Transaction", "Manifest In Scan"]} />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Manifest In Scan</h1>
        <p className="text-sm text-muted-foreground">
          Scan manifest bags or individual AWBs at the service centre.
          {authed ? " Connected to live backend." : " Demo mode — sign in for live inscan."}
        </p>
      </div>

      <Card className="min-w-0 overflow-hidden border p-0">
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-4 py-3">
          <IconButton label="Filter" onClick={openFilter}>
            <Filter className={cn("h-4 w-4", filterOpen && "text-emerald-600")} />
          </IconButton>
          <div className="flex overflow-hidden rounded-md border">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className={cn(
                "h-9 rounded-none px-4",
                scanMode === "bag" &&
                  "bg-emerald-600 text-white hover:bg-emerald-600/90 hover:text-white",
              )}
              onClick={() => setScanMode("bag")}
            >
              Bag/Manifest
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className={cn(
                "h-9 rounded-none border-l px-4",
                scanMode === "awb" &&
                  "bg-emerald-600 text-white hover:bg-emerald-600/90 hover:text-white",
              )}
              onClick={() => setScanMode("awb")}
            >
              AWB No.
            </Button>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-3 text-sm">
            <span className="font-medium text-emerald-700 dark:text-emerald-400">
              Scanned: {displayCounts.scanned}
            </span>
            <span className="font-medium text-amber-700 dark:text-amber-400">
              Pending: {displayCounts.pending}
            </span>
          </div>
        </div>

        {filterOpen ? (
          <div className="space-y-4 border-b bg-card p-4 md:p-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              <FieldWrapper label="From Date" required>
                <Input
                  type="date"
                  value={filterDraft.fromDate}
                  onChange={(e) => setFilterDraft((f) => ({ ...f, fromDate: e.target.value }))}
                />
              </FieldWrapper>
              <FieldWrapper label="To Date" required>
                <Input
                  type="date"
                  value={filterDraft.toDate}
                  onChange={(e) => setFilterDraft((f) => ({ ...f, toDate: e.target.value }))}
                />
              </FieldWrapper>
              <FieldWrapper label="Manifest No">
                <Input
                  value={filterDraft.manifestNo}
                  onChange={(e) => setFilterDraft((f) => ({ ...f, manifestNo: e.target.value }))}
                />
              </FieldWrapper>
              <FieldWrapper label="Destination">
                <DestinationLookupInput
                  value={filterDraft.destination}
                  onChange={(destination) => setFilterDraft((f) => ({ ...f, destination }))}
                />
              </FieldWrapper>
              <FieldWrapper label="Select Inscan Type">
                <Select
                  value={filterDraft.inscanType || "all"}
                  onValueChange={(v) =>
                    setFilterDraft((f) => ({
                      ...f,
                      inscanType: v === "all" ? "" : (v as InscanFilterType),
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Inscan Type" />
                  </SelectTrigger>
                  <SelectContent>
                    {INSCAN_TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value || "all"} value={opt.value || "all"}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldWrapper>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                onClick={handleFilterView}
                className="min-w-24 bg-emerald-600 text-white hover:bg-emerald-600/90"
              >
                View
              </Button>
              <Button variant="destructive" onClick={closeFilter} className="min-w-24">
                Close
              </Button>
            </div>
          </div>
        ) : null}

        {!filterOpen ? (
          <div className="space-y-4 p-4 md:p-6">
            <FormSection title="Manifest Inscan">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                <FieldWrapper label="Manifest Inscan Date" required>
                  <Input
                    type="date"
                    value={header.inscanDate}
                    onChange={(e) => updateHeader({ inscanDate: e.target.value })}
                  />
                </FieldWrapper>
                <FieldWrapper label="Manifest Inscan Time" required>
                  <Input
                    value={header.inscanTime}
                    onChange={(e) =>
                      updateHeader({ inscanTime: e.target.value.replace(/\D/g, "").slice(0, 4) })
                    }
                    placeholder="HHmm"
                    inputMode="numeric"
                    maxLength={4}
                  />
                </FieldWrapper>
                <FieldWrapper label="Service Center" className="md:col-span-2">
                  <LookupPairInput
                    lookup="serviceCentre"
                    value={header.serviceCentre}
                    onChange={(serviceCentre) => updateHeader({ serviceCentre })}
                  />
                </FieldWrapper>
                <FieldWrapper label="Manifest No.">
                  <div className="flex gap-1">
                    <Input
                      value={header.manifestNo}
                      onChange={(e) => updateHeader({ manifestNo: e.target.value, manifestId: "" })}
                      onBlur={() => {
                        if (authed && header.manifestNo.trim()) {
                          void resolveManifest(header.manifestNo);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void resolveManifest(header.manifestNo);
                        }
                      }}
                    />
                    {authed ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                        onClick={() => void resolveManifest(header.manifestNo)}
                      >
                        Load
                      </Button>
                    ) : null}
                  </div>
                </FieldWrapper>
                <FieldWrapper label="Bag No." className="lg:col-span-3">
                  <Input
                    value={header.bagNo}
                    onChange={(e) => updateHeader({ bagNo: e.target.value })}
                  />
                </FieldWrapper>
              </div>
            </FormSection>

            <FormSection title={scanMode === "bag" ? "Bag / Manifest Scan" : "AWB Scan"}>
              {authed && pendingLines.length > 0 ? (
                <div className="mb-4">
                  <FieldWrapper label="Manual shipment selection">
                    <Select
                      value={selectedShipmentId || "none"}
                      onValueChange={(v) => onSelectPendingShipment(v === "none" ? "" : v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select pending AWB" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Select pending AWB</SelectItem>
                        {pendingLines.map((l) => (
                          <SelectItem key={l.shipment_id} value={l.shipment_id}>
                            {l.awb_no}
                            {l.bag_no ? ` · bag ${l.bag_no}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FieldWrapper>
                </div>
              ) : null}

              {scanMode === "bag" ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  <FieldWrapper label="Manifest No.">
                    <Input
                      value={bagLine.manifestNo}
                      onChange={(e) => setBagLine((l) => ({ ...l, manifestNo: e.target.value }))}
                    />
                  </FieldWrapper>
                  <FieldWrapper label="Bag No.">
                    <Input
                      value={bagLine.bagNo}
                      onChange={(e) => setBagLine((l) => ({ ...l, bagNo: e.target.value }))}
                    />
                  </FieldWrapper>
                  <FieldWrapper label="AWB No." required>
                    <Input
                      value={bagLine.awbNo}
                      onChange={(e) => setBagLine((l) => ({ ...l, awbNo: e.target.value }))}
                      onKeyDown={onLineEnter}
                      placeholder="Scan or type AWB"
                      autoComplete="off"
                    />
                  </FieldWrapper>
                  <FieldWrapper label="Pieces">
                    <Input
                      value={bagLine.pieces}
                      onChange={(e) => setBagLine((l) => ({ ...l, pieces: e.target.value }))}
                      inputMode="numeric"
                    />
                  </FieldWrapper>
                  <FieldWrapper label="Weight">
                    <Input
                      value={bagLine.weight}
                      onChange={(e) => setBagLine((l) => ({ ...l, weight: e.target.value }))}
                      inputMode="decimal"
                    />
                  </FieldWrapper>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <FieldWrapper label="Manifest No.">
                      <Input
                        value={awbLine.manifestNo}
                        onChange={(e) => setAwbLine((l) => ({ ...l, manifestNo: e.target.value }))}
                      />
                    </FieldWrapper>
                    <FieldWrapper label="Bag No.">
                      <Input
                        value={awbLine.bagNo}
                        onChange={(e) => setAwbLine((l) => ({ ...l, bagNo: e.target.value }))}
                      />
                    </FieldWrapper>
                    <FieldWrapper label="AWB No." required>
                      <Input
                        value={awbLine.awbNo}
                        onChange={(e) => setAwbLine((l) => ({ ...l, awbNo: e.target.value }))}
                        onKeyDown={onLineEnter}
                        placeholder="Scan or type AWB"
                        autoComplete="off"
                      />
                    </FieldWrapper>
                    <FieldWrapper label="Weight">
                      <Input
                        value={awbLine.weight}
                        onChange={(e) => setAwbLine((l) => ({ ...l, weight: e.target.value }))}
                        inputMode="decimal"
                      />
                    </FieldWrapper>
                    <FieldWrapper label="Length">
                      <Input
                        value={awbLine.length}
                        onChange={(e) => setAwbLine((l) => ({ ...l, length: e.target.value }))}
                        inputMode="decimal"
                      />
                    </FieldWrapper>
                    <FieldWrapper label="Breadth">
                      <Input
                        value={awbLine.breadth}
                        onChange={(e) => setAwbLine((l) => ({ ...l, breadth: e.target.value }))}
                        inputMode="decimal"
                      />
                    </FieldWrapper>
                    <FieldWrapper label="Height">
                      <Input
                        value={awbLine.height}
                        onChange={(e) => setAwbLine((l) => ({ ...l, height: e.target.value }))}
                        inputMode="decimal"
                      />
                    </FieldWrapper>
                    <FieldWrapper label="Vol. Weight">
                      <Input
                        value={awbLine.volWeight}
                        onChange={(e) => setAwbLine((l) => ({ ...l, volWeight: e.target.value }))}
                        inputMode="decimal"
                      />
                    </FieldWrapper>
                    <FieldWrapper label="Remark" className="lg:col-span-2">
                      <Input
                        value={awbLine.remark}
                        onChange={(e) => setAwbLine((l) => ({ ...l, remark: e.target.value }))}
                      />
                    </FieldWrapper>
                    <div className="flex items-end pb-2">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="bookingWeight"
                          checked={awbLine.bookingWeight}
                          onCheckedChange={(c) =>
                            setAwbLine((l) => ({ ...l, bookingWeight: c === true }))
                          }
                        />
                        <label htmlFor="bookingWeight" className="text-sm text-foreground">
                          Booking Weight
                        </label>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm font-medium text-sky-700 dark:text-sky-400">
                    Count : {displayCounts.pieces} / {displayCounts.total}
                  </p>
                </div>
              )}

              {scanMode === "bag" ? (
                <p className="mt-4 text-sm font-medium text-sky-700 dark:text-sky-400">
                  Count : {displayCounts.pieces} / {displayCounts.total}
                </p>
              ) : null}

              <div className="mt-4 flex justify-end gap-2">
                <Button
                  onClick={() => void handleSave()}
                  disabled={saving}
                  className="min-w-24 bg-emerald-600 text-white hover:bg-emerald-600/90"
                >
                  {saving ? "Saving…" : "Save"}
                </Button>
                <Button variant="destructive" onClick={handleReset} className="min-w-24">
                  Reset
                </Button>
              </div>
            </FormSection>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="relative rounded-md border p-4 pt-6">
      <span className="absolute -top-2.5 left-3 bg-card px-2 text-sm font-medium text-foreground">
        {title}
      </span>
      {children}
    </div>
  );
}

function LookupPairInput({
  value,
  onChange,
  lookup,
}: {
  value: LookupPair;
  onChange: (v: LookupPair) => void;
  lookup: LookupKey;
}) {
  const [lookupOpen, setLookupOpen] = useState(false);

  return (
    <>
      <div className="flex gap-1">
        <Input
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          className="min-w-0 flex-1"
          placeholder="Name"
        />
        <Button
          size="icon"
          variant="outline"
          className="h-9 w-9 shrink-0 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
          aria-label="Search service centre"
          onClick={() => setLookupOpen(true)}
        >
          <Search className="h-4 w-4" />
        </Button>
      </div>
      <MasterLookupDialog
        open={lookupOpen}
        onOpenChange={setLookupOpen}
        lookup={lookup}
        returnField="code"
        onSelect={(_v, option: LookupOption) => onChange({ code: option.code, name: option.name })}
      />
    </>
  );
}

function DestinationLookupInput({
  value,
  onChange,
}: {
  value: LookupPair;
  onChange: (v: LookupPair) => void;
}) {
  const [lookupOpen, setLookupOpen] = useState(false);

  return (
    <>
      <div className="flex gap-1">
        <Input
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          className="min-w-0 flex-1"
          placeholder="Name"
        />
        <Input
          value={value.code}
          onChange={(e) => onChange({ ...value, code: e.target.value })}
          className="w-20"
          placeholder="Code"
        />
        <Button
          size="icon"
          variant="outline"
          className="h-9 w-9 shrink-0 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
          aria-label="Search destination"
          onClick={() => setLookupOpen(true)}
        >
          <Search className="h-4 w-4" />
        </Button>
      </div>
      <MasterLookupDialog
        open={lookupOpen}
        onOpenChange={setLookupOpen}
        lookup="destination"
        returnField="code"
        onSelect={(_v, option: LookupOption) => onChange({ code: option.code, name: option.name })}
      />
    </>
  );
}
