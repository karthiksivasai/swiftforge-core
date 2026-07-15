import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Eye, Pencil, Plus, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
import { toErrorMessage } from "@/lib/masters/screen";
import {
  deleteNotificationTemplate,
  listNotificationTemplates,
  saveNotificationTemplate,
} from "@/lib/notifications/resources";
import { dispatchNotification, previewNotificationTemplate } from "@/lib/notifications/delivery";
import { notificationTemplateSchema } from "@/lib/notifications/schemas";
import { NOTIFICATION_TYPES, type NotificationTemplate } from "@/lib/notifications/types";
import { canDo, UTILITY_NOTIFICATION_PERMISSIONS } from "@/lib/permissions";

type TemplateRow = {
  id: string;
  code: string;
  name: string;
  notification_type: string;
  channel: string;
  subject: string;
  body: string;
  status: string;
  row_version?: number;
};

type TemplateForm = Omit<TemplateRow, "id" | "row_version">;

const seedRows: TemplateRow[] = [
  {
    id: "1",
    code: "BOOKING_EMAIL",
    name: "Booking confirmation",
    notification_type: "BOOKING",
    channel: "EMAIL",
    subject: "Your booking",
    body: "Hello {{name}}, your shipment is booked.",
    status: "ACTIVE",
  },
];

const emptyForm = (): TemplateForm => ({
  code: "",
  name: "",
  notification_type: "BOOKING",
  channel: "EMAIL",
  subject: "",
  body: "",
  status: "ACTIVE",
});

function dbToUi(row: NotificationTemplate): TemplateRow {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    notification_type: row.notification_type,
    channel: row.channel,
    subject: row.subject ?? "",
    body: row.body,
    status: row.status,
    row_version: row.row_version,
  };
}

export const Route = createFileRoute("/utility/notification-templates")({
  head: () => ({
    meta: [
      { title: "Notification Templates — Utility — Courier ERP" },
      {
        name: "description",
        content: "Configure and preview notification templates; sandbox delivery available.",
      },
    ],
  }),
  component: NotificationTemplatesPage,
});

