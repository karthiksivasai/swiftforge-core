import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { IconButton, MasterBreadcrumb } from "@/components/master-table-kit";
import { useAuth } from "@/lib/auth";
import {
  deleteIntegrationCredentials,
  listIntegrationCredentials,
  listIntegrationProviders,
  saveIntegrationCredentials,
  testIntegrationConnection,
} from "@/lib/integrations/resources";
import { testIrnConnection } from "@/lib/integrations/irn";
import { testCustomsConnection } from "@/lib/integrations/customs-edi";
import { CustomsEdiExportPanel } from "@/components/integrations/customs-edi-export-panel";
import { VendorIntegrationsPanel } from "@/components/integrations/vendor-integrations-panel";
import { integrationCredentialSchema } from "@/lib/integrations/schemas";
import type { IntegrationCredential, IntegrationProvider } from "@/lib/integrations/types";
import { toErrorMessage } from "@/lib/masters/screen";
import { canDo, VENDOR_AGGREGATE_PERMISSIONS } from "@/lib/permissions";

type CredForm = {
  provider_code: string;
  username: string;
  password: string;
  api_key: string;
  api_secret: string;
  account_number: string;
  endpoint: string;
  sandbox_mode: boolean;
  is_active: boolean;
  remark: string;
};

const emptyForm = (): CredForm => ({
  provider_code: "",
  username: "",
  password: "",
  api_key: "",
  api_secret: "",
  account_number: "",
  endpoint: "",
  sandbox_mode: false,
  is_active: true,
  remark: "",
});

const DEMO_PROVIDERS: IntegrationProvider[] = [
  {
    id: "1",
    provider_code: "FEDEX",
    provider_name: "FedEx",
    provider_type: "CARRIER",
    status: "ACTIVE",
    supports_booking: true,
    supports_tracking: true,
    supports_labels: true,
    supports_serviceability: true,
    sort_order: 10,
  },
  {
    id: "2",
    provider_code: "DHL",
    provider_name: "DHL",
    provider_type: "CARRIER",
    status: "ACTIVE",
    supports_booking: true,
    supports_tracking: true,
    supports_labels: true,
    supports_serviceability: true,
    sort_order: 20,
  },
];

const DEMO_CREDS: IntegrationCredential[] = [
  {
    id: "d1",
    provider_id: "1",
    provider_code: "FEDEX",
    provider_name: "FedEx",
    provider_type: "CARRIER",
    username: "demo_user",
    has_password: true,
    has_api_key: true,
    has_api_secret: false,
    account_number: "ACC-DEMO",
    endpoint: "https://api.sandbox.example.com",
    sandbox_mode: false,
    is_active: true,
    remark: "Demo",
    row_version: 1,
  },
];

export const Route = createFileRoute("/utility/integration-configuration")({
  head: () => ({
    meta: [
      { title: "Integration Configuration — Utility — Courier ERP" },
      {
        name: "description",
        content: "Configure carrier, e-invoice (IRN), and Customs EDI credentials.",
      },
    ],
  }),
  component: IntegrationConfigurationPage,
});

