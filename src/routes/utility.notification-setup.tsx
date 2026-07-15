import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { MasterBreadcrumb } from "@/components/master-table-kit";
import { useAuth } from "@/lib/auth";
import { toErrorMessage } from "@/lib/masters/screen";
import {
  listNotificationPreferences,
  saveNotificationPreferences,
} from "@/lib/notifications/resources";
import {
  getNotificationProviderStatus,
  listNotificationDeliveries,
  sendSms,
  sendWhatsapp,
  testEmailConfiguration,
  type NotificationDeliveryRow,
} from "@/lib/notifications/delivery";
import { NOTIFICATION_TYPES, type NotificationPreference } from "@/lib/notifications/types";
import { canDo, UTILITY_NOTIFICATION_PERMISSIONS } from "@/lib/permissions";

type PrefRow = {
  notification_type: string;
  email_enabled: boolean;
  sms_enabled: boolean;
  whatsapp_enabled: boolean;
};

const defaultPrefs = (): PrefRow[] =>
  NOTIFICATION_TYPES.map((notification_type) => ({
    notification_type,
    email_enabled: true,
    sms_enabled: false,
    whatsapp_enabled: false,
  }));

function mergePrefs(live: NotificationPreference[]): PrefRow[] {
  const map = new Map(live.map((p) => [p.notification_type, p]));
  return NOTIFICATION_TYPES.map((notification_type) => {
    const existing = map.get(notification_type);
    return {
      notification_type,
      email_enabled: existing?.email_enabled ?? true,
      sms_enabled: existing?.sms_enabled ?? false,
      whatsapp_enabled: existing?.whatsapp_enabled ?? false,
    };
  });
}

export const Route = createFileRoute("/utility/notification-setup")({
  head: () => ({
    meta: [
      { title: "Notification Setup — Utility — Courier ERP" },
      {
        name: "description",
        content: "Tenant notification channel preferences and delivery tests.",
      },
    ],
  }),
  component: NotificationSetupPage,
});