function NotificationTemplatesPage() {
  const { isAuthenticated: authed, permissions } = useAuth();
  const queryClient = useQueryClient();

  const [demoRows, setDemoRows] = useState<TemplateRow[]>(seedRows);
  const [mode, setMode] = useState<"list" | "form">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingRv, setEditingRv] = useState<number | null>(null);
  const [form, setForm] = useState<TemplateForm>(emptyForm());
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [previewText, setPreviewText] = useState<string | null>(null);

  const liveQuery = useQuery({
    queryKey: ["notification-templates"],
    queryFn: () => listNotificationTemplates(),
    enabled: authed,
  });

  const rows = authed ? (liveQuery.data ?? []).map(dbToUi) : demoRows;

  const canAdd =
    !authed || canDo(permissions, UTILITY_NOTIFICATION_PERMISSIONS.notification, "add");
  const canModify =
    !authed || canDo(permissions, UTILITY_NOTIFICATION_PERMISSIONS.notification, "modify");
  const canDelete =
    !authed ||
    canDo(permissions, UTILITY_NOTIFICATION_PERMISSIONS.notification, "delete") ||
    canModify;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [row.code, row.name, row.notification_type, row.channel, row.subject, row.body].some((v) =>
        v.toLowerCase().includes(q),
      ),
    );
  }, [rows, search]);

  const openAdd = () => {
    setEditingId(null);
    setEditingRv(null);
    setForm(emptyForm());
    setMode("form");
  };

  const openEdit = (row: TemplateRow) => {
    setEditingId(row.id);
    setEditingRv(row.row_version ?? null);
    setForm({
      code: row.code,
      name: row.name,
      notification_type: row.notification_type,
      channel: row.channel,
      subject: row.subject,
      body: row.body,
      status: row.status,
    });
    setMode("form");
  };

  const onDelete = async (row: TemplateRow) => {
    if (!canDelete) return toast.error("Permission denied");
    if (!authed) {
      setDemoRows((current) => current.filter((item) => item.id !== row.id));
      toast.success("Template deleted");
      return;
    }
    try {
      setBusy(true);
      await deleteNotificationTemplate(row.id, row.row_version);
      await queryClient.invalidateQueries({ queryKey: ["notification-templates"] });
      toast.success("Template deleted");
    } catch (error) {
      toast.error(toErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const onSave = async () => {
    try {
      const parsed = notificationTemplateSchema.parse(form);
      if (!authed) {
        const payload: TemplateRow = {
          id: editingId ?? crypto.randomUUID(),
          ...parsed,
          subject: parsed.subject ?? "",
        };
        setDemoRows((current) =>
          editingId
            ? current.map((row) => (row.id === editingId ? payload : row))
            : [payload, ...current],
        );
        toast.success(editingId ? "Template updated" : "Template saved");
        setMode("list");
        return;
      }
      if (editingId && !canModify) return toast.error("Permission denied");
      if (!editingId && !canAdd) return toast.error("Permission denied");
      setBusy(true);
      await saveNotificationTemplate({
        fields: parsed,
        id: editingId,
        rowVersion: editingRv,
      });
      await queryClient.invalidateQueries({ queryKey: ["notification-templates"] });
      toast.success(editingId ? "Template updated" : "Template saved");
      setMode("list");
    } catch (error) {
      toast.error(toErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const onPreview = async (row: TemplateRow) => {
    if (!authed) {
      const body = row.body.replaceAll("{{name}}", "Ada").replaceAll("{{awb}}", "DEMO1");
      const subject = row.subject.replaceAll("{{name}}", "Ada").replaceAll("{{awb}}", "DEMO1");
      setPreviewText(`${subject}\n\n${body}`);
      return toast.success("Preview ready (demo)");
    }
    try {
      const preview = await previewNotificationTemplate({
        templateId: row.id,
        variables: { name: "Ada", awb: "AWB1", code: "123456" },
      });
      setPreviewText(`${preview.subject ?? ""}\n\n${preview.body}`);
      toast.success("Preview rendered");
    } catch (e) {
      toast.error(toErrorMessage(e));
    }
  };

  const onTestDispatch = async (row: TemplateRow) => {
    if (!canModify && authed) return toast.error("Permission denied");
    if (!authed) return toast.success(`Test ${row.channel} dispatched (demo)`);
    try {
      setBusy(true);
      const result = await dispatchNotification({
        notification_type: row.notification_type,
        channels: [row.channel],
        email_to: "tester@example.com",
        sms_to: "9000000000",
        whatsapp_to: "9000000000",
        email_template_code: row.channel === "EMAIL" ? row.code : undefined,
        sms_template_code: row.channel === "SMS" ? row.code : undefined,
        whatsapp_template_code: row.channel === "WHATSAPP" ? row.code : undefined,
        variables: { name: "Ada", awb: "AWB1", code: "123456" },
        skip_preference_check: true,
      });
      toast.success(`Dispatched via ${row.channel} (${JSON.stringify(result.channels)})`);
    } catch (e) {
      toast.error(toErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (mode === "form") {
    return (
      <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
        <MasterBreadcrumb trail={["Utility", "Notification Templates"]} />
        <Card className="relative min-w-0 border p-4 pt-6 md:p-6 md:pt-7">
          <span className="absolute -top-3 left-4 rounded-full bg-sidebar px-4 py-1 text-xs font-semibold text-sidebar-foreground shadow">
            Notification Template
          </span>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs font-medium">
              Code *
              <Input
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                className="h-9"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium">
              Name *
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="h-9"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium">
              Type *
              <Select
                value={form.notification_type}
                onValueChange={(value) => setForm((f) => ({ ...f, notification_type: value }))}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NOTIFICATION_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium">
              Channel *
              <Select
                value={form.channel}
                onValueChange={(value) => setForm((f) => ({ ...f, channel: value }))}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EMAIL">EMAIL</SelectItem>
                  <SelectItem value="SMS">SMS</SelectItem>
                  <SelectItem value="WHATSAPP">WHATSAPP</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium md:col-span-2">
              Subject
              <Input
                value={form.subject}
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                className="h-9"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium md:col-span-2">
              Body
              <Textarea
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                className="min-h-28"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium">
              Status
              <Select
                value={form.status}
                onValueChange={(value) => setForm((f) => ({ ...f, status: value }))}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                  <SelectItem value="INACTIVE">INACTIVE</SelectItem>
                </SelectContent>
              </Select>
            </label>
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
      <MasterBreadcrumb trail={["Utility", "Notification Templates"]} />
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Notification Templates</h1>
        <p className="text-sm text-muted-foreground">
          Templates with preview and sandbox test dispatch. Use {"{{var}}"} placeholders.
        </p>
      </div>
      {previewText ? (
        <Card className="border p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Template preview</h2>
            <Button size="sm" variant="outline" onClick={() => setPreviewText(null)}>
              Close
            </Button>
          </div>
          <pre className="whitespace-pre-wrap text-sm text-muted-foreground">{previewText}</pre>
        </Card>
      ) : null}
      <Card className="min-w-0 overflow-hidden border p-4 md:p-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => toast.success("Export queued")}
            aria-label="Export templates"
          >
            <Download className="h-4 w-4" />
          </Button>
          <div className="flex items-end gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-48"
              placeholder="Search"
            />
            <Button size="sm" className="h-9 gap-1.5" onClick={openAdd} disabled={!canAdd}>
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-sidebar hover:bg-sidebar">
              {["Code", "Name", "Type", "Channel", "Subject", "Status", "Action"].map((h) => (
                <TableHead key={h} className="text-sidebar-foreground">
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((row) => (
              <TableRow key={row.id} className="odd:bg-muted/50">
                <TableCell>{row.code}</TableCell>
                <TableCell>{row.name}</TableCell>
                <TableCell>{row.notification_type}</TableCell>
                <TableCell>{row.channel}</TableCell>
                <TableCell>{row.subject}</TableCell>
                <TableCell>{row.status}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <IconButton
                      label="Preview"
                      size="row"
                      variant="ghost"
                      onClick={() => void onPreview(row)}
                    >
                      <Eye className="h-4 w-4" />
                    </IconButton>
                    <IconButton
                      label="Test dispatch"
                      size="row"
                      variant="ghost"
                      onClick={() => void onTestDispatch(row)}
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
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
