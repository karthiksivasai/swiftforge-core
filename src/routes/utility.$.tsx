import { createFileRoute, notFound } from "@tanstack/react-router";

import { PlaceholderPage } from "@/components/placeholder-page";
import { resolvePage } from "@/lib/navigation";

export const Route = createFileRoute("/utility/$")({
  loader: ({ params }) => {
    const page = resolvePage(`/utility/${params._splat ?? ""}`);
    if (!page) throw notFound();
    return {
      title: page.title,
      breadcrumbs: page.breadcrumbs.map((breadcrumb) => ({
        label: breadcrumb.label,
        path: breadcrumb.path,
      })),
    };
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.title} — Utility — Courier ERP` },
          {
            name: "description",
            content: `${loaderData.title} utility module in the Courier ERP platform.`,
          },
        ]
      : [{ title: "Not found — Courier ERP" }, { name: "robots", content: "noindex" }],
  }),
  component: UtilitySplat,
});

function UtilitySplat() {
  const page = Route.useLoaderData();
  return (
    <PlaceholderPage
      title={page.title}
      breadcrumbs={page.breadcrumbs}
      description="Utility configuration for multi-tenant courier operations. This module will be implemented in a future phase."
    />
  );
}
