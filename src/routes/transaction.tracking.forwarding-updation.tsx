import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";

import { toErrorMessage } from "@/lib/masters/screen";
import { parseTabularFile } from "@/lib/io/tableIo";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { FieldWrapper, MasterBreadcrumb } from "@/components/master-table-kit";
import { FormSection } from "@/components/form-section";
import { MasterLookupDialog } from "@/components/master-lookup-dialog";
import { type LookupKey, type LookupOption } from "@/lib/master-lookups";

type LookupPair = { code: string; name: string };

type ForwardingForm = {
  awbNo: string;
  bookingDate: string;
  destination: string;
  vendor: LookupPair;
  service: LookupPair;
  forwardingAwb: string;
  deliveryVendor: LookupPair;
  deliveryService: LookupPair;
  deliveryAwb: string;
};

type ForwardingRecord = ForwardingForm & {
  id: string;
  updatedAt: string;
};

const SEED_AWBS: Record<
  string,
  Omit<ForwardingForm, "awbNo" | "forwardingAwb" | "deliveryAwb"> & {
    forwardingAwb?: string;
    deliveryAwb?: string;
  }
> = {
  "30403918": {
    bookingDate: "2026-07-04",
    destination: "AUSTRALIA",
    vendor: { code: "DTAU", name: "DTDC AUSTRALIA" },
    service: { code: "SPX", name: "SPX" },
    forwardingAwb: "FWD30403918",
    deliveryVendor: { code: "DTAU", name: "DTDC AUSTRALIA" },
    deliveryService: { code: "SPX", name: "SPX" },
    deliveryAwb: "DLV30403918",
  },
  "30403919": {
    bookingDate: "2026-07-04",
    destination: "USA",
    vendor: { code: "UPS", name: "UNITED PARCEL SERVICE" },
    service: { code: "SPX", name: "SPX" },
    forwardingAwb: "FWD30403919",
    deliveryVendor: { code: "UPS", name: "UNITED PARCEL SERVICE" },
    deliveryService: { code: "SPX", name: "SPX" },
    deliveryAwb: "DLV30403919",
  },
  "30403920": {
    bookingDate: "2026-07-04",
    destination: "AUSTRALIA",
    vendor: { code: "DHE", name: "DHL EXPRESS" },
    service: { code: "SPX", name: "SPX" },
    forwardingAwb: "FWD30403920",
    deliveryVendor: { code: "DHE", name: "DHL EXPRESS" },
    deliveryService: { code: "SPX", name: "SPX" },
    deliveryAwb: "DLV30403920",
  },
};

const emptyPair = (): LookupPair => ({ code: "", name: "" });

const emptyForm = (): ForwardingForm => ({
  awbNo: "",
  bookingDate: "",
  destination: "",
  vendor: emptyPair(),
  service: emptyPair(),
  forwardingAwb: "",
  deliveryVendor: emptyPair(),
  deliveryService: emptyPair(),
  deliveryAwb: "",
});

export const Route = createFileRoute("/transaction/tracking/forwarding-updation")({
  head: () => ({
    meta: [
      { title: "Forwarding Updation — Transaction — Courier ERP" },
      { name: "description", content: "Update forwarding and delivery vendor details for AWB shipments." },
    ],
  }),
  component: ForwardingUpdationPage,
});

