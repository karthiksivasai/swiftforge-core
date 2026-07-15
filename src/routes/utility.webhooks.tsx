import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { History, KeyRound, Pencil, Plus, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
import { canDo, VENDOR_AGGREGATE_PERMISSIONS } from "@/lib/permissions";
import { toErrorMessage } from "@/lib/masters/screen";
import { webhookSchema } from "@/lib/integrations/schemas";
import {
  deleteWebhook,
  dispatchWebhook,
  listWebhookDeliveries,
  listWebhooks,
  saveWebhook,
  WEBHOOK_EVENT_OPTIONS,
  type WebhookDeliveryRow,
  type WebhookRow,
} from "@/lib/integrations/webhooks";

type WhForm = {
  name: string;
  endpoint_url: string;
  subscribed_events: string[];
  is_active: boolean;
  remark: string;
  regenerate_secret: boolean;
};

const emptyForm = (): WhForm => ({
  name: "",
  endpoint_url: "",
  subscribed_events: ["SHIPMENT_BOOKED"],
  is_active: true,
  remark: "",
  regenerate_secret: false,
});

const DEMO_HOOKS: WebhookRow[] = [
  {
    id: "demo-1",
    name: "Ops Status Hook",
    endpoint_url: "https://example.com/hooks/ops",
    subscribed_events: ["SHIPMENT_BOOKED", "SHIPMENT_DELIVERED"],
    is_active: true,
    remark: "Demo",
    has_signing_secret: true,
    row_version: 1,
  },
];

export const Route = createFileRoute("/utility/webhooks")({
  head: () => ({
    meta: [
      { title: "Webhooks — Utility — Courier ERP" },
      {
        name: "description",
        content: "Configure outbound webhooks and view delivery history.",
      },
    ],
  }),
  component: WebhooksPage,
});

function WebhooksPage() {
  const { isAuthenticated: authed, permissions } = useAuth();
  const queryClient = useQueryClient();

  const [demoRows, setDemoRows] = useState<WebhookRow[]>(DEMO_HOOKS);
  const [mode, setMode] = useState<"list" | "form" | "history">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingRv, setEditingRv] = useState<number | null>(null);
  const [form, setForm] = useState<WhForm>(emptyForm());
  const [busy, setBusy] = useState(false);
  const [historyFor, setHistoryFor] = useState<WebhookRow | null>(null);
  const [demoDeliveries, setDemoDeliveries] = useState<WebhookDeliveryRow[]>([]);

  const hooksQuery = useQuery({
    queryKey: ["webhooks"],
    queryFn: () => listWebhooks(),
    enabled: authed,
  });

  const deliveriesQuery = useQuery({
    queryKey: ["webhook-deliveries", historyFor?.id],
    queryFn: () => listWebhookDeliveries(historyFor!.id),
    enabled: authed && Boolean(historyFor?.id) && mode === "history",
  });

  const rows = useMemo(
    () => (authed ? (hooksQuery.data ?? []) : demoRows),
    [authed, hooksQuery.data, demoRows],
  );
  const deliveries = authed ? (deliveriesQuery.data ?? []) : demoDeliveries;

  const canAdd = !authed || canDo(permissions, VENDOR_AGGREGATE_PERMISSIONS.vendors, "add");
  const canModify = !authed || canDo(permissions, VENDOR_AGGREGATE_PERMISSIONS.vendors, "modify");
  const canDelete =
    !authed || canDo(permissions, VENDOR_AGGREGATE_PERMISSIONS.vendors, "delete") || canModify;

  const openAdd = () => {
    setEditingId(null);
    setEditingRv(null);
    setForm(emptyForm());
    setMode("form");
  };

  const openEdit = (row: WebhookRow) => {
    setEditingId(row.id);
    setEditingRv(row.row_version);
    setForm({
      name: row.name,
      endpoint_url: row.endpoint_url,
      subscribed_events: [...row.subscribed_events],
      is_active: row.is_active,
      remark: row.remark ?? "",
      regenerate_secret: false,
    });
    setMode("form");
  };

  const toggleEvent = (code: string) => {
    setForm((f) => ({
      ...f,
      subscribed_events: f.subscribed_events.includes(code)
        ? f.subscribed_events.filter((c) => c !== code)
        : [...f.subscribed_events, code],
    }));
  };

  const onSave = async () => {
    try {
      const parsed = webhookSchema.parse(form);
      if (!authed) {
        const payload: WebhookRow = {
          id: editingId ?? crypto.randomUUID(),
          name: parsed.name,
          endpoint_url: parsed.endpoint_url,
          subscribed_events: parsed.subscribed_events,
          is_active: parsed.is_active,
          remark: parsed.remark ?? null,
          has_signing_secret: true,
          row_version: (editingRv ?? 0) + 1,
        };
        setDemoRows((current) =>
          editingId
            ? current.map((row) => (row.id === editingId ? payload : row))
            : [payload, ...current],
        );
        toast.success(editingId ? "Webhook updated" : "Webhook saved");
        setMode("list");
        return;
      }
      if (editingId && !canModify) return toast.error("Permission denied");
      if (!editingId && !canAdd) return toast.error("Permission denied");
      setBusy(true);
      await saveWebhook({
        fields: {
          name: parsed.name,
          endpoint_url: parsed.endpoint_url,
          subscribed_events: parsed.subscribed_events,
          is_active: parsed.is_active,
          remark: parsed.remark,
          regenerate_secret: parsed.regenerate_secret,
        },
        id: editingId,
        rowVersion: editingRv,
      });
      await queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      toast.success(editingId ? "Webhook updated" : "Webhook saved");
      setMode("list");
    } catch (error) {
      toast.error(toErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (row: WebhookRow) => {
    if (!canDelete) return toast.error("Permission denied");
    if (!authed) {
      setDemoRows((current) => current.filter((item) => item.id !== row.id));
      toast.success("Webhook deleted");
      return;
    }
    try {
      setBusy(true);
      await deleteWebhook(row.id, row.row_version);
      await queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      toast.success("Webhook deleted");
    } catch (error) {
      toast.error(toErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const onTest = async (row: WebhookRow) => {
    if (!canModify && authed) return toast.error("Permission denied");
    const event = row.subscribed_events[0] ?? WEBHOOK_EVENT_OPTIONS[0].code;
    if (!authed) {
      const delivery: WebhookDeliveryRow = {
        id: crypto.randomUUID(),
        webhook_id: row.id,
        event_type: event,
        response_status: 200,
        latency_ms: 12,
        attempt_number: 1,
        error_message: null,
        created_at: new Date().toISOString(),
      };
      setDemoDeliveries((d) => [delivery, ...d]);
      toast.success("Test webhook dispatched (demo)");
      return;
    }
    try {
      setBusy(true);
      const result = await dispatchWebhook({
        webhookId: row.id,
        eventType: event,
        data: { test: true, source: "utility.webhooks" },
      });
      toast.success(
        `Dispatched ${event} — HTTP ${String(result.response_status ?? "?")} (attempt 1)`,
      );
      await queryClient.invalidateQueries({ queryKey: ["webhook-deliveries", row.id] });
    } catch (error) {
      toast.error(toErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const openHistory = (row: WebhookRow) => {
    setHistoryFor(row);
    setMode("history");
  };

  if (mode === "form") {
    return (
      <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
        <MasterBreadcrumb trail={["Utility", "Webhooks"]} />
        <Card className="relative min-w-0 border p-4 pt-6 md:p-6 md:pt-7">
          <span className="absolute -top-3 left-4 rounded-full bg-sidebar px-4 py-1 text-xs font-semibold text-sidebar-foreground shadow">
            Webhook
          </span>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs font-medium">
              Name *
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="h-9"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium">
              Endpoint URL *
              <Input
                value={form.endpoint_url}
                onChange={(e) => setForm((f) => ({ ...f, endpoint_url: e.target.value }))}
                className="h-9"
                placeholder="https://example.com/hooks or test://local"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium md:col-span-2">
              Remark
              <Input
                value={form.remark}
                onChange={(e) => setForm((f) => ({ ...f, remark: e.target.value }))}
                className="h-9"
              />
            </label>
            <div className="md:col-span-2">
              <p className="mb-2 text-xs font-medium">Subscribed events *</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {WEBHOOK_EVENT_OPTIONS.map((ev) => (
                  <label key={ev.code} className="flex items-center gap-2 text-xs">
                    <Checkbox
                      checked={form.subscribed_events.includes(ev.code)}
                      onCheckedChange={() => toggleEvent(ev.code)}
                    />
                    {ev.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-6 md:col-span-2">
              <label className="flex items-center gap-2 text-xs">
                <Checkbox
                  checked={form.is_active}
                  onCheckedChange={(c) => setForm((f) => ({ ...f, is_active: Boolean(c) }))}
                />
                Active
              </label>
              {editingId ? (
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox
                    checked={form.regenerate_secret}
                    onCheckedChange={(c) =>
                      setForm((f) => ({ ...f, regenerate_secret: Boolean(c) }))
                    }
                  />
                  <KeyRound className="h-3.5 w-3.5" />
                  Regenerate signing secret
                </label>
              ) : (
                <span className="text-xs text-muted-foreground">
                  Signing secret is generated on save (write-only, never shown).
                </span>
              )}
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

  if (mode === "history" && historyFor) {
    return (
      <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
        <MasterBreadcrumb trail={["Utility", "Webhooks", "Deliveries"]} />
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Delivery history</h1>
            <p className="text-sm text-muted-foreground">
              {historyFor.name} — append-only, single attempt per dispatch
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setMode("list")}>
            Back
          </Button>
        </div>
        <Card className="min-w-0 overflow-hidden border p-4 md:p-6">
          <Table>
            <TableHeader>
              <TableRow className="bg-sidebar hover:bg-sidebar">
                {["When", "Event", "Status", "Latency", "Attempt", "Error"].map((h) => (
                  <TableHead key={h} className="text-sidebar-foreground">
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {deliveries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    No deliveries yet. Use Test to dispatch once.
                  </TableCell>
                </TableRow>
              ) : (
                deliveries.map((d) => (
                  <TableRow key={d.id} className="odd:bg-muted/50">
                    <TableCell className="text-xs">
                      {d.created_at ? new Date(d.created_at).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell>{d.event_type}</TableCell>
                    <TableCell>{d.response_status ?? "—"}</TableCell>
                    <TableCell>{d.latency_ms != null ? `${d.latency_ms} ms` : "—"}</TableCell>
                    <TableCell>{d.attempt_number}</TableCell>
                    <TableCell className="max-w-[12rem] truncate text-xs">
                      {d.error_message ?? "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <MasterBreadcrumb trail={["Utility", "Webhooks"]} />
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Webhooks</h1>
        <p className="text-sm text-muted-foreground">
          Outbound signed webhooks (HMAC). Synchronous dispatch only — no retries.
          {" · "}
          <Link to="/utility/integration-configuration" className="underline">
            Carrier credentials
          </Link>
        </p>
      </div>
      <Card className="min-w-0 overflow-hidden border p-4 md:p-6">
        <div className="mb-4 flex justify-end">
          <Button size="sm" className="h-9 gap-1.5" onClick={openAdd} disabled={!canAdd}>
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-sidebar hover:bg-sidebar">
              {["Name", "Endpoint", "Events", "Active", "Secret", "Action"].map((h) => (
                <TableHead key={h} className="text-sidebar-foreground">
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  No webhooks configured yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} className="odd:bg-muted/50">
                  <TableCell>{row.name}</TableCell>
                  <TableCell className="max-w-[16rem] truncate">{row.endpoint_url}</TableCell>
                  <TableCell className="text-xs">{row.subscribed_events.join(", ")}</TableCell>
                  <TableCell>{row.is_active ? "Yes" : "No"}</TableCell>
                  <TableCell>{row.has_signing_secret ? "Set" : "—"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <IconButton
                        label="Test webhook"
                        size="row"
                        variant="ghost"
                        onClick={() => void onTest(row)}
                      >
                        <Zap className="h-4 w-4" />
                      </IconButton>
                      <IconButton
                        label="Delivery history"
                        size="row"
                        variant="ghost"
                        onClick={() => openHistory(row)}
                      >
                        <History className="h-4 w-4" />
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
    </div>
  );
}
