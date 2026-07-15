import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MasterBreadcrumb } from "@/components/master-table-kit";
import {
  downloadExcelTemplate,
  excelImportErrorMessage,
  runExcelImportFromFile,
} from "@/lib/imports/excelUi";
import type { ExcelImportType } from "@/lib/imports/excelImport";

type Props = {
  title: string;
  trail: string[];
  importType: ExcelImportType;
  templateName: string;
};

function SimpleExcelImportPage({ title, trail, importType, templateName }: Props) {
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<File | null>(null);

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    fileRef.current = file;
    setFileName(file?.name ?? "");
  };

  const run = async (mode: "VALIDATE" | "COMMIT") => {
    if (!fileRef.current) return toast.error("Please select import file");
    setBusy(true);
    try {
      await runExcelImportFromFile({
        file: fileRef.current,
        importType,
        mode,
      });
    } catch (err) {
      toast.error(excelImportErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleReset = () => {
    setFileName("");
    fileRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <MasterBreadcrumb trail={trail} />

      <Card className="min-w-0 border p-4">
        <button
          type="button"
          onClick={() => downloadExcelTemplate(importType, templateName)}
          className="mb-4 inline-flex items-center gap-1 text-xs text-red-500 hover:underline"
        >
          <Download className="h-3.5 w-3.5" />
          Click Here To Download Excel
        </button>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".xlsx,.xls,.csv"
              onChange={handleFile}
            />
            <Button
              type="button"
              variant="outline"
              className="h-9 px-6"
              onClick={() => fileInputRef.current?.click()}
            >
              Choose
            </Button>
            <span className="text-xs text-muted-foreground">{fileName || "No file selected"}</span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void run("VALIDATE")}
              className="h-9 rounded-full px-6"
            >
              Validate
            </Button>
            <Button
              disabled={busy}
              onClick={() => void run("COMMIT")}
              className="h-9 rounded-full bg-green-500 px-8 text-white hover:bg-green-600"
            >
              Import
            </Button>
            <Button
              onClick={handleReset}
              className="h-9 rounded-full bg-red-500 px-8 text-white hover:bg-red-600"
            >
              Reset
            </Button>
          </div>
        </div>
      </Card>
      <p className="text-xs text-muted-foreground">{title} — CSV templates supported.</p>
    </div>
  );
}

export const Route = createFileRoute("/utility/excel-import/pod-merging")({
  head: () => ({
    meta: [
      { title: "POD Merging — Utility — Courier ERP" },
      { name: "description", content: "Import POD merging data from Excel files." },
    ],
  }),
  component: () => (
    <SimpleExcelImportPage
      title="POD Merge"
      trail={["Utility", "Excel Import", "POD Merging"]}
      importType="POD_MERGE"
      templateName="pod-merge-template.csv"
    />
  ),
});
