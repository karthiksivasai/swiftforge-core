import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowUpRight, FileBarChart } from "lucide-react";

import { DashboardSummarySection } from "@/components/dashboard/dashboard-summary-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardKpis } from "@/lib/dashboard/useDashboardKpis";
import { useCan } from "@/lib/use-can";
import { useTenant } from "@/lib/tenant";
import { openFreshAwbEntryPage } from "@/lib/transactions/awbDraftStorage";

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
  { label: "New AWB Entry", to: "/transaction/awb-entry", menu: "txn.awb-entry" },
  { label: "Pickup", to: "/transaction/pickup", menu: "txn.pickup" },
  { label: "Manifest Scan", to: "/transaction/manifest-scan", menu: "txn.manifest-scan" },
  { label: "DRS Scan", to: "/transaction/drs-scan", menu: "txn.drs-scan" },
  { label: "AWB Query", to: "/transaction/tracking/awb-query", menu: "txn.awb-query" },
  { label: "Operations Report", to: "/reports/operations", menu: "rpt.operation-report" },
] as const;

function DashboardPage() {
  const tenant = useTenant();
  const navigate = useNavigate();
  const showOperations = useCan("txn.opertation-dashboard", "list") || useCan("txn.opertation-dashboard", "search");
  const showSales = useCan("txn.sales-dashboard", "list") || useCan("txn.sales-dashboard", "search");
  const canAwb = useCan("txn.awb-entry", "list");
  const canPickup = useCan("txn.pickup", "list");
  const canManifest = useCan("txn.manifest-scan", "list");
  const canDrs = useCan("txn.drs-scan", "list");
  const canQuery = useCan("txn.awb-query", "list");
  const canOpsReport = useCan("rpt.operation-report", "list");
  const linkAllowed: Record<string, boolean> = {
    "txn.awb-entry": canAwb,
    "txn.pickup": canPickup,
    "txn.manifest-scan": canManifest,
    "txn.drs-scan": canDrs,
    "txn.awb-query": canQuery,
    "rpt.operation-report": canOpsReport,
  };
  const { cards, isLoading, isError, error, refetch, summary } = useDashboardKpis();

  const ops = showOperations ? cards.filter((c) => c.group === "operations") : [];
  const fin = showSales ? cards.filter((c) => c.group === "finance") : [];
  const cust = showSales ? cards.filter((c) => c.group === "customers") : [];
  const quickLinks = QUICK_LINKS.filter((link) => linkAllowed[link.menu]);

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
          {showOperations ? <DashboardSummarySection title="Operations" cards={ops} /> : null}
          {showSales ? <DashboardSummarySection title="Sales" cards={fin} /> : null}
          {showSales ? <DashboardSummarySection title="Customers" cards={cust} /> : null}
          {!showOperations && !showSales ? (
            <p className="text-sm text-muted-foreground">Your group does not have a dashboard assigned.</p>
          ) : null}
        </>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {showOperations ? <Card className="lg:col-span-2 shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Operations overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-40 items-center justify-center rounded-md border border-dashed px-4 text-center text-sm text-muted-foreground">
              Trend charts deferred until rollups are refreshed on a schedule (Milestone 5G / ops
              tooling). Use Reports for detailed history.
            </div>
          </CardContent>
        </Card> : null}

        {quickLinks.length > 0 ? <Card className="shadow-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Quick actions</CardTitle>
            <FileBarChart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {quickLinks.map((q) => (
              <Link
                key={q.to}
                to={q.to as Parameters<typeof Link>[0]["to"]}
                onClick={(event) => {
                  if (q.to !== "/transaction/awb-entry") return;
                  event.preventDefault();
                  void openFreshAwbEntryPage(navigate);
                }}
                className="flex items-center justify-between rounded-md px-2 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <span>{q.label}</span>
                <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
              </Link>
            ))}
          </CardContent>
        </Card> : null}
      </div>
    </div>
  );
}