function NotificationSetupPage() {
  const { isAuthenticated: authed, permissions } = useAuth();
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<PrefRow[]>(defaultPrefs());
  const [busy, setBusy] = useState(false);
  const [testEmail, setTestEmail] = useState("tester@example.com");
  const [testMobile, setTestMobile] = useState("9000000000");
  const [demoDeliveries, setDemoDeliveries] = useState<NotificationDeliveryRow[]>([]);

  const liveQuery = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: () => listNotificationPreferences(),
    enabled: authed,
  });

  const statusQuery = useQuery({
    queryKey: ["notification-provider-status"],
    queryFn: () => getNotificationProviderStatus(),
    enabled: authed,
  });

  const deliveriesQuery = useQuery({
    queryKey: ["notification-deliveries"],
    queryFn: () => listNotificationDeliveries({ limit: 30 }),
    enabled: authed,
  });

  useEffect(() => {
    if (authed && liveQuery.data) {
      setRows(mergePrefs(liveQuery.data));
    }
  }, [authed, liveQuery.data]);

  const canModify =
    !authed || canDo(permissions, UTILITY_NOTIFICATION_PERMISSIONS.notification, "modify");

  const deliveries = authed ? (deliveriesQuery.data ?? []) : demoDeliveries;
  const providerStatus = authed
    ? statusQuery.data
    : {
        email: { provider: "SANDBOX", ready: true, live: false },
        sms: { provider: "SANDBOX", ready: true, live: false },
        whatsapp: { provider: "SANDBOX", ready: true, live: false },
      };

  const patch = (
    type: string,
    key: "email_enabled" | "sms_enabled" | "whatsapp_enabled",
    value: boolean,
  ) => {
    setRows((current) =>
      current.map((row) => (row.notification_type === type ? { ...row, [key]: value } : row)),
    );
  };

  const onSave = async () => {
    if (!canModify) return toast.error("Permission denied");
    if (!authed) {
      toast.success("Notification preferences saved (demo)");
      return;
    }
    try {
      setBusy(true);
      await saveNotificationPreferences(rows);
      await queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
      toast.success("Notification preferences saved");
    } catch (error) {
      toast.error(toErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const pushDemoDelivery = (channel: string, recipient: string) => {
    setDemoDeliveries((d) => [
      {
        id: crypto.randomUUID(),
        channel,
        recipient,
        notification_type: "OTP",
        template_code: null,
        provider: "SANDBOX",
        status: "SUCCESS",
        latency_ms: 8,
        error_message: null,
        created_at: new Date().toISOString(),
      },
      ...d,
    ]);
  };

  const onTestEmail = async () => {
    if (!canModify) return toast.error("Permission denied");
    if (!authed) {
      pushDemoDelivery("EMAIL", testEmail);
      return toast.success("Test email sent (demo)");
    }
    try {
      setBusy(true);
      const result = await testEmailConfiguration({ to: testEmail });
      toast.success(`Test email ${result.status}`);
      await queryClient.invalidateQueries({ queryKey: ["notification-deliveries"] });
    } catch (e) {
      toast.error(toErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const onTestSms = async () => {
    if (!canModify) return toast.error("Permission denied");
    if (!authed) {
      pushDemoDelivery("SMS", testMobile);
      return toast.success("Test SMS sent (demo)");
    }
    try {
      setBusy(true);
      const result = await sendSms({
        to: testMobile,
        purpose: "OTP",
        body: "SwiftForge OTP test {{code}}",
        variables: { code: "123456" },
        skip_preference_check: true,
      });
      toast.success(`Test SMS ${result.status}`);
      await queryClient.invalidateQueries({ queryKey: ["notification-deliveries"] });
    } catch (e) {
      toast.error(toErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const onTestWhatsapp = async () => {
    if (!canModify) return toast.error("Permission denied");
    if (!authed) {
      pushDemoDelivery("WHATSAPP", testMobile);
      return toast.success("Test WhatsApp sent (demo)");
    }
    try {
      setBusy(true);
      const result = await sendWhatsapp({
        to: testMobile,
        purpose: "OTP",
        body: "SwiftForge WhatsApp OTP {{code}}",
        variables: { code: "123456" },
        skip_preference_check: true,
      });
      toast.success(`Test WhatsApp ${result.status}`);
      await queryClient.invalidateQueries({ queryKey: ["notification-deliveries"] });
    } catch (e) {
      toast.error(toErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <MasterBreadcrumb trail={["Utility", "Notification Setup"]} />
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Notification Setup</h1>
        <p className="text-sm text-muted-foreground">
          Channel preferences, sandbox delivery tests, and delivery history.
        </p>
      </div>

      <Card className="min-w-0 border p-4 md:p-6">
        <h2 className="mb-3 text-sm font-semibold">Provider status</h2>
        <div className="grid gap-2 text-xs sm:grid-cols-3">
          {(["email", "sms", "whatsapp"] as const).map((key) => {
            const row = (providerStatus?.[key] ?? {}) as Record<string, unknown>;
            return (
              <div key={key} className="rounded-md border bg-muted/30 px-3 py-2">
                <div className="font-medium uppercase">{key}</div>
                <div>Provider: {String(row.provider ?? "SANDBOX")}</div>
                <div>Ready: {row.ready === false ? "No" : "Yes"}</div>
                <div>Live: {row.live === true ? "Yes" : "No (sandbox)"}</div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="min-w-0 overflow-hidden border p-4 md:p-6">
        <Table>
          <TableHeader>
            <TableRow className="bg-sidebar hover:bg-sidebar">
              {["Notification Type", "Email", "SMS", "WhatsApp"].map((h) => (
                <TableHead key={h} className="text-sidebar-foreground">
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.notification_type} className="odd:bg-muted/50">
                <TableCell className="font-medium">{row.notification_type}</TableCell>
                <TableCell>
                  <Checkbox
                    checked={row.email_enabled}
                    onCheckedChange={(c) =>
                      patch(row.notification_type, "email_enabled", Boolean(c))
                    }
                    disabled={!canModify}
                  />
                </TableCell>
                <TableCell>
                  <Checkbox
                    checked={row.sms_enabled}
                    onCheckedChange={(c) => patch(row.notification_type, "sms_enabled", Boolean(c))}
                    disabled={!canModify}
                  />
                </TableCell>
                <TableCell>
                  <Checkbox
                    checked={row.whatsapp_enabled}
                    onCheckedChange={(c) =>
                      patch(row.notification_type, "whatsapp_enabled", Boolean(c))
                    }
                    disabled={!canModify}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="mt-4 flex justify-end">
          <Button
            disabled={busy || !canModify}
            onClick={() => void onSave()}
            className="h-8 rounded-full bg-green-500 px-8 text-white hover:bg-green-600"
          >
            Save
          </Button>
        </div>
      </Card>

      <Card className="min-w-0 border p-4 md:p-6">
        <h2 className="mb-3 text-sm font-semibold">Send test</h2>
        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-medium">
            Test email
            <Input
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              className="h-9"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium">
            Test mobile
            <Input
              value={testMobile}
              onChange={(e) => setTestMobile(e.target.value)}
              className="h-9"
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !canModify}
            onClick={() => void onTestEmail()}
          >
            Send Test Email
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !canModify}
            onClick={() => void onTestSms()}
          >
            Send Test SMS
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !canModify}
            onClick={() => void onTestWhatsapp()}
          >
            Send Test WhatsApp
          </Button>
        </div>
      </Card>

      <Card className="min-w-0 overflow-hidden border p-4 md:p-6">
        <h2 className="mb-3 text-sm font-semibold">Delivery history</h2>
        <Table>
          <TableHeader>
            <TableRow className="bg-sidebar hover:bg-sidebar">
              {["When", "Channel", "Recipient", "Type", "Status", "Provider", "Latency"].map(
                (h) => (
                  <TableHead key={h} className="text-sidebar-foreground">
                    {h}
                  </TableHead>
                ),
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {deliveries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
                  No deliveries yet.
                </TableCell>
              </TableRow>
            ) : (
              deliveries.map((d) => (
                <TableRow key={d.id} className="odd:bg-muted/50">
                  <TableCell className="text-xs">
                    {d.created_at ? new Date(d.created_at).toLocaleString() : "—"}
                  </TableCell>
                  <TableCell>{d.channel}</TableCell>
                  <TableCell>{d.recipient}</TableCell>
                  <TableCell>{d.notification_type ?? "—"}</TableCell>
                  <TableCell>{d.status}</TableCell>
                  <TableCell>{d.provider}</TableCell>
                  <TableCell>{d.latency_ms != null ? `${d.latency_ms} ms` : "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
