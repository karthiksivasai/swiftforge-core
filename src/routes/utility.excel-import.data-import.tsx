import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FieldWrapper, MasterBreadcrumb } from "@/components/master-table-kit";

const mergingTypes = ["Customer AWB Stock Merging", "Other Charges Import"];

export const Route = createFileRoute("/utility/excel-import/data-import")({
  head: () => ({
    meta: [
      { title: "Data Import — Utility — Courier ERP" },
      { name: "description", content: "Import customer AWB stock and other charges data." },
    ],
  }),
  component: DataImportPage,
});

function DataImportPage() {
  const [mergingType, setMergingType] = useState("");
  const [fileName, setFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFileName(event.target.files?.[0]?.name ?? "");
  };

  const handleImport = () => {
    if (!mergingType) return toast.error("Please select merging type");
    if (!fileName) return toast.error("Please select import file");
    toast.success(`${mergingType} import started`);
  };

  const handleReset = () => {
    setMergingType("");
    setFileName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <MasterBreadcrumb trail={["Utility", "Excel Import", "Data Import"]} />

      <Card className="relative min-w-0 border p-4 pt-7">
        <span className="absolute -top-3 left-4 rounded-full bg-sidebar px-4 py-1 text-xs font-semibold text-sidebar-foreground shadow">
          Data Import
        </span>

        <button
          type="button"
          onClick={() => toast.success("Excel file format download started")}
          className="mb-3 inline-flex items-center gap-1 text-xs text-red-500 hover:underline"
        >
          <Download className="h-3.5 w-3.5" />
          Click Here to Download Excel File Format
        </button>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap items-end gap-8">
            <FieldWrapper label="Merging Type">
              <Select value={mergingType} onValueChange={setMergingType}>
                <SelectTrigger className="h-9 w-72">
                  <SelectValue placeholder="Select Type" />
                </SelectTrigger>
                <SelectContent>
                  {mergingTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldWrapper>

            <FieldWrapper label="Select File">
              <div className="flex items-center gap-2">
                <input ref={fileInputRef} type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={handleFile} />
                <Button type="button" variant="outline" className="h-9 px-6" onClick={() => fileInputRef.current?.click()}>
                  Choose
                </Button>
                <span className="text-xs text-muted-foreground">{fileName || "No file selected"}</span>
              </div>
            </FieldWrapper>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={handleImport} className="h-9 rounded-full bg-green-500 px-8 text-white hover:bg-green-600">
              Import
            </Button>
            <Button onClick={handleReset} className="h-9 rounded-full bg-red-500 px-8 text-white hover:bg-red-600">
              Reset
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