function IntegrationConfigurationPage() {
  const { isAuthenticated: authed, permissions } = useAuth();
  const queryClient = useQueryClient();

  const [demoRows, setDemoRows] = useState<IntegrationCredential[]>(DEMO_CREDS);
  const [mode, setMode] = useState<"list" | "form">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingRv, setEditingRv] = useState<number | null>(null);
  const [form, setForm] = useState<CredForm>(emptyForm());
  const [busy, setBusy] = useState(false);
  const [hasPassword, setHasPassword] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [hasApiSecret, setHasApiSecret] = useState(false);

  const providersQuery = useQuery({
    queryKey: ["integration-providers"],
    queryFn: () => listIntegrationProviders("ACTIVE"),
    enabled: authed,
  });

  const credsQuery = useQuery({
    queryKey: ["integration-credentials"],
    queryFn: () => listIntegrationCredentials(),
    enabled: authed,
  });

  const providers = authed
    ? (providersQuery.data ?? [])
    : [
        ...DEMO_PROVIDERS,
        {
          id: "e1",
          provider_code: "CLEARTAX",
          provider_name: "ClearTax GSP",
          provider_type: "EINVOICE" as const,
          status: "ACTIVE" as const,
          supports_booking: false,
          supports_tracking: false,
          supports_labels: false,
          supports_serviceability: false,
          sort_order: 200,
        },
        {
          id: "c1",
          provider_code: "CUSTOMS_EDI",
          provider_name: "Customs EDI",
          provider_type: "CUSTOMS" as const,
          status: "ACTIVE" as const,
          supports_booking: false,
          supports_tracking: false,
          supports_labels: false,
          supports_serviceability: false,
          sort_order: 300,
        },
      ];
  const rows = useMemo(
    () => (authed ? (credsQuery.data ?? []) : demoRows),
    [authed, credsQuery.data, demoRows],
  );

  const selectedProvider = providers.find((p) => p.provider_code === form.provider_code);
  const isEinvoice = selectedProvider?.provider_type === "EINVOICE";
  const isCustoms = selectedProvider?.provider_type === "CUSTOMS";
  const isMessaging = selectedProvider?.provider_type === "MESSAGING";
  const isMsg91 = form.provider_code === "MSG91";
  const isTwilio = form.provider_code === "TWILIO";

  const canAdd = !authed || canDo(permissions, VENDOR_AGGREGATE_PERMISSIONS.vendors, "add");
  const canModify = !authed || canDo(permissions, VENDOR_AGGREGATE_PERMISSIONS.vendors, "modify");
  const canDelete =
    !authed || canDo(permissions, VENDOR_AGGREGATE_PERMISSIONS.vendors, "delete") || canModify;

  const usedCodes = useMemo(() => new Set(rows.map((r) => r.provider_code)), [rows]);

  const openAdd = () => {
    setEditingId(null);
    setEditingRv(null);
    setForm(emptyForm());
    setHasPassword(false);
    setHasApiKey(false);
    setHasApiSecret(false);
    setMode("form");
  };

  const openEdit = (row: IntegrationCredential) => {
    setEditingId(row.id);
    setEditingRv(row.row_version);
    setForm({
      provider_code: row.provider_code,
      username: row.username ?? "",
      password: "",
      api_key: "",
      api_secret: "",
      account_number: row.account_number ?? "",
      endpoint: row.endpoint ?? "",
      sandbox_mode: row.sandbox_mode,
      is_active: row.is_active,
      remark: row.remark ?? "",
    });
    setHasPassword(row.has_password);
    setHasApiKey(row.has_api_key);
    setHasApiSecret(row.has_api_secret);
    setMode("form");
  };

  const onSave = async () => {
    try {
      const parsed = integrationCredentialSchema.parse(form);
      if (!authed) {
        const provider = providers.find((p) => p.provider_code === parsed.provider_code);
        const payload: IntegrationCredential = {
          id: editingId ?? crypto.randomUUID(),
          provider_id: provider?.id ?? "",
          provider_code: parsed.provider_code,
          provider_name: provider?.provider_name ?? parsed.provider_code,
          provider_type: provider?.provider_type ?? "CARRIER",
          username: parsed.username ?? null,
          has_password: Boolean(parsed.password) || hasPassword,
          has_api_key: Boolean(parsed.api_key) || hasApiKey,
          has_api_secret: Boolean(parsed.api_secret) || hasApiSecret,
          account_number: parsed.account_number ?? null,
          endpoint: parsed.endpoint ?? null,
          sandbox_mode: parsed.sandbox_mode,
          is_active: parsed.is_active,
          remark: parsed.remark ?? null,
          row_version: (editingRv ?? 0) + 1,
        };
        setDemoRows((current) =>
          editingId
            ? current.map((row) => (row.id === editingId ? payload : row))
            : [payload, ...current],
        );
        toast.success(editingId ? "Credentials updated" : "Credentials saved");
        setMode("list");
        return;
      }
      if (editingId && !canModify) return toast.error("Permission denied");
      if (!editingId && !canAdd) return toast.error("Permission denied");
      setBusy(true);
      await saveIntegrationCredentials({
        fields: parsed,
        id: editingId,
        rowVersion: editingRv,
      });
      await queryClient.invalidateQueries({ queryKey: ["integration-credentials"] });
      toast.success(editingId ? "Credentials updated" : "Credentials saved");
      setMode("list");
    } catch (error) {
      toast.error(toErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (row: IntegrationCredential) => {
    if (!canDelete) return toast.error("Permission denied");
    if (!authed) {
      setDemoRows((current) => current.filter((item) => item.id !== row.id));
      toast.success("Credentials deleted");
      return;
    }
    try {
      setBusy(true);
      await deleteIntegrationCredentials(row.id, row.row_version);
      await queryClient.invalidateQueries({ queryKey: ["integration-credentials"] });
      toast.success("Credentials deleted");
    } catch (error) {
      toast.error(toErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const onTest = async (row: IntegrationCredential) => {
    if (!canModify && authed) return toast.error("Permission denied");
    if (!authed) {
      toast.message(
        row.provider_type === "EINVOICE"
          ? "IRN Connected (demo)"
          : row.provider_type === "CUSTOMS"
            ? "Customs EDI Connected (demo)"
            : "Not Implemented",
      );
      return;
    }
    try {
      setBusy(true);
      if (row.provider_type === "EINVOICE") {
        const result = await testIrnConnection(row.id);
        toast.success(String(result.message ?? "IRN connection OK"));
      } else if (row.provider_type === "CUSTOMS") {
        const result = await testCustomsConnection(row.id);
        toast.success(String(result.message ?? "Customs connection OK"));
      } else {
        const result = await testIntegrationConnection({ id: row.id });
        toast.message(result.message);
      }
    } catch (error) {
      toast.error(toErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  if (mode === "form") {
    return (
      <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
        <MasterBreadcrumb trail={["Utility", "Integration Configuration"]} />
        <Card className="relative min-w-0 border p-4 pt-6 md:p-6 md:pt-7">
          <span className="absolute -top-3 left-4 rounded-full bg-sidebar px-4 py-1 text-xs font-semibold text-sidebar-foreground shadow">
            {isEinvoice
              ? "E-Invoice / IRN Credentials"
              : isCustoms
                ? "Customs EDI Credentials"
                : isMessaging
                  ? "SMS Messaging Credentials (OTP)"
                  : "Carrier Credentials"}
          </span>
          {isMessaging ? (
            <p className="mb-3 text-xs text-muted-foreground">
              Used to send vendor booking OTP to the shipper mobile. Turn{" "}
              <span className="font-medium">Sandbox mode OFF</span> for live phone SMS.
              {isMsg91
                ? " MSG91: API Key = Authkey, Account = Sender ID, Endpoint = DLT/Flow template id."
                : isTwilio
                  ? " Twilio: Username = Account SID, Password = Auth Token, Account = From number."
                  : ""}
            </p>
          ) : null}
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs font-medium">
              Provider *
              <Select
                value={form.provider_code}
                onValueChange={(value) => setForm((f) => ({ ...f, provider_code: value }))}
                disabled={Boolean(editingId)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  {providers
                    .filter(
                      (p) =>
                        !usedCodes.has(p.provider_code) || p.provider_code === form.provider_code,
                    )
                    .map((p) => (
                      <SelectItem key={p.id} value={p.provider_code}>
                        {p.provider_name} ({p.provider_code})
                        {p.provider_type === "EINVOICE"
                          ? " · IRN"
                          : p.provider_type === "CUSTOMS"
                            ? " · EDI"
                            : p.provider_type === "MESSAGING"
                              ? " · SMS"
                              : ""}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium">
              {isTwilio
                ? "Account SID"
                : isEinvoice
                  ? "Username"
                  : isCustoms
                    ? "CHA Code"
                    : "Username"}
              <Input
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                className="h-9"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium">
              {hasPassword
                ? isTwilio
                  ? "Auth Token (leave blank to keep)"
                  : "Password (leave blank to keep)"
                : isTwilio
                  ? "Auth Token"
                  : "Password"}
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                className="h-9"
                autoComplete="new-password"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium">
              {hasApiKey
                ? isEinvoice
                  ? "Client ID (leave blank to keep)"
                  : isMsg91
                    ? "Authkey (leave blank to keep)"
                    : "API Key (leave blank to keep)"
                : isEinvoice
                  ? "Client ID"
                  : isMsg91
                    ? "Authkey"
                    : "API Key"}
              <Input
                type="password"
                value={form.api_key}
                onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))}
                className="h-9"
                autoComplete="new-password"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium">
              {hasApiSecret
                ? isEinvoice
                  ? "Client Secret (leave blank to keep)"
                  : "API Secret (leave blank to keep)"
                : isEinvoice
                  ? "Client Secret"
                  : "API Secret"}
              <Input
                type="password"
                value={form.api_secret}
                onChange={(e) => setForm((f) => ({ ...f, api_secret: e.target.value }))}
                className="h-9"
                autoComplete="new-password"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium">
              {isMsg91
                ? "Sender ID"
                : isTwilio
                  ? "From number (e.g. +1…)"
                  : isEinvoice
                    ? "GSTIN"
                    : isCustoms
                      ? "IEC"
                      : "Account number"}
              <Input
                value={form.account_number}
                onChange={(e) => setForm((f) => ({ ...f, account_number: e.target.value }))}
                className="h-9"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium md:col-span-2">
              {isMsg91
                ? "MSG91 Flow / Template ID (DLT)"
                : isCustoms
                  ? "Export Directory"
                  : "Endpoint"}
              <Input
                value={form.endpoint}
                onChange={(e) => setForm((f) => ({ ...f, endpoint: e.target.value }))}
                className="h-9"
                placeholder={
                  isMsg91
                    ? "MSG91 template / flow id"
                    : isCustoms
                      ? "/exports/customs"
                      : "https://api.sandbox.example.com"
                }
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium md:col-span-2">
              {isCustoms ? "Branch / Port (branch=BR;port=INMAA1)" : "Remark"}
              <Input
                value={form.remark}
                onChange={(e) => setForm((f) => ({ ...f, remark: e.target.value }))}
                className="h-9"
                placeholder={isCustoms ? "branch=BR01;port=INMAA1" : undefined}
              />
            </label>
            <div className="flex items-center gap-6 md:col-span-2">
              <label className="flex items-center gap-2 text-xs">
                <Checkbox
                  checked={form.sandbox_mode}
                  onCheckedChange={(c) => setForm((f) => ({ ...f, sandbox_mode: Boolean(c) }))}
                />
                {isMessaging ? "Sandbox mode (OFF = live SMS to phone)" : "Sandbox mode"}
              </label>
              <label className="flex items-center gap-2 text-xs">
                <Checkbox
                  checked={form.is_active}
                  onCheckedChange={(c) => setForm((f) => ({ ...f, is_active: Boolean(c) }))}
                />
                Active
              </label>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              disabled={busy}
              onClick={() => void onSave()}
              className="h-8 rounded-full bg-green-500 px-6 text-white hover:bg-green-600"
            >
              Save
            </Button>
            <Button
              onClick={() => setMode("list")}
              className="h-8 rounded-full bg-red-500 px-6 text-white hover:bg-red-600"
            >
              Cancel
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <MasterBreadcrumb trail={["Utility", "Integration Configuration"]} />
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Integration Configuration</h1>
        <p className="text-sm text-muted-foreground">
          Carrier, vendor shipping, SMS (MSG91/Twilio OTP), e-invoice (IRN/GSP), and Customs EDI
          credentials. Secrets are write-only.
        </p>
      </div>
      <Card className="min-w-0 overflow-hidden border p-4 md:p-6">
        <div className="mb-4 flex flex-wrap justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-9 gap-1.5"
            disabled={busy}
            onClick={() =>
              void (async () => {
                if (!authed) return toast.success("IRN Connected (demo)");
                try {
                  setBusy(true);
                  const result = await testIrnConnection(null);
                  toast.success(String(result.message ?? "IRN connection OK"));
                } catch (e) {
                  toast.error(toErrorMessage(e));
                } finally {
                  setBusy(false);
                }
              })()
            }
          >
            <Zap className="h-4 w-4" />
            Test IRN Connection
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-9 gap-1.5"
            disabled={busy}
            onClick={() =>
              void (async () => {
                if (!authed) return toast.success("Customs EDI Connected (demo)");
                try {
                  setBusy(true);
                  const result = await testCustomsConnection(null);
                  toast.success(String(result.message ?? "Customs connection OK"));
                } catch (e) {
                  toast.error(toErrorMessage(e));
                } finally {
                  setBusy(false);
                }
              })()
            }
          >
            <Zap className="h-4 w-4" />
            Test Customs Connection
          </Button>
          <Button size="sm" className="h-9 gap-1.5" onClick={openAdd} disabled={!canAdd}>
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-sidebar hover:bg-sidebar">
              {[
                "Provider",
                "Type",
                "Account / GSTIN / IEC",
                "Sandbox",
                "Active",
                "Secrets",
                "Action",
              ].map((h) => (
                <TableHead key={h} className="text-sidebar-foreground">
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
                  No API credentials added yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} className="odd:bg-muted/50">
                  <TableCell>
                    {row.provider_name} ({row.provider_code})
                  </TableCell>
                  <TableCell>{row.provider_type}</TableCell>
                  <TableCell>{row.account_number ?? row.username ?? "—"}</TableCell>
                  <TableCell>{row.sandbox_mode ? "Yes" : "No"}</TableCell>
                  <TableCell>{row.is_active ? "Yes" : "No"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {[
                      row.has_password ? "pwd" : null,
                      row.has_api_key
                        ? row.provider_type === "EINVOICE"
                          ? "client-id"
                          : "key"
                        : null,
                      row.has_api_secret
                        ? row.provider_type === "EINVOICE"
                          ? "client-secret"
                          : "secret"
                        : null,
                    ]
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <IconButton
                        label={
                          row.provider_type === "EINVOICE"
                            ? "Test IRN connection"
                            : row.provider_type === "CUSTOMS"
                              ? "Test Customs connection"
                              : "Test connection"
                        }
                        size="row"
                        variant="ghost"
                        onClick={() => void onTest(row)}
                      >
                        <Zap className="h-4 w-4" />
                      </IconButton>
                      <IconButton
                        label="Edit"
                        size="row"
                        variant="ghost"
                        onClick={() => openEdit(row)}
                      >
                        <Pencil className="h-4 w-4" />
                      </IconButton>
                      <IconButton
                        label="Delete"
                        size="row"
                        variant="ghost"
                        onClick={() => void onDelete(row)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </IconButton>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Card className="min-w-0 overflow-hidden border p-4 md:p-6">
        <VendorIntegrationsPanel canModify={canModify || !authed} />
      </Card>

      <CustomsEdiExportPanel authed={Boolean(authed)} />
    </div>
  );
}
