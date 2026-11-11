import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { SearchableLookupPair, type LookupPairValue } from "@/components/masters/searchable-lookup-pair";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FieldWrapper, MasterBreadcrumb } from "@/components/master-table-kit";
import { MASTER_LOOKUPS } from "@/lib/master-lookups";
import { toErrorMessage } from "@/lib/masters/screen";
import { applyRateUpdate, previewRateUpdate, type RateUpdatePreview } from "@/lib/rate-update/resources";
import { rateUpdateScopeBlocked, skipReasonLabel } from "@/lib/rate-update/previewMath";
import type { RateUpdateType } from "@/lib/rate-update/types";

type ContractMode = "all" | "zero-contract";

type RateUpdateForm = {
  updateType: string;
  fromDate: string;
  toDate: string;
  serviceCenter: LookupPairValue;
  origin: LookupPairValue;
  customer: LookupPairValue;
  product: LookupPairValue;
  vendor: LookupPairValue;
  destination: LookupPairValue;
  paymentType: string;
  contractMode: ContractMode;
  confirmAll: boolean;
};

const emptyPair = (): LookupPairValue => ({ code: "", name: "" });
const todayIso = () => new Date().toISOString().slice(0, 10);

const emptyForm = (): RateUpdateForm => ({
  updateType: "AWB Entry Rate",
  fromDate: todayIso(),
  toDate: todayIso(),
  serviceCenter: emptyPair(),
  origin: emptyPair(),
  customer: emptyPair(),
  product: emptyPair(),
  vendor: emptyPair(),
  destination: emptyPair(),
  paymentType: "",
  contractMode: "all",
  confirmAll: false,
});

const updateTypes = ["AWB Entry Rate", "Vendor Rate", "Tax & Fuel"] as const;
const paymentOptions = MASTER_LOOKUPS.paymentType.options;

const SCOPE_MESSAGE =
  "Choose a customer, vendor, or destination, or tick I confirm all shipments in this date range";

function uiUpdateType(label: string): RateUpdateType {
  if (label === "Vendor Rate") return "VENDOR_RATE";
  if (label === "Tax & Fuel") return "TAX_FUEL";
  return "AWB_RATE";
}

function money(value: number): string {
  return Number(value || 0).toFixed(2);
}

export const Route = createFileRoute("/utility/rate-zone-update/rate-update")({
  head: () => ({
    meta: [
      { title: "Rate Update — Utility — Courier ERP" },
      { name: "description", content: "Preview and confirm AWB, vendor, tax, and fuel rate updates." },
    ],
  }),
  component: RateUpdatePage,
});

