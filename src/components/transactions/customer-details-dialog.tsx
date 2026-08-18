/**
 * Customer Details — two-column quick edit for the selected AWB client.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { masterKeys } from "@/lib/masters/core/queryKeys";
import { toErrorMessage } from "@/lib/masters/screen";
import {
  CUSTOMER_QUICK_DOCUMENT_TYPES,
  emptyCustomerQuickEdit,
  loadCustomerQuickEditByPair,
  saveCustomerQuickEdit,
  validateCustomerQuickEdit,
  type CustomerQuickEdit,
  type CustomerQuickEditErrors,
} from "@/lib/transactions/resources/customerQuickEdit";
import { cn } from "@/lib/utils";

const NONE = "__none__";

function RequiredMark() {
  return (
    <span className="text-destructive" aria-hidden>
      *
    </span>
  );
}

function Field({
  id,
  label,
  required,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-start gap-2">
      <Label htmlFor={id} className="pt-1.5 text-[12px] font-normal text-foreground">
        {label} {required ? <RequiredMark /> : null}
      </Label>
      <div className="min-w-0">
        {children}
        {error ? (
          <p id={`${id}-error`} className="mt-0.5 text-[11px] text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function fieldInputClass(invalid?: boolean) {
  return cn("h-8 text-[13px]", invalid && "border-destructive focus-visible:ring-destructive");
}

export function CustomerDetailsDialog({
  open,
  onOpenChange,
  customer,
  createName,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: { id?: string; code: string; name: string } | null;
  /** Pre-fill name when creating from Customer Help. */
  createName?: string;
  onSaved: (row: { id: string; code: string; name: string }) => void;
}) {
  const queryClient = useQueryClient();
  const creating = !customer?.id && !customer?.code.trim();
  const [edit, setEdit] = useState<CustomerQuickEdit>(emptyCustomerQuickEdit());
  const [errors, setErrors] = useState<CustomerQuickEditErrors>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setErrors({});
    setLoadError(null);

    if (creating) {
      setEdit({
        ...emptyCustomerQuickEdit(),
        name: createName?.trim() ?? "",
      });
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    void loadCustomerQuickEditByPair(customer ?? { code: "", name: "" })
      .then((row) => {
        if (cancelled) return;
        if (!row) {
          setLoadError("Customer not found");
          setEdit(emptyCustomerQuickEdit());
          return;
        }
        setEdit(row);
      })
      .catch((e) => {
        if (cancelled) return;
        const msg = toErrorMessage(e, "Failed to load customer");
        setLoadError(msg);
        toast.error(msg);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, customer?.id, customer?.code, customer?.name, creating, createName]);

  const patch = (partial: Partial<CustomerQuickEdit>) => {
    setEdit((prev) => ({ ...prev, ...partial }));
    const keys = Object.keys(partial) as Array<keyof CustomerQuickEdit>;
    if (keys.some((k) => errors[k])) {
      setErrors((prev) => {
        const next = { ...prev };
        for (const k of keys) delete next[k];
        return next;
      });
    }
  };

  const handleSave = async () => {
    const nextErrors = validateCustomerQuickEdit(edit, { requireCode: creating });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      toast.error(Object.values(nextErrors)[0] ?? "Please fill required fields");
      return;
    }
    setSaving(true);
    try {
      const saved = await saveCustomerQuickEdit(edit);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: masterKeys.all("customers") }),
        queryClient.invalidateQueries({ queryKey: masterKeys.lookupRoot("customer") }),
      ]);
      toast.success("Customer saved");
      onSaved({ id: saved.id, code: saved.code, name: saved.name });
      onOpenChange(false);
    } catch (e) {
      toast.error(toErrorMessage(e, "Failed to save customer"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl gap-0 overflow-hidden p-0 [&>button]:top-2.5 [&>button]:right-3 [&>button]:text-sidebar-foreground"
      >
        <div className="bg-sidebar px-4 py-2.5 pr-12 text-sidebar-foreground">
          <DialogTitle className="text-base font-semibold text-sidebar-foreground">
            Customer Details
          </DialogTitle>
          <DialogDescription className="sr-only">
            Edit customer contact and address details. Required fields are marked with an asterisk.
          </DialogDescription>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading customer…
          </div>
        ) : loadError ? (
          <div className="space-y-3 p-4">
            <p className="text-sm text-destructive">{loadError}</p>
            <div className="flex justify-end">
              <Button type="button" variant="destructive" size="sm" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 p-4">
            <div className="grid grid-cols-1 gap-x-6 gap-y-2 md:grid-cols-2">
              {creating ? (
                <Field id="cust-code" label="Code" required error={errors.code}>
                  <Input
                    id="cust-code"
                    value={edit.code}
                    onChange={(e) => patch({ code: e.target.value.toUpperCase() })}
                    className={fieldInputClass(Boolean(errors.code))}
                    aria-invalid={Boolean(errors.code)}
                    aria-describedby={errors.code ? "cust-code-error" : undefined}
                  />
                </Field>
              ) : (
                <Field id="cust-code" label="Code">
                  <Input id="cust-code" value={edit.code} readOnly className={cn(fieldInputClass(), "bg-muted/40")} />
                </Field>
              )}
              <Field id="cust-name" label="Name" required error={errors.name}>
                <Input
                  id="cust-name"
                  value={edit.name}
                  onChange={(e) => patch({ name: e.target.value })}
                  className={fieldInputClass(Boolean(errors.name))}
                  aria-invalid={Boolean(errors.name)}
                  aria-describedby={errors.name ? "cust-name-error" : undefined}
                />
              </Field>
              <Field id="cust-person" label="Person">
                <Input
                  id="cust-person"
                  value={edit.contactPerson}
                  onChange={(e) => patch({ contactPerson: e.target.value })}
                  className={fieldInputClass()}
                />
              </Field>
              <Field id="cust-address" label="Address" required error={errors.address1}>
                <Input
                  id="cust-address"
                  value={edit.address1}
                  onChange={(e) => patch({ address1: e.target.value })}
                  className={fieldInputClass(Boolean(errors.address1))}
                  aria-invalid={Boolean(errors.address1)}
                  aria-describedby={errors.address1 ? "cust-address-error" : undefined}
                />
              </Field>
              <Field id="cust-city" label="City" required error={errors.city}>
                <Input
                  id="cust-city"
                  value={edit.city}
                  onChange={(e) => patch({ city: e.target.value })}
                  className={fieldInputClass(Boolean(errors.city))}
                  aria-invalid={Boolean(errors.city)}
                  aria-describedby={errors.city ? "cust-city-error" : undefined}
                />
              </Field>
              <Field id="cust-state" label="State" required error={errors.state}>
                <Input
                  id="cust-state"
                  value={edit.state}
                  onChange={(e) => patch({ state: e.target.value })}
                  className={fieldInputClass(Boolean(errors.state))}
                  aria-invalid={Boolean(errors.state)}
                  aria-describedby={errors.state ? "cust-state-error" : undefined}
                />
              </Field>
              <Field id="cust-pin" label="Pincode" required error={errors.pincode}>
                <Input
                  id="cust-pin"
                  value={edit.pincode}
                  onChange={(e) => patch({ pincode: e.target.value })}
                  className={fieldInputClass(Boolean(errors.pincode))}
                  aria-invalid={Boolean(errors.pincode)}
                  aria-describedby={errors.pincode ? "cust-pin-error" : undefined}
                />
              </Field>
              <Field id="cust-tel" label="Telephone">
                <Input
                  id="cust-tel"
                  value={edit.telephone}
                  onChange={(e) => patch({ telephone: e.target.value })}
                  className={fieldInputClass()}
                />
              </Field>
              <Field id="cust-fax" label="Fax No">
                <Input
                  id="cust-fax"
                  value={edit.faxNo}
                  onChange={(e) => patch({ faxNo: e.target.value })}
                  className={fieldInputClass()}
                />
              </Field>
              <Field id="cust-mobile" label="Mobile No" required error={errors.mobileNo}>
                <Input
                  id="cust-mobile"
                  value={edit.mobileNo}
                  onChange={(e) => patch({ mobileNo: e.target.value })}
                  className={fieldInputClass(Boolean(errors.mobileNo))}
                  aria-invalid={Boolean(errors.mobileNo)}
                  aria-describedby={errors.mobileNo ? "cust-mobile-error" : undefined}
                />
              </Field>
              <Field id="cust-email" label="E-Mail">
                <Input
                  id="cust-email"
                  type="email"
                  value={edit.email}
                  onChange={(e) => patch({ email: e.target.value })}
                  className={fieldInputClass()}
                />
              </Field>
              <Field id="cust-doc-type" label="Document Type">
                <Select
                  value={edit.documentType || NONE}
                  onValueChange={(v) => patch({ documentType: v === NONE ? "" : v })}
                >
                  <SelectTrigger id="cust-doc-type" className="h-8 text-[13px]">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Select</SelectItem>
                    {CUSTOMER_QUICK_DOCUMENT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field id="cust-doc-no" label="Document No">
                <Input
                  id="cust-doc-no"
                  value={edit.documentNo}
                  onChange={(e) => patch({ documentNo: e.target.value })}
                  className={fieldInputClass()}
                />
              </Field>
              <Field id="cust-sales" label="Sales Executive">
                <Input
                  id="cust-sales"
                  value={edit.salesExecutive}
                  onChange={(e) => patch({ salesExecutive: e.target.value })}
                  className={fieldInputClass()}
                />
              </Field>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" size="sm" className="h-8" disabled={saving} onClick={() => void handleSave()}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Save
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="h-8"
                disabled={saving}
                onClick={() => onOpenChange(false)}
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
