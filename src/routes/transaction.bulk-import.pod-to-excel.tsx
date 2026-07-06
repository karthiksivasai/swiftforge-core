import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FieldWrapper, MasterBreadcrumb, downloadCsv } from "@/components/master-table-kit";

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

export const Route = createFileRoute("/transaction/bulk-import/pod-to-excel")({
  head: () => ({
    meta: [
      { title: "POD Excel View — Transaction — Courier ERP" },
      { name: "description", content: "Import POD data from Excel and view AWB proof-of-delivery details." },
    ],
  }),
  component: PodExcelViewPage,
});

function PodExcelViewPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<TabView>("excel");
  const [fileName, setFileName] = useState("");
  const [awbInput, setAwbInput] = useState("");
  const [results, setResults] = useState<PodResult[]>([]);

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

  const handleImport = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return toast.error("Choose an Excel or CSV file first");

    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
      const imported = Math.max(0, lines.length - 1);
      if (imported === 0) return toast.error("No valid rows found in file");
      toast.success(`Imported ${imported} POD row${imported === 1 ? "" : "s"} from ${file.name}`);
    } catch {
      toast.error("Failed to read the selected file");
    }
  };

  const resetExcel = () => {
    setFileName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSearch = () => {
    const awbs = awbInput
      .split(/[\s,;\n\r]+/)
      .map((awb) => awb.trim())
      .filter(Boolean);

    if (awbs.length === 0) return toast.error("Enter at least one AWB No.");

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
    toast.success(`${found.length} AWB${found.length === 1 ? "" : "s"} loaded`);
  };

  const resetView = () => {
    setAwbInput("");
    setResults([]);
  };

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <MasterBreadcrumb trail={["Transaction", "Bulk Import", "POD Excel View"]} />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">POD Excel View</h1>
        <p className="text-sm text-muted-foreground">
          Import proof-of-delivery records from Excel or search AWB numbers to view POD details.
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
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                Choose
              </Button>
              <span className="text-sm text-muted-foreground">{fileName || "No file selected"}</span>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                onClick={handleImport}
                className="min-w-24 bg-emerald-600 text-white hover:bg-emerald-600/90"
              >
                Import
              </Button>
              <Button type="button" variant="destructive" onClick={resetExcel} className="min-w-24">
                Reset
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="min-w-0 overflow-hidden border p-4 md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <FieldWrapper label="AWB No" className="min-w-0 flex-1">
              <Textarea
                value={awbInput}
                onChange={(e) => setAwbInput(e.target.value)}
                placeholder="Enter AWB numbers separated by comma or new line"
                className="min-h-[160px] resize-y"
              />
            </FieldWrapper>
            <div className="flex shrink-0 flex-wrap justify-end gap-2 lg:pt-6">
              <Button
                type="button"
                onClick={handleSearch}
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
                    <TableRow key={row.awbNo}>
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
        </Card>
      )}
    </div>
  );
}