function ForwardingUpdationPage() {
  const importInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<ForwardingForm>(emptyForm());
  const [records, setRecords] = useState<ForwardingRecord[]>([]);

  const patchForm = (patch: Partial<ForwardingForm>) => setForm((f) => ({ ...f, ...patch }));

  const loadAwb = (awb?: string) => {
    const value = (awb ?? form.awbNo).trim();
    if (!value) return;
    const seed = SEED_AWBS[value];
    if (!seed) {
      toast.info(`AWB ${value} not found in demo data — enter details manually`);
      return;
    }
    patchForm({
      awbNo: value,
      bookingDate: seed.bookingDate,
      destination: seed.destination,
      vendor: { ...seed.vendor },
      service: { ...seed.service },
      forwardingAwb: seed.forwardingAwb ?? `FWD${value}`,
      deliveryVendor: { ...seed.deliveryVendor },
      deliveryService: { ...seed.deliveryService },
      deliveryAwb: seed.deliveryAwb ?? `DLV${value}`,
    });
    toast.success(`Loaded AWB ${value}`);
  };

  const handleSave = () => {
    const awb = form.awbNo.trim();
    if (!awb) return toast.error("AWB No. is required");
    if (!form.vendor.code.trim() && !form.vendor.name.trim()) {
      return toast.error("Vendor is required");
    }
    if (!form.service.code.trim() && !form.service.name.trim()) {
      return toast.error("Service is required");
    }

    const payload: ForwardingRecord = {
      ...form,
      awbNo: awb,
      id: crypto.randomUUID(),
      updatedAt: new Date().toISOString(),
    };
    setRecords((prev) => [payload, ...prev.filter((r) => r.awbNo !== awb)]);
    toast.success(`Forwarding updated for AWB ${awb}`);
  };

  const handleReset = () => {
    setForm(emptyForm());
    toast.success("Form reset");
  };

  const handleImport = () => importInputRef.current?.click();

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const parsed = await parseTabularFile(file);
      if (parsed.rows.length === 0) {
        toast.error("File is empty");
        return;
      }
      toast.info("Import will be enabled with backend wiring");
    } catch (err) {
      toast.error(toErrorMessage(err, "Failed to import file"));
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <MasterBreadcrumb trail={["Transaction", "Tracking / Delivery", "Forwarding Updation"]} />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Forwarding Updation</h1>
        <p className="text-sm text-muted-foreground">
          Update forwarding AWB, delivery vendor, and service details for booked shipments.
        </p>
      </div>

      <Card className="min-w-0 overflow-hidden border p-4 md:p-6">
        <FormSection title="Forwarding Updation">
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <FieldWrapper label="AWB No." required>
                <div className="flex gap-1">
                  <Input
                    value={form.awbNo}
                    onChange={(e) => patchForm({ awbNo: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        loadAwb();
                      }
                    }}
                    onBlur={() => {
                      if (form.awbNo.trim()) loadAwb();
                    }}
                    autoFocus
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-9 w-9 shrink-0 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
                    aria-label="Load AWB"
                    onClick={() => loadAwb()}
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                </div>
              </FieldWrapper>
              <FieldWrapper label="Booking Date">
                <Input
                  type="date"
                  value={form.bookingDate}
                  onChange={(e) => patchForm({ bookingDate: e.target.value })}
                />
              </FieldWrapper>
              <FieldWrapper label="Destination">
                <Input
                  value={form.destination}
                  onChange={(e) => patchForm({ destination: e.target.value })}
                />
              </FieldWrapper>
              <FieldWrapper label="Vendor" required>
                <NameCodeLookupInput
                  lookup="vendor"
                  value={form.vendor}
                  onChange={(vendor) => patchForm({ vendor })}
                />
              </FieldWrapper>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <FieldWrapper label="Service" required>
                <NameCodeLookupInput
                  lookup="product"
                  value={form.service}
                  onChange={(service) => patchForm({ service })}
                />
              </FieldWrapper>
              <FieldWrapper label="Forwarding AWB">
                <Input
                  value={form.forwardingAwb}
                  onChange={(e) => patchForm({ forwardingAwb: e.target.value })}
                />
              </FieldWrapper>
              <FieldWrapper label="Delivery Vendor">
                <NameCodeLookupInput
                  lookup="vendor"
                  value={form.deliveryVendor}
                  onChange={(deliveryVendor) => patchForm({ deliveryVendor })}
                />
              </FieldWrapper>
              <FieldWrapper label="Delivery Service">
                <NameCodeLookupInput
                  lookup="product"
                  value={form.deliveryService}
                  onChange={(deliveryService) => patchForm({ deliveryService })}
                />
              </FieldWrapper>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <FieldWrapper label="Delivery AWB">
                <Input
                  value={form.deliveryAwb}
                  onChange={(e) => patchForm({ deliveryAwb: e.target.value })}
                />
              </FieldWrapper>
            </div>
          </div>
        </FormSection>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button onClick={handleSave} className="min-w-24 bg-emerald-600 text-white hover:bg-emerald-600/90">
            Save
          </Button>
          <Button variant="destructive" onClick={handleReset} className="min-w-24">
            Reset
          </Button>
          <Button variant="secondary" onClick={handleImport} className="min-w-24">
            Import
          </Button>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => void handleImportFile(e)}
          />
        </div>

        {records.length > 0 ? (
          <p className="mt-4 text-xs text-muted-foreground">
            {records.length} forwarding update(s) saved this session.
          </p>
        ) : null}
      </Card>
    </div>
  );
}

function NameCodeLookupInput({
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
          aria-label="Search"
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
