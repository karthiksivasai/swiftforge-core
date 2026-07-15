import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FieldWrapper, MasterBreadcrumb, downloadCsv } from "@/components/master-table-kit";
import { useAuth } from "@/lib/auth";
import { parseTabularFile } from "@/lib/io/tableIo";
import { toErrorMessage } from "@/lib/masters/screen";
import { ConflictError } from "@/lib/masters/core/baseCrud";
import { cancelPod, getPodByAwb, savePod, updatePod } from "@/lib/transactions/resources/pod";
import {
  emptyPodEntryForm,
  entryFormToFields,
  lookupToEntryForm,
  podActionsEnabled,
  podBadgeLabel,
  type PodEntryForm,
} from "@/lib/transactions/podUiMap";
import { podFieldsSchema, podStatusLabel } from "@/lib/transactions/schemas/pod";

type TabView = "excel" | "view";

type PodResult = {
  awbNo: string;
  status: string;
  receiverName: string;
  statusDate: string;
  remark: string;
};

const DEMO_POD: Record<string, Omit<PodResult, "awbNo">> = {
  "30403918": {
    status: "Delivered",
    receiverName: "JOHN SMITH",
    statusDate: "04/07/2026",
    remark: "Received in good condition",
  },
  "30403919": {
    status: "In Transit",
    receiverName: "",
    statusDate: "04/07/2026",
    remark: "Out for delivery",
  },
  "30403920": {
    status: "Delivered",
    receiverName: "MIDHUN NARNE",
    statusDate: "03/07/2026",
    remark: "POD uploaded",
  },
  "30403921": {
    status: "Pending",
    receiverName: "",
    statusDate: "02/07/2026",
    remark: "",
  },
  "30403922": {
    status: "Delivered",
    receiverName: "DELHI TRADERS",
    statusDate: "01/07/2026",
    remark: "Signed copy received",
  },
};

const POD_TEMPLATE_HEADERS = ["AWB No", "POD Date", "Receiver Name", "Remark", "Status"] as const;

const formatDisplayDate = (iso: string) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
};

export const Route = createFileRoute("/transaction/bulk-import/pod-to-excel")({
  head: () => ({
    meta: [
      { title: "POD Excel View — Transaction — Courier ERP" },
      {
        name: "description",
        content: "Import POD data from Excel and view AWB proof-of-delivery details.",
      },
    ],
  }),
  component: PodExcelViewPage,
});