function RateUpdatePage() {
  const [form, setForm] = useState<RateUpdateForm>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<RateUpdatePreview | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [scopeError, setScopeError] = useState("");

  const patch = (updates: Partial<RateUpdateForm>) =>
    setForm((current) => ({ ...current, ...updates }));

  const filters = () => {
    const payment = paymentOptions.find((option) => option.name === form.paymentType);
    return {
      from_date: form.fromDate,
      to_date: form.toDate,
      customer_id: form.customer.id || null,
      customer_code: form.customer.code.trim() || null,
      product_id: form.product.id || null,
      product_code: form.product.code.trim() || null,
      destination_id: form.destination.id || null,
      destination_code: form.destination.code.trim() || null,
      origin_id: form.origin.id || null,
      origin_code: form.origin.code.trim() || null,
      vendor_id: form.vendor.id || null,
      vendor_code: form.vendor.code.trim() || null,
      branch_id: form.serviceCenter.id || null,
      branch_code: form.serviceCenter.code.trim() || null,
      payment_type: form.paymentType.trim() || null,
      payment_code: payment?.code ?? null,
      contract_mode: form.contractMode === "zero-contract" ? "zero" : "all",
      confirm_all: form.confirmAll,
    };
  };

  const handlePreview = async () => {
    if (!form.updateType) return toast.error("Update Type is required");
    if (!form.fromDate || !form.toDate) return toast.error("Date range is required");
    if (
      rateUpdateScopeBlocked({
        customer: form.customer.code || form.customer.name,
        vendor: form.vendor.code || form.vendor.name,
        destination: form.destination.code || form.destination.name,
        confirmAll: form.confirmAll,
      })
    ) {
      setScopeError(SCOPE_MESSAGE);
      return toast.error(SCOPE_MESSAGE);
    }
    setScopeError("");

    setBusy(true);
    setPreview(null);
    try {
      const result = await previewRateUpdate({
        updateType: uiUpdateType(form.updateType),
        filters: filters(),
      });
      setPreview(result);
      if (result.change_count === 0 && result.skip_count === 0) {
        toast.message("No shipments in this range would change");
      }
    } catch (err) {
      toast.error(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleApply = async () => {
    setConfirmOpen(false);
    setBusy(true);
    try {
      const result = await applyRateUpdate({
        updateType: uiUpdateType(form.updateType),
        filters: filters(),
      });
      toast.success(
        `Updated ${result.applied} AWBs. Skipped ${result.skipped}. Difference ${money(result.difference_total)}.`,
      );
      setPreview(null);
    } catch (err) {
      toast.error(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const vendorMode = form.updateType === "Vendor Rate";

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <MasterBreadcrumb trail={["Utility", "Rate / Zone Update", "Rate Update"]} />

      <Card className="min-w-0 border p-4">
        <p className="mb-3 text-xs font-semibold text-blue-700">
          Nothing is saved until you preview and then confirm. Locked, invoiced, and cancelled AWBs
          are skipped. Booked AWBs keep their charges until you confirm.
        </p>

        <div className="grid gap-x-3 gap-y-2 lg:grid-cols-4">
          <SelectField
            label="Update Type"
            value={form.updateType}
            options={[...updateTypes]}
            onChange={(updateType) => {
              patch({ updateType });
              setPreview(null);
            }}
          />
          <FieldWrapper label="From Date" required>
            <Input
              type="date"
              value={form.fromDate}
              onChange={(event) => patch({ fromDate: event.target.value })}
              className="h-9"
            />
          </FieldWrapper>
          <FieldWrapper label="To Date" required>
            <Input
              type="date"
              value={form.toDate}
              onChange={(event) => patch({ toDate: event.target.value })}
              className="h-9"
            />
          </FieldWrapper>
          <FieldWrapper label="Service Center">
            <SearchableLookupPair
              lookup="serviceCentre"
              liveLookup="service-center"
              value={form.serviceCenter}
              onChange={(serviceCenter) => patch({ serviceCenter })}
            />
          </FieldWrapper>
          <FieldWrapper label="Origin">
            <SearchableLookupPair
              lookup="destination"
              liveLookup="destination"
              value={form.origin}
              onChange={(origin) => patch({ origin })}
            />
          </FieldWrapper>
          <FieldWrapper label="Customer">
            <SearchableLookupPair
              lookup="customer"
              liveLookup="customer"
              value={form.customer}
              onChange={(customer) => patch({ customer })}
            />
          </FieldWrapper>
          <FieldWrapper label="Product">
            <SearchableLookupPair
              lookup="product"
              liveLookup="product"
              value={form.product}
              onChange={(product) => patch({ product })}
            />
          </FieldWrapper>
          <FieldWrapper label="Vendor">
            <SearchableLookupPair
              lookup="vendor"
              liveLookup="vendor"
              value={form.vendor}
              onChange={(vendor) => patch({ vendor })}
            />
          </FieldWrapper>
          <FieldWrapper label="Destination">
            <SearchableLookupPair
              lookup="destination"
              liveLookup="destination"
              value={form.destination}
              onChange={(destination) => patch({ destination })}
            />
          </FieldWrapper>
          <SelectField
            label="Payment Type"
            value={form.paymentType}
            options={paymentOptions.map((option) => option.name)}
            placeholder="Select Payment Type"
            onChange={(paymentType) => patch({ paymentType })}
          />
          <div className="flex items-end gap-2">
            <ToggleButton
              active={form.contractMode === "all"}
              onClick={() => patch({ contractMode: "all" })}
            >
              All
            </ToggleButton>
            <ToggleButton
              active={form.contractMode === "zero-contract"}
              onClick={() => patch({ contractMode: "zero-contract" })}
            >
              Zero Contract(0)
            </ToggleButton>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          AWB Entry Rate rerates the customer freight, fuel, and tax, and may update the zone.
          Vendor Rate changes only the vendor cost. Tax &amp; Fuel changes only fuel and tax.
          Vendor OBC Rate was removed: there is no separate OBC price.
          {vendorMode ? " For Vendor Rate, Total is the vendor cost." : ""}
        </p>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <Checkbox
            data-testid="rate-update-confirm-all"
            checked={form.confirmAll}
            onCheckedChange={(value) => patch({ confirmAll: value === true })}
          />
          I confirm all shipments in this date range
        </label>
        {scopeError ? (
          <p className="mt-2 text-sm text-red-600" data-testid="rate-update-scope-error">
            {scopeError}
          </p>
        ) : null}
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3 px-2">
        <p className="text-base font-semibold text-red-500">Note : Data Update Limit - 92 Days</p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            data-testid="rate-update-ok"
            disabled={busy}
            onClick={() => void handlePreview()}
            className="h-9 rounded-full bg-green-500 px-8 text-white hover:bg-green-600"
          >
            Ok
          </Button>
          <Button
            onClick={() => {
              setForm(emptyForm());
              setPreview(null);
            }}
            className="h-9 rounded-full bg-red-500 px-8 text-white hover:bg-red-600"
          >
            Reset
          </Button>
        </div>
      </div>

      {preview ? (
        <Card className="min-w-0 border p-4" data-testid="rate-update-preview">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              {preview.change_count} would change. {preview.skip_count} skipped.{" "}
              {preview.unchanged_count} already match and are not listed.
              {preview.omitted_count > 0
                ? ` ${preview.omitted_count} more not included.`
                : ""}
            </p>
            <Button
              data-testid="rate-update-confirm"
              disabled={busy || preview.change_count === 0}
              onClick={() => setConfirmOpen(true)}
              className="h-9 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
            >
              Confirm &amp; Apply
            </Button>
          </div>
          <div className="max-h-[28rem] overflow-auto">
            <table className="w-full min-w-[960px] border-collapse text-xs">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b text-left">
                  <th className="px-2 py-1">AWB</th>
                  <th className="px-2 py-1">Customer</th>
                  <th className="px-2 py-1">Zone</th>
                  <th className="px-2 py-1">Old freight</th>
                  <th className="px-2 py-1">New freight</th>
                  <th className="px-2 py-1">Old fuel</th>
                  <th className="px-2 py-1">New fuel</th>
                  <th className="px-2 py-1">Old tax</th>
                  <th className="px-2 py-1">New tax</th>
                  <th className="px-2 py-1">Old total</th>
                  <th className="px-2 py-1">New total</th>
                  <th className="px-2 py-1">Difference</th>
                  <th className="px-2 py-1">Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.shipment_id || row.awb_no} className="border-b">
                    <td className="px-2 py-1">{row.awb_no}</td>
                    <td className="px-2 py-1">
                      {row.customer_code ? `${row.customer_code} ` : ""}
                      {row.customer_name ?? ""}
                    </td>
                    <td className="px-2 py-1">
                      {row.old_zone ?? "—"} → {row.new_zone ?? "—"}
                    </td>
                    <td className="px-2 py-1">{money(row.old_freight)}</td>
                    <td className="px-2 py-1">{money(row.new_freight)}</td>
                    <td className="px-2 py-1">{money(row.old_fuel)}</td>
                    <td className="px-2 py-1">{money(row.new_fuel)}</td>
                    <td className="px-2 py-1">{money(row.old_tax)}</td>
                    <td className="px-2 py-1">{money(row.new_tax)}</td>
                    <td className="px-2 py-1">{money(row.old_total)}</td>
                    <td className="px-2 py-1">{money(row.new_total)}</td>
                    <td className="px-2 py-1" data-testid="rate-update-diff">
                      {money(row.difference)}
                    </td>
                    <td className="px-2 py-1">
                      {row.skip_reason ? skipReasonLabel(row.skip_reason) : "Will change"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td className="px-2 py-2" colSpan={11}>
                    Grand total difference
                  </td>
                  <td className="px-2 py-2" data-testid="rate-update-grand">
                    {money(preview.difference_total)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      ) : null}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply this rate update?</AlertDialogTitle>
            <AlertDialogDescription>
              This will change {preview?.change_count ?? 0} AWBs. The total difference is{" "}
              {money(preview?.difference_total ?? 0)}. Locked, invoiced, and cancelled AWBs are not
              changed. This writes the new amounts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction data-testid="rate-update-apply" onClick={() => void handleApply()}>
              Confirm &amp; Apply
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <FieldWrapper label={label}>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger className="h-9">
          <SelectValue placeholder={placeholder ?? label} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldWrapper>
  );
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "default" : "outline"}
      className={`h-8 ${active ? "bg-green-600 text-white hover:bg-green-700" : ""}`}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
