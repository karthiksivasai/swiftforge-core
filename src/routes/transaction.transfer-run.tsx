import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldWrapper, MasterBreadcrumb } from "@/components/master-table-kit";

type RunMode = "transfer" | "offload";

type TransferRunRecord = {
  id: string;
  mode: RunMode;
  sourceManifestNo: string;
  destinationManifestNo: string;
  originalBagNo: string;
  useOriginalBag: boolean;
  createdAt: string;
};

type TransferForm = {
  sourceManifestNo: string;
  destinationManifestNo: string;
  originalBagNo: string;
  useOriginalBag: boolean;
};

const emptyTransferForm = (): TransferForm => ({
  sourceManifestNo: "",
  destinationManifestNo: "",
  originalBagNo: "",
  useOriginalBag: false,
});

export const Route = createFileRoute("/transaction/transfer-run")({
  head: () => ({
    meta: [
      { title: "Transfer RunNo — Transaction — Courier ERP" },
      {
        name: "description",
        content: "Transfer or off-load bags between manifest run numbers.",
      },
    ],
  }),
  component: TransferRunPage,
});

function TransferRunPage() {
  const [mode, setMode] = useState<RunMode>("transfer");
  const [form, setForm] = useState<TransferForm>(emptyTransferForm);
  const [records, setRecords] = useState<TransferRunRecord[]>([]);

  const resetForm = () => setForm(emptyTransferForm());

  const switchMode = (next: RunMode) => {
    setMode(next);
    resetForm();
  };

  const handleSave = () => {
    const source = form.sourceManifestNo.trim();
    if (!source) return toast.error("Source Manifest No is required");

    if (mode === "transfer") {
      const destination = form.destinationManifestNo.trim();
      if (!destination) return toast.error("Destination Manifest No is required");
      if (form.useOriginalBag && !form.originalBagNo.trim()) {
        return toast.error("Original Bag No is required when selected");
      }

      setRecords((prev) => [
        {
          id: crypto.randomUUID(),
          mode: "transfer",
          sourceManifestNo: source,
          destinationManifestNo: destination,
          originalBagNo: form.useOriginalBag ? form.originalBagNo.trim() : "",
          useOriginalBag: form.useOriginalBag,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
      toast.success(`Transferred run from ${source} to ${destination}`);
    } else {
      setRecords((prev) => [
        {
          id: crypto.randomUUID(),
          mode: "offload",
          sourceManifestNo: source,
          destinationManifestNo: "",
          originalBagNo: "",
          useOriginalBag: false,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
      toast.success(`Off-loaded manifest ${source}`);
    }

    resetForm();
  };

  const handleCancel = () => {
    resetForm();
    toast.success("Form cleared");
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-5 px-4 py-6 md:px-8 md:py-8">
      <MasterBreadcrumb trail={["Transaction", "Transfer RunNo"]} />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Transfer RunNo</h1>
        <p className="text-sm text-muted-foreground">
          Transfer bags between manifests or off-load from a source manifest.
        </p>
      </div>

      <Card className="min-w-0 overflow-hidden border p-4 md:p-6">
        <div className="mb-4 flex h-9 w-fit overflow-hidden rounded-md border">
          <Button
            type="button"
            variant="ghost"
            className={cn(
              "h-9 rounded-none px-6 text-sm",
              mode === "transfer"
                ? "bg-emerald-600 text-white hover:bg-emerald-600/90 hover:text-white"
                : "text-emerald-700 hover:bg-muted/50",
            )}
            onClick={() => switchMode("transfer")}
          >
            Transfer
          </Button>
          <Button
            type="button"
            variant="ghost"
            className={cn(
              "h-9 rounded-none border-l px-6 text-sm",
              mode === "offload"
                ? "bg-emerald-600 text-white hover:bg-emerald-600/90 hover:text-white"
                : "text-emerald-700 hover:bg-muted/50",
            )}
            onClick={() => switchMode("offload")}
          >
            Off Load
          </Button>
        </div>

        {mode === "transfer" ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <FieldWrapper label="Source Manifest No." required>
              <Input
                value={form.sourceManifestNo}
                onChange={(e) => setForm((f) => ({ ...f, sourceManifestNo: e.target.value }))}
                autoFocus
              />
            </FieldWrapper>
            <FieldWrapper label="Destination Manifest No." required>
              <Input
                value={form.destinationManifestNo}
                onChange={(e) => setForm((f) => ({ ...f, destinationManifestNo: e.target.value }))}
              />
            </FieldWrapper>
            <FieldWrapper label="Original Bag No.">
              <div className="flex h-9 items-center gap-2 rounded-md border bg-background px-3">
                <Checkbox
                  id="useOriginalBag"
                  checked={form.useOriginalBag}
                  onCheckedChange={(c) =>
                    setForm((f) => ({ ...f, useOriginalBag: c === true, originalBagNo: c === true ? f.originalBagNo : "" }))
                  }
                />
                <Input
                  value={form.originalBagNo}
                  disabled={!form.useOriginalBag}
                  onChange={(e) => setForm((f) => ({ ...f, originalBagNo: e.target.value }))}
                  className="h-8 border-0 px-0 shadow-none focus-visible:ring-0"
                  placeholder=""
                />
              </div>
            </FieldWrapper>
          </div>
        ) : (
          <div className="max-w-md">
            <FieldWrapper label="Source Manifest No." required>
              <Input
                value={form.sourceManifestNo}
                onChange={(e) => setForm((f) => ({ ...f, sourceManifestNo: e.target.value }))}
                autoFocus
              />
            </FieldWrapper>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button onClick={handleSave} className="min-w-24 bg-emerald-600 text-white hover:bg-emerald-600/90">
            Save
          </Button>
          <Button variant="destructive" onClick={handleCancel} className="min-w-24">
            Cancel
          </Button>
        </div>
      </Card>

      {records.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {records.length} transfer run record{records.length === 1 ? "" : "s"} saved this session.
        </p>
      ) : null}
    </div>
  );
}
