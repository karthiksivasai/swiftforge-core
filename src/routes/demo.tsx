import { createFileRoute } from "@tanstack/react-router";
import { Component } from "@/components/ui/loader-3";

export const Route = createFileRoute("/demo")({
  head: () => ({
    meta: [
      { title: "Loader Demo — Courier ERP" },
      { name: "description", content: "Preview the 3D box loading animation." },
    ],
  }),
  component: LoaderDemoPage,
});

function LoaderDemoPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center bg-background">
      <Component />
    </div>
  );
}
