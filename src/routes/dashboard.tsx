import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Boxes,
  ClipboardList,
  FileBarChart,
  PackageCheck,
  ArrowUpRight,
  TrendingUp,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTenant } from "@/lib/tenant";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Courier ERP" },
      { name: "description", content: "Overview of operations, shipments, and revenue." },
    ],
  }),
  component: DashboardPage,
});

const STATS = [
  { label: "Shipments today", value: "—", icon: PackageCheck, hint: "Awaiting data" },
  { label: "Pickups pending", value: "—", icon: ClipboardList, hint: "Awaiting data" },
  { label: "In transit", value: "—", icon: Boxes, hint: "Awaiting data" },
  { label: "Revenue MTD", value: "—", icon: TrendingUp, hint: "Awaiting data" },
];

const QUICK_LINKS = [
  { label: "New AWB Entry", to: "/transaction/awb-entry" },
  { label: "Pickup", to: "/transaction/pickup" },
  { label: "Manifest Scan", to: "/transaction/manifest-scan" },
  { label: "DRS Scan", to: "/transaction/drs-scan" },
  { label: "AWB Query", to: "/transaction/tracking/awb-query" },
  { label: "Operations Report", to: "/reports/operations" },
] as const;

function DashboardPage() {
  const tenant = useTenant();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <Badge variant="secondary" className="font-normal">
            Phase 1
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Welcome back to {tenant.name}. Real metrics will populate once operational modules are
          implemented.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STATS.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="shadow-none">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {s.label}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold tracking-tight">{s.value}</div>
                <p className="text-xs text-muted-foreground">{s.hint}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Operations overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-56 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
              Charts appear once transaction modules are live.
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Quick actions</CardTitle>
            <FileBarChart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {QUICK_LINKS.map((q) => (
              <Link
                key={q.to}
                to={q.to}
                className="flex items-center justify-between rounded-md px-2 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <span>{q.label}</span>
                <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
