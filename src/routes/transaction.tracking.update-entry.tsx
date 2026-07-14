import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Search } from "lucide-react";
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
import { FieldWrapper, MasterBreadcrumb } from "@/components/master-table-kit";
import { MasterLookupDialog } from "@/components/master-lookup-dialog";
import { type LookupKey, type LookupOption } from "@/lib/master-lookups";
import { useAuth } from "@/lib/auth";
import { toErrorMessage } from "@/lib/masters/screen";
import { ConflictError } from "@/lib/masters/core/baseCrud";
import {
  getShipmentTracking,
  holdShipment,
  releaseShipmentHold,
} from "@/lib/transactions/resources/tracking";
import { trackingHoldSchema } from "@/lib/transactions/schemas/tracking";

type LookupPair = { code: string; name: string };
type UpdateOption = "" | "awb-hold" | "entry-lock";
type HoldType = "hold" | "release";

type AwbHoldForm = {
  awbNo: string;
  remark: string;
  shipperMailId: string;
  sendMail: boolean;
  holdType: HoldType;
};

type EntryLockForm = {
  fromDate: string;
  toDate: string;
  customer: LookupPair;
  lockAction: string;
  paymentType: LookupPair;
  serviceCenter: LookupPair;
  productType: string;
};

const UPDATE_OPTIONS = [
  { value: "awb-hold", label: "AWB Hold Unhold" },
  { value: "entry-lock", label: "Entry Lock Update" },
] as const;

const LOCK_OPTIONS = ["Lock", "Unlock"] as const;
const PRODUCT_TYPES = ["Domestic", "International", "Local", "Import"] as const;
const PAYMENT_TYPES = ["Cash", "Cheque", "Credit", "To Pay"] as const;

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const emptyPair = (): LookupPair => ({ code: "", name: "" });

const emptyAwbHoldForm = (): AwbHoldForm => ({
  awbNo: "",
  remark: "",
  shipperMailId: "",
  sendMail: true,
  holdType: "hold",
});

const emptyEntryLockForm = (): EntryLockForm => ({
  fromDate: todayIso(),
  toDate: todayIso(),
  customer: emptyPair(),
  lockAction: "Lock",
  paymentType: emptyPair(),
  serviceCenter: emptyPair(),
  productType: "",
});

export const Route = createFileRoute("/transaction/tracking/update-entry")({
  head: () => ({
    meta: [
      { title: "Update Entry — Transaction — Courier ERP" },
      { name: "description", content: "Update AWB hold status or apply entry lock rules." },
    ],
  }),
  component: UpdateEntryPage,
});

