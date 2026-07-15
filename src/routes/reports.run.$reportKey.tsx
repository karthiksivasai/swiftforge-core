import { createFileRoute } from "@tanstack/react-router";

import { ReportRunner } from "@/components/reports/report-runner";

export const Route = createFileRoute("/reports/run/$reportKey")({
  head: ({ params }) => ({
    meta: [
      {
        title: `${params.reportKey} — Reports — Courier ERP`,
      },
      {
        name: "description",
        content: "Metadata-driven report runner (Phase 5 reporting foundation).",
      },
    ],
  }),
  component: ReportRunPage,
});

function ReportRunPage() {
  const { reportKey } = Route.useParams();
  return <ReportRunner reportKey={reportKey} breadcrumbTrail={["Reports", "Run", reportKey]} />;
}