function PodExcelViewPage() {
  const { isAuthenticated: authed } = useAuth();
  const [tab, setTab] = useState<TabView>("view");
  const [fileName, setFileName] = useState("");
  const [fileInputKey, setFileInputKey] = useState(0);
  const [awbInput, setAwbInput] = useState("");
  const [results, setResults] = useState<PodResult[]>([]);
  const [entry, setEntry] = useState<PodEntryForm>(emptyPodEntryForm);
  const [saving, setSaving] = useState(false);

  const excelFileRef = useRef<File | null>(null);

  const handleDownloadTemplate = () => {
    downloadCsv(
      "pod-import-template.csv",
      [...POD_TEMPLATE_HEADERS],
      [
        ["30403918", "04/07/2026", "JOHN SMITH", "Received in good condition", "Delivered"],
        ["30403919", "04/07/2026", "", "Out for delivery", "In Transit"],
      ],
    );
    toast.success("POD Excel template downloaded");
  };

  const actions = podActionsEnabled(entry);

  const handleImport = async () => {
    const file = excelFileRef.current;
    if (!file) return toast.error("Choose a file first");
    try {
      const parsed = await parseTabularFile(file);
      if (parsed.rows.length === 0) return toast.error("File is empty");
      toast.message(
        `Excel POD import is a placeholder (${parsed.rows.length} rows parsed) — use View tab to save POD records.`,
      );
    } catch (err) {
      toast.error(toErrorMessage(err, "Failed to import file"));
    }
  };

  const resetExcel = () => {
    setFileName("");
    excelFileRef.current = null;
    setFileInputKey((k) => k + 1);
  };

  const loadDemoResults = (awbs: string[]) => {
    const found: PodResult[] = awbs.map((awbNo) => {
      const demo = DEMO_POD[awbNo];
      return demo
        ? { awbNo, ...demo }
        : {
            awbNo,
            status: "Not Found",
            receiverName: "",
            statusDate: "",
            remark: "No POD record available",
          };
    });
    setResults(found);
    const first = found[0];
    if (first && DEMO_POD[first.awbNo]) {
      const demo = DEMO_POD[first.awbNo];
      setEntry({
        ...emptyPodEntryForm(),
        awbNo: first.awbNo,
        shipmentStatus: demo.status === "Delivered" ? "DELIVERED" : "DELIVERED_PENDING_POD",
        podStatus: demo.status === "Delivered" ? "DELIVERED" : "PENDING",
        podId: demo.status === "Delivered" ? "demo-pod" : "",
        rowVersion: demo.status === "Delivered" ? 1 : null,
        receiverName: demo.receiverName,
        podDate: "2026-07-04",
        remark: demo.remark,
      });
    } else if (first) {
      setEntry({ ...emptyPodEntryForm(), awbNo: first.awbNo });
    }
    toast.success(`${found.length} AWB${found.length === 1 ? "" : "s"} loaded (demo)`);
  };

  const handleSearch = async () => {
    const awbs = awbInput
      .split(/[\s,;\n\r]+/)
      .map((awb) => awb.trim())
      .filter(Boolean);

    if (awbs.length === 0) return toast.error("Enter at least one AWB No.");

    if (!authed) {
      loadDemoResults(awbs);
      return;
    }

    try {
      const live: PodResult[] = [];
      let firstForm: PodEntryForm | null = null;
      for (const awbNo of awbs) {
        const result = await getPodByAwb(awbNo);
        if (!result.found) {
          live.push({
            awbNo,
            status: "Not Found",
            receiverName: "",
            statusDate: "",
            remark: "No shipment found",
          });
          continue;
        }
        const form = lookupToEntryForm(result);
        if (!firstForm) firstForm = form;
        live.push({
          awbNo: form.awbNo,
          status: podBadgeLabel(form),
          receiverName: form.receiverName,
          statusDate: formatDisplayDate(form.podDate),
          remark: form.remark,
        });
      }
      setResults(live);
      if (firstForm) setEntry(firstForm);
      toast.success(`${live.length} AWB${live.length === 1 ? "" : "s"} loaded`);
    } catch (err) {
      toast.error(toErrorMessage(err));
    }
  };

  const selectResult = async (row: PodResult) => {
    if (!authed) {
      const demo = DEMO_POD[row.awbNo];
      if (!demo) {
        setEntry({ ...emptyPodEntryForm(), awbNo: row.awbNo });
        return;
      }
      setEntry({
        ...emptyPodEntryForm(),
        awbNo: row.awbNo,
        shipmentStatus: demo.status === "Delivered" ? "DELIVERED" : "DELIVERED_PENDING_POD",
        podStatus: demo.status === "Delivered" ? "DELIVERED" : "PENDING",
        podId: demo.status === "Delivered" ? "demo-pod" : "",
        rowVersion: demo.status === "Delivered" ? 1 : null,
        receiverName: demo.receiverName,
        podDate: "2026-07-04",
        remark: demo.remark,
      });
      return;
    }
    try {
      const result = await getPodByAwb(row.awbNo);
      if (!result.found) {
        setEntry({ ...emptyPodEntryForm(), awbNo: row.awbNo });
        return;
      }
      setEntry(lookupToEntryForm(result));
    } catch (err) {
      toast.error(toErrorMessage(err));
    }
  };

  const refreshEntry = async (awbNo: string) => {
    if (!authed || !awbNo) return;
    const result = await getPodByAwb(awbNo);
    if (result.found) setEntry(lookupToEntryForm(result));
  };

  const handleSave = async () => {
    const parsed = podFieldsSchema.safeParse(entryFormToFields(entry));
    if (!parsed.success) {
      return toast.error(parsed.error.issues[0]?.message ?? "Invalid POD fields");
    }
    if (!authed) {
      setEntry((prev) => ({
        ...prev,
        shipmentStatus: "DELIVERED",
        podStatus: "DELIVERED",
        podId: prev.podId || "demo-pod",
        rowVersion: (prev.rowVersion ?? 0) + 1,
        receiverName: parsed.data.receiver_name,
        podDate: parsed.data.pod_date,
        remark: parsed.data.remark ?? "",
      }));
      setResults((prev) =>
        prev.map((r) =>
          r.awbNo === entry.awbNo
            ? {
                ...r,
                status: "Delivered",
                receiverName: parsed.data.receiver_name,
                statusDate: formatDisplayDate(parsed.data.pod_date),
                remark: parsed.data.remark ?? "",
              }
            : r,
        ),
      );
      return toast.success(`POD saved for AWB ${entry.awbNo} (demo)`);
    }
    if (!actions.save) {
      return toast.error("Shipment must be Delivered (pending POD) to save POD");
    }
    setSaving(true);
    try {
      await savePod({
        shipment_id: entry.shipmentId || null,
        awb_no: entry.awbNo,
        fields: parsed.data,
      });
      await refreshEntry(entry.awbNo);
      toast.success(`POD saved — AWB ${entry.awbNo} Delivered`);
    } catch (err) {
      toast.error(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    const parsed = podFieldsSchema.safeParse(entryFormToFields(entry));
    if (!parsed.success) {
      return toast.error(parsed.error.issues[0]?.message ?? "Invalid POD fields");
    }
    if (!authed) {
      setEntry((prev) => ({
        ...prev,
        receiverName: parsed.data.receiver_name,
        podDate: parsed.data.pod_date,
        remark: parsed.data.remark ?? "",
        rowVersion: (prev.rowVersion ?? 1) + 1,
      }));
      return toast.success(`POD updated for AWB ${entry.awbNo} (demo)`);
    }
    if (!actions.update || !entry.podId || entry.rowVersion == null) {
      return toast.error("POD can only be updated while Delivered");
    }
    setSaving(true);
    try {
      await updatePod({
        id: entry.podId,
        row_version: entry.rowVersion,
        fields: parsed.data,
      });
      await refreshEntry(entry.awbNo);
      toast.success(`POD updated — AWB ${entry.awbNo}`);
    } catch (err) {
      if (err instanceof ConflictError) toast.error(err.message);
      else toast.error(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleCancelPod = async () => {
    if (!authed) {
      setEntry((prev) => ({
        ...prev,
        shipmentStatus: "DELIVERED_PENDING_POD",
        podStatus: "PENDING",
        rowVersion: (prev.rowVersion ?? 1) + 1,
      }));
      setResults((prev) =>
        prev.map((r) =>
          r.awbNo === entry.awbNo ? { ...r, status: "Delivered (pending POD)" } : r,
        ),
      );
      return toast.success(`POD cancelled for AWB ${entry.awbNo} (demo)`);
    }
    if (!actions.cancel || !entry.podId || entry.rowVersion == null) {
      return toast.error("POD can only be cancelled while Delivered");
    }
    setSaving(true);
    try {
      await cancelPod({
        id: entry.podId,
        row_version: entry.rowVersion,
        reason: "Cancelled from POD Excel View",
      });
      await refreshEntry(entry.awbNo);
      toast.success(`POD cancelled — AWB ${entry.awbNo} pending POD`);
    } catch (err) {
      if (err instanceof ConflictError) toast.error(err.message);
      else toast.error(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const resetView = () => {
    setAwbInput("");
    setResults([]);
    setEntry(emptyPodEntryForm());
  };

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <MasterBreadcrumb trail={["Transaction", "Bulk Import", "POD Excel View"]} />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">POD Excel View</h1>
        <p className="text-sm text-muted-foreground">
          Import proof-of-delivery records from Excel or search AWB numbers to view and capture POD.
          {authed ? " Connected to live backend." : " Demo mode — sign in for live POD."}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["excel", "view"] as const).map((key) => (
          <Button
            key={key}
            type="button"
            size="sm"
            variant={tab === key ? "default" : "outline"}
            className={
              tab === key
                ? "rounded-full bg-sidebar px-6 text-sidebar-foreground hover:bg-sidebar/90"
                : "rounded-full px-6"
            }
            onClick={() => setTab(key)}
          >
            {key === "excel" ? "Excel" : "View"}
          </Button>
        ))}
      </div>

      {tab === "excel" ? (
        <Card className="min-w-0 overflow-hidden border p-4 md:p-6">
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-destructive hover:underline"
          >
            <Download className="h-4 w-4" />
            Click Here To Download Excel
          </button>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <input
                key={fileInputKey}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                id="pod-excel-file"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  excelFileRef.current = file;
                  setFileName(file?.name ?? "");
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => document.getElementById("pod-excel-file")?.click()}
              >
                Choose
              </Button>
              <span className="text-sm text-muted-foreground">
                {fileName || "No file selected"}
              </span>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                onClick={() => void handleImport()}
                className="min-w-24 bg-emerald-600 text-white hover:bg-emerald-600/90"
              >
                Import
              </Button>
              <Button type="button" variant="destructive" onClick={resetExcel} className="min-w-24">
                Reset
              </Button>
            </div>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Bulk Excel import remains a placeholder (Phase 6). Capture POD via the View tab.
          </p>
        </Card>
      ) : (
        <Card className="min-w-0 overflow-hidden border p-4 md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <FieldWrapper label="AWB No" className="min-w-0 flex-1">
              <Textarea
                value={awbInput}
                onChange={(e) => setAwbInput(e.target.value)}
                placeholder="Enter AWB numbers separated by comma or new line"
                className="min-h-[120px] resize-y"
              />
            </FieldWrapper>
            <div className="flex shrink-0 flex-wrap justify-end gap-2 lg:pt-6">
              <Button
                type="button"
                onClick={() => void handleSearch()}
                className="min-w-24 bg-emerald-600 text-white hover:bg-emerald-600/90"
              >
                Search
              </Button>
              <Button type="button" variant="destructive" onClick={resetView} className="min-w-24">
                Reset
              </Button>
            </div>
          </div>

          {results.length > 0 ? (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[720px] caption-bottom text-sm">
                <TableHeader>
                  <TableRow className="bg-sidebar hover:bg-sidebar">
                    <TableHead className="text-sidebar-foreground">AWB No.</TableHead>
                    <TableHead className="text-sidebar-foreground">Status</TableHead>
                    <TableHead className="text-sidebar-foreground">Receiver Name</TableHead>
                    <TableHead className="text-sidebar-foreground">POD Date</TableHead>
                    <TableHead className="text-sidebar-foreground">Remark</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((row) => (
                    <TableRow
                      key={row.awbNo}
                      className="cursor-pointer"
                      onClick={() => void selectResult(row)}
                    >
                      <TableCell className="font-medium">{row.awbNo}</TableCell>
                      <TableCell>{row.status}</TableCell>
                      <TableCell>{row.receiverName || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.statusDate || "—"}</TableCell>
                      <TableCell>{row.remark || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </table>
            </div>
          ) : null}

          {entry.awbNo ? (
            <div className="mt-6 space-y-4 border-t pt-4">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-base font-semibold">POD Entry — {entry.awbNo}</h2>
                <Badge
                  variant={
                    entry.shipmentStatus === "DELIVERED" || entry.podStatus === "DELIVERED"
                      ? "default"
                      : "secondary"
                  }
                >
                  {podBadgeLabel(entry)}
                </Badge>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <FieldWrapper label="Receiver Name">
                  <Input
                    value={entry.receiverName}
                    onChange={(e) => setEntry((p) => ({ ...p, receiverName: e.target.value }))}
                    placeholder="Receiver name"
                  />
                </FieldWrapper>
                <FieldWrapper label="POD Date">
                  <Input
                    type="date"
                    value={entry.podDate}
                    onChange={(e) => setEntry((p) => ({ ...p, podDate: e.target.value }))}
                  />
                </FieldWrapper>
                <FieldWrapper label="Remark">
                  <Input
                    value={entry.remark}
                    onChange={(e) => setEntry((p) => ({ ...p, remark: e.target.value }))}
                    placeholder="Remarks"
                  />
                </FieldWrapper>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <FieldWrapper label="Signature (placeholder)">
                  <Input
                    disabled
                    value={entry.signatureFileId}
                    placeholder="Signature upload — not implemented"
                  />
                </FieldWrapper>
                <FieldWrapper label="Photo (placeholder)">
                  <Input
                    disabled
                    value={entry.photoFileId}
                    placeholder="Photo upload — not implemented"
                  />
                </FieldWrapper>
                <FieldWrapper label="GPS / Mobile (placeholder)">
                  <Input disabled placeholder="GPS / mobile capture — not implemented" />
                </FieldWrapper>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={saving || (authed && !actions.save)}
                  onClick={() => void handleSave()}
                  className="min-w-24 bg-emerald-600 text-white hover:bg-emerald-600/90"
                >
                  Save
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving || (authed && !actions.update)}
                  onClick={() => void handleUpdate()}
                  className="min-w-24"
                >
                  Update
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={saving || (authed && !actions.cancel)}
                  onClick={() => void handleCancelPod()}
                  className="min-w-24"
                >
                  Cancel POD
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Status: {podStatusLabel(entry.shipmentStatus || entry.podStatus)}. File IDs only —
                no storage upload in this milestone.
              </p>
            </div>
          ) : null}
        </Card>
      )}
    </div>
  );
}
