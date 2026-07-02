import { createFileRoute, notFound } from "@tanstack/react-router";

import { PlaceholderPage } from "@/components/placeholder-page";
import { resolvePage } from "@/lib/navigation";

export const Route = createFileRoute("/transaction/$")({
  loader: ({ params }) => {
    const page = resolvePage(`/transaction/${params._splat ?? ""}`);
    if (!page) throw notFound();
    return page;
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.title} — Transaction — Courier ERP` },
          {
            name: "description",
            content: `${loaderData.title} transaction module in the Courier ERP platform.`,
          },
        ]
      : [{ title: "Not found — Courier ERP" }, { name: "robots", content: "noindex" }],
  }),
  component: TransactionSplat,
});

function TransactionSplat() {
  const page = Route.useLoaderData();
  return (
    <PlaceholderPage
      title={page.title}
      breadcrumbs={page.breadcrumbs}
      description="Operational transaction workflow. This module will be implemented in a future phase."
    />
  );
}
