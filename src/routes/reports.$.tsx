import { createFileRoute, notFound } from "@tanstack/react-router";

import { PlaceholderPage } from "@/components/placeholder-page";
import { resolvePage } from "@/lib/navigation";

export const Route = createFileRoute("/reports/$")({
  loader: ({ params }) => {
    const page = resolvePage(`/reports/${params._splat ?? ""}`);
    if (!page) throw notFound();
    return page;
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.title} — Reports — Courier ERP` },
          {
            name: "description",
            content: `${loaderData.title} report in the Courier ERP platform.`,
          },
        ]
      : [{ title: "Not found — Courier ERP" }, { name: "robots", content: "noindex" }],
  }),
  component: ReportsSplat,
});

function ReportsSplat() {
  const page = Route.useLoaderData();
  return (
    <PlaceholderPage
      title={page.title}
      breadcrumbs={page.breadcrumbs}
      description="Analytical report. This module will be implemented in a future phase."
    />
  );
}
