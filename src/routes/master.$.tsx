import { createFileRoute, notFound } from "@tanstack/react-router";

import { PlaceholderPage } from "@/components/placeholder-page";
import { resolvePage } from "@/lib/navigation";

export const Route = createFileRoute("/master/$")({
  loader: ({ params }) => {
    const page = resolvePage(`/master/${params._splat ?? ""}`);
    if (!page) throw notFound();
    return page;
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.title} — Master — Courier ERP` },
          {
            name: "description",
            content: `${loaderData.title} master module in the Courier ERP platform.`,
          },
        ]
      : [{ title: "Not found — Courier ERP" }, { name: "robots", content: "noindex" }],
  }),
  component: MasterSplat,
});

function MasterSplat() {
  const page = Route.useLoaderData();
  return (
    <PlaceholderPage
      title={page.title}
      breadcrumbs={page.breadcrumbs}
      description="Master data configuration. This module will be implemented in a future phase."
    />
  );
}
