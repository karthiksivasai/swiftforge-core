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

const formats = ["FORMAT1", "FORMAT2"];

export const Route = createFileRoute("/utility/excel-import/data-updation")({
  head: () => ({
    meta: [
      { title: "Data Updation — Utility — Courier ERP" },
      { name: "description", content: "Update existing data through Excel upload." },
    ],
  }),
  component: DataUpdationPage,
});

function DataUpdationPage() {
  const [format, setFormat] = useState("");
  const [fileName, setFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFileName(event.target.files?.[0]?.name ?? "");
  };

  const handleImport = () => {
    if (!format) return toast.error("Please select format");
    if (!fileName) return toast.error("Please select import file");
    toast.success(`${format} data updation started`);
  };

  const handleReset = () => {
    setFormat("");
    setFileName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <MasterBreadcrumb trail={["Utility", "Excel Import", "Data Updation"]} />

      <Card className="min-w-0 border p-4">
        <button
          type="button"
          onClick={() => toast.success("Data updation template download started")}
          className="mb-3 inline-flex items-center gap-1 text-xs text-red-500 hover:underline"
        >
          <Download className="h-3.5 w-3.5" />
          Click Here To Download Excel
        </button>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <FieldWrapper label="Select Format">
              <Select value={format} onValueChange={setFormat}>
                <SelectTrigger className="h-9 w-72">
                  <SelectValue placeholder="Select Format" />
                </SelectTrigger>
                <SelectContent>
                  {formats.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
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
