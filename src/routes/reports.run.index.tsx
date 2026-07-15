/**
 * Internal admin catalog — not in primary Reports navigation.
 * Prefer hub pages: Operations / Statements / AWB / Scan / AR Report.
 */
import { createFileRoute, Link, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/reports/run/")({
  beforeLoad: () => {
    throw redirect({ to: "/reports/operations" });
  },
  head: () => ({
    meta: [
      { title: "Reports — Courier ERP" },
      {
        name: "description",
        content: "Redirects to the Operations report hub.",
      },
    ],
  }),
  component: ReportCatalogRedirectStub,
});

/** Unreachable after beforeLoad redirect; kept for type completeness. */
function ReportCatalogRedirectStub() {
  return (
    <p className="p-6 text-sm text-muted-foreground">
      Redirecting to{" "}
      <Link to="/reports/operations" className="underline">
        Operations
      </Link>
      …
    </p>
  );
}
