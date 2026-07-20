/**
 * Per-tenant Vendor Shipping Integration configuration.
 * Maps provider + credentials + OTP + services to Vendor Master rows.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listIntegrationCredentials, listIntegrationProviders } from "@/lib/integrations/resources";
import {
  listVendorIntegrations,
  saveVendorIntegration,
  type VendorIntegrationRow,
} from "@/lib/integrations/vendor-shipping";
import { toErrorMessage } from "@/lib/masters/screen";

type FormState = {
  provider_code: string;
  credential_id: string;
  endpoint_url: string;
  is_enabled: boolean;
  requires_otp: boolean;
  account_number: string;
  customer_code: string;
  enabled_services: string;
  supported_products: string;
  mapped_vendor_ids: string;
  remark: string;
};

const emptyForm = (): FormState => ({
  provider_code: "XPRESION",
  credential_id: "",
  endpoint_url: "https://xpresion.courierwalaexpress.in/api/v1/Awbentry/Awbentry",
  is_enabled: true,
  requires_otp: true,
  account_number: "",
  customer_code: "",
  enabled_services: "",
  supported_products: "",
  mapped_vendor_ids: "",
  remark: "",
});

function splitCsv(v: string): string[] {
  return v
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function VendorIntegrationsPanel({ canModify }: { canModify: boolean }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"list" | "form">("list");
  const [editing, setEditing] = useState<VendorIntegrationRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [busy, setBusy] = useState(false);

  const listQuery = useQuery({
    queryKey: ["vendor-integrations"],
    queryFn: listVendorIntegrations,
  });
  const providersQuery = useQuery({
    queryKey: ["integration-providers"],
    queryFn: () => listIntegrationProviders("ACTIVE"),
  });
  const credsQuery = useQuery({
    queryKey: ["integration-credentials"],
    queryFn: listIntegrationCredentials,
  });

  const rows = listQuery.data ?? [];
  const providers = useMemo(() => {
    const all = providersQuery.data ?? [];
    return all.filter(
      (p) =>
        p.provider_type === "VENDOR_GATEWAY" ||
        p.provider_type === "CARRIER" ||
        p.provider_code === "XPRESION",
    );
  }, [providersQuery.data]);
  const creds = credsQuery.data ?? [];

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm());
    setMode("form");
  };

  const openEdit = (row: VendorIntegrationRow) => {
    setEditing(row);
    setForm({
      provider_code: row.provider_code,
      credential_id: row.credential_id ?? "",
      endpoint_url: row.endpoint_url ?? "",
      is_enabled: row.is_enabled,
      requires_otp: row.requires_otp,
      account_number: row.account_number ?? "",
      customer_code: row.customer_code ?? "",
      enabled_services: row.enabled_services.join(", "),
      supported_products: row.supported_products.join(", "),
      mapped_vendor_ids: row.mapped_vendor_ids.join(", "),
      remark: row.remark ?? "",
    });
    setMode("form");
  };

  const onSave = async () => {
    if (!canModify) return toast.error("Permission denied");
    if (!form.provider_code.trim()) return toast.error("Provider is required");
    setBusy(true);
    try {
      await saveVendorIntegration({
        id: editing?.id ?? null,
        rowVersion: editing?.row_version ?? null,
        fields: {
          provider_code: form.provider_code.trim().toUpperCase(),
          credential_id: form.credential_id || null,
          endpoint_url: form.endpoint_url || null,
          is_enabled: form.is_enabled,
          requires_otp: form.requires_otp,
          account_number: form.account_number || null,
          customer_code: form.customer_code || null,
          enabled_services: splitCsv(form.enabled_services),
          supported_products: splitCsv(form.supported_products),
          mapped_vendor_ids: splitCsv(form.mapped_vendor_ids),
          remark: form.remark || null,
        },
      });
      toast.success(editing ? "Vendor integration updated" : "Vendor integration created");
      await queryClient.invalidateQueries({ queryKey: ["vendor-integrations"] });
      setMode("list");
    } catch (e) {
      toast.error(toErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (mode === "form") {
    return (
      <div className="space-y-4 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            {editing ? "Edit Vendor Integration" : "Add Vendor Integration"}
          </h3>
          <Button variant="ghost" size="sm" onClick={() => setMode("list")}>
            Back
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-medium">
            Provider *
            <Select
              value={form.provider_code}
              onValueChange={(v) => setForm((f) => ({ ...f, provider_code: v }))}
              disabled={Boolean(editing)}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {providers.map((p) => (
                  <SelectItem key={p.id} value={p.provider_code}>
                    {p.provider_name} ({p.provider_code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium">
            Linked Credentials
            <Select
              value={form.credential_id || "__none__"}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, credential_id: v === "__none__" ? "" : v }))
              }
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select credentials" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {creds.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.provider_code} {c.username ? `· ${c.username}` : ""}{" "}
                    {c.sandbox_mode ? "(sandbox)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium md:col-span-2">
            Endpoint URL
            <Input
              className="h-9"
              value={form.endpoint_url}
              onChange={(e) => setForm((f) => ({ ...f, endpoint_url: e.target.value }))}
              placeholder="https://…"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium">
            Account Number
            <Input
              className="h-9"
              value={form.account_number}
              onChange={(e) => setForm((f) => ({ ...f, account_number: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium">
            Customer Code (API)
            <Input
              className="h-9"
              value={form.customer_code}
              onChange={(e) => setForm((f) => ({ ...f, customer_code: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium md:col-span-2">
            Enabled Services (comma-separated)
            <Input
              className="h-9"
              value={form.enabled_services}
              onChange={(e) => setForm((f) => ({ ...f, enabled_services: e.target.value }))}
              placeholder="SELF, EXPRESS"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium md:col-span-2">
            Supported Products (comma-separated)
            <Input
              className="h-9"
              value={form.supported_products}
              onChange={(e) => setForm((f) => ({ ...f, supported_products: e.target.value }))}
              placeholder="SPX, DOX"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium md:col-span-2">
            Mapped Vendor IDs (comma-separated UUIDs; empty = all shipping-enabled vendors)
            <Input
              className="h-9"
              value={form.mapped_vendor_ids}
              onChange={(e) => setForm((f) => ({ ...f, mapped_vendor_ids: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium md:col-span-2">
            Remark
            <Input
              className="h-9"
              value={form.remark}
              onChange={(e) => setForm((f) => ({ ...f, remark: e.target.value }))}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.is_enabled}
              onCheckedChange={(c) => setForm((f) => ({ ...f, is_enabled: c === true }))}
            />
            Enabled
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.requires_otp}
              onCheckedChange={(c) => setForm((f) => ({ ...f, requires_otp: c === true }))}
            />
            OTP Required
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setMode("list")} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void onSave()} disabled={busy || !canModify}>
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Vendor Shipping Integrations</h3>
          <p className="text-xs text-muted-foreground">
            Per-company provider config (credentials, endpoint, OTP, services). AWB Entry stays
            provider-agnostic.
          </p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={openAdd} disabled={!canModify}>
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-sidebar hover:bg-sidebar">
              <TableHead className="text-sidebar-foreground">Provider</TableHead>
              <TableHead className="text-sidebar-foreground">Endpoint</TableHead>
              <TableHead className="text-sidebar-foreground">OTP</TableHead>
              <TableHead className="text-sidebar-foreground">Enabled</TableHead>
              <TableHead className="text-sidebar-foreground">Account</TableHead>
              <TableHead className="text-sidebar-foreground text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                  {listQuery.isLoading ? "Loading…" : "No vendor integrations configured"}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.provider_code}</TableCell>
                  <TableCell className="max-w-[220px] truncate text-xs">
                    {r.endpoint_url || "—"}
                  </TableCell>
                  <TableCell>{r.requires_otp ? "Yes" : "No"}</TableCell>
                  <TableCell>{r.is_enabled ? "Yes" : "No"}</TableCell>
                  <TableCell className="text-xs">
                    {r.customer_code || r.account_number || "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => openEdit(r)}
                      disabled={!canModify}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