function UpdateEntryPage() {
  const { isAuthenticated: authed } = useAuth();
  const [option, setOption] = useState<UpdateOption>("");
  const [awbHoldForm, setAwbHoldForm] = useState<AwbHoldForm>(emptyAwbHoldForm());
  const [entryLockForm, setEntryLockForm] = useState<EntryLockForm>(emptyEntryLockForm());
  const [saving, setSaving] = useState(false);

  const patchAwbHold = (patch: Partial<AwbHoldForm>) => setAwbHoldForm((f) => ({ ...f, ...patch }));

  const patchEntryLock = (patch: Partial<EntryLockForm>) =>
    setEntryLockForm((f) => ({ ...f, ...patch }));

  const handleOptionChange = (value: UpdateOption) => {
    setOption(value);
    setAwbHoldForm(emptyAwbHoldForm());
    setEntryLockForm(emptyEntryLockForm());
  };

  const handleSave = async () => {
    if (!option) return toast.error("Option is required");

    if (option === "awb-hold") {
      const awb = awbHoldForm.awbNo.trim();
      if (!awb) return toast.error("AWB No. is required");
      const action = awbHoldForm.holdType === "hold" ? "held" : "released";

      if (!authed) {
        toast.success(`AWB ${awb} ${action}${awbHoldForm.sendMail ? " — mail queued" : ""} (demo)`);
        return;
      }

      const parsed = trackingHoldSchema.safeParse({
        remark: awbHoldForm.remark || undefined,
        shipper_email: awbHoldForm.shipperMailId || undefined,
        send_mail: awbHoldForm.sendMail,
      });
      if (!parsed.success) {
        return toast.error(parsed.error.issues[0]?.message ?? "Invalid hold fields");
      }

      setSaving(true);
      try {
        const timeline = await getShipmentTracking(awb);
        if (!timeline.found || !timeline.shipment) {
          toast.error(`No record found for AWB ${awb}`);
          return;
        }
        const rowVersion = Number(timeline.shipment.row_version ?? 0);
        if (awbHoldForm.holdType === "hold") {
          await holdShipment({ awb_no: awb, row_version: rowVersion, fields: parsed.data });
        } else {
          await releaseShipmentHold({
            awb_no: awb,
            row_version: rowVersion,
            fields: parsed.data,
          });
        }
        toast.success(`AWB ${awb} ${action}${awbHoldForm.sendMail ? " — mail flagged" : ""}`);
      } catch (err) {
        if (err instanceof ConflictError) toast.error(err.message);
        else toast.error(toErrorMessage(err));
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!entryLockForm.fromDate.trim()) return toast.error("From Date is required");
    if (!entryLockForm.toDate.trim()) return toast.error("To Date is required");
    if (!entryLockForm.lockAction) return toast.error("Lock / UnLock is required");

    toast.message("Entry lock update remains a placeholder in Tracking Foundation.");
  };

  const handleReset = () => {
    setAwbHoldForm(emptyAwbHoldForm());
    setEntryLockForm(emptyEntryLockForm());
    toast.success("Form reset");
  };

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <MasterBreadcrumb trail={["Transaction", "Tracking / Delivery", "Update Entry"]} />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Update Entry</h1>
        <p className="text-sm text-muted-foreground">
          Apply AWB hold/release updates or bulk entry lock changes by date range.
          {authed ? " Connected to live backend." : " Demo mode — sign in for live hold/release."}
        </p>
      </div>

      <Card className="min-w-0 overflow-hidden border p-4 md:p-6">
        <div className="space-y-4">
          <div className="max-w-md">
            <FieldWrapper label="Option">
              <Select
                value={option || undefined}
                onValueChange={(v) => handleOptionChange(v as UpdateOption)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Option" />
                </SelectTrigger>
                <SelectContent>
                  {UPDATE_OPTIONS.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldWrapper>
          </div>

          {option === "awb-hold" ? (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <FieldWrapper label="AWB No.">
                  <Input
                    value={awbHoldForm.awbNo}
                    onChange={(e) => patchAwbHold({ awbNo: e.target.value })}
                    autoFocus
                  />
                </FieldWrapper>
                <FieldWrapper label="Remark" className="md:col-span-2 xl:col-span-2">
                  <Input
                    value={awbHoldForm.remark}
                    onChange={(e) => patchAwbHold({ remark: e.target.value })}
                  />
                </FieldWrapper>
                <FieldWrapper label="Shipper Mail Id">
                  <Input
                    type="email"
                    value={awbHoldForm.shipperMailId}
                    onChange={(e) => patchAwbHold({ shipperMailId: e.target.value })}
                  />
                </FieldWrapper>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <FieldWrapper label="Send Mail">
                  <label className="flex h-9 items-center gap-2">
                    <Checkbox
                      checked={awbHoldForm.sendMail}
                      onCheckedChange={(checked) => patchAwbHold({ sendMail: checked === true })}
                    />
                    <span className="text-sm text-muted-foreground">Send Mail</span>
                  </label>
                </FieldWrapper>
                <FieldWrapper label="Type">
                  <div className="flex h-9 w-fit overflow-hidden rounded-md border">
                    <Button
                      type="button"
                      variant="ghost"
                      className={cn(
                        "h-9 rounded-none px-6 text-sm",
                        awbHoldForm.holdType === "hold"
                          ? "bg-emerald-600 text-white hover:bg-emerald-600/90 hover:text-white"
                          : "text-emerald-700 hover:bg-muted/50",
                      )}
                      onClick={() => patchAwbHold({ holdType: "hold" })}
                    >
                      Hold
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className={cn(
                        "h-9 rounded-none border-l px-6 text-sm",
                        awbHoldForm.holdType === "release"
                          ? "bg-emerald-600 text-white hover:bg-emerald-600/90 hover:text-white"
                          : "text-emerald-700 hover:bg-muted/50",
                      )}
                      onClick={() => patchAwbHold({ holdType: "release" })}
                    >
                      Release
                    </Button>
                  </div>
                </FieldWrapper>
              </div>
            </>
          ) : null}

          {option === "entry-lock" ? (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <FieldWrapper label="From Date">
                  <Input
                    type="date"
                    value={entryLockForm.fromDate}
                    onChange={(e) => patchEntryLock({ fromDate: e.target.value })}
                  />
                </FieldWrapper>
                <FieldWrapper label="To Date">
                  <Input
                    type="date"
                    value={entryLockForm.toDate}
                    onChange={(e) => patchEntryLock({ toDate: e.target.value })}
                  />
                </FieldWrapper>
                <FieldWrapper label="Customer">
                  <LookupPairInput
                    lookup="customer"
                    value={entryLockForm.customer}
                    onChange={(customer) => patchEntryLock({ customer })}
                  />
                </FieldWrapper>
                <FieldWrapper label="Lock / UnLock">
                  <Select
                    value={entryLockForm.lockAction}
                    onValueChange={(lockAction) => patchEntryLock({ lockAction })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LOCK_OPTIONS.map((lock) => (
                        <SelectItem key={lock} value={lock}>
                          {lock}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldWrapper>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <FieldWrapper label="Payment Type">
                  <Select
                    value={entryLockForm.paymentType.name}
                    onValueChange={(name) =>
                      patchEntryLock({
                        paymentType: { code: name.slice(0, 3).toUpperCase(), name },
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Payment Type" />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldWrapper>
                <FieldWrapper label="Service Center">
                  <LookupPairInput
                    lookup="serviceCentre"
                    value={entryLockForm.serviceCenter}
                    onChange={(serviceCenter) => patchEntryLock({ serviceCenter })}
                  />
                </FieldWrapper>
                <FieldWrapper label="Product Type">
                  <Select
                    value={entryLockForm.productType}
                    onValueChange={(productType) => patchEntryLock({ productType })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Type" />
                    </SelectTrigger>
                    <SelectContent>
                      {PRODUCT_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldWrapper>
              </div>
            </>
          ) : null}
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button
            onClick={() => void handleSave()}
            disabled={saving}
            className="min-w-24 bg-emerald-600 text-white hover:bg-emerald-600/90"
          >
            Save
          </Button>
          <Button variant="destructive" onClick={handleReset} className="min-w-24">
            Reset
          </Button>
        </div>
      </Card>
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
          value={value.code}
          onChange={(e) => onChange({ ...value, code: e.target.value })}
          className="w-24"
          placeholder="Code"
        />
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
