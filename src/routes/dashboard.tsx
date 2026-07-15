import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, FileBarChart } from "lucide-react";

import { DashboardSummarySection } from "@/components/dashboard/dashboard-summary-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardKpis } from "@/lib/dashboard/useDashboardKpis";
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
  const { cards, isLoading, isError, error, refetch, summary } = useDashboardKpis();

  const ops = cards.filter((c) => c.group === "operations");
  const fin = cards.filter((c) => c.group === "finance");
  const cust = cards.filter((c) => c.group === "customers");

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
            <Badge variant="secondary" className="font-normal">
              Phase 5
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Welcome back to {tenant.name}. Live KPIs from operations, finance, and masters.
            {summary?.date ? ` As of ${summary.date}.` : null}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
          Refresh
        </Button>
      </div>

      {isError ? (
        <Card className="shadow-none border-destructive/40">
          <CardContent className="py-4 text-sm text-destructive">
            {error?.message ?? "Unable to load dashboard KPIs."}
          </CardContent>
        </Card>
      ) : null}

      {isLoading && cards.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading KPIs…</p>
      ) : (
        <>
          <DashboardSummarySection title="Operations" cards={ops} />
          <DashboardSummarySection title="Finance" cards={fin} />
          <DashboardSummarySection title="Customers" cards={cust} />
        </>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Operations overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-40 items-center justify-center rounded-md border border-dashed px-4 text-center text-sm text-muted-foreground">
              Trend charts deferred until rollups are refreshed on a schedule (Milestone 5G / ops
              tooling). Use Reports for detailed history.
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
                to={q.to as Parameters<typeof Link>[0]["to"]}
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
