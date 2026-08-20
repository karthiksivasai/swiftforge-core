import { createFileRoute } from "@tanstack/react-router";
import { BaggingPage } from "@/routes/transaction.bagging";

export const Route = createFileRoute("/RunNo_Entry/RunNo_Entry")({
  head: () => ({
    meta: [
      { title: "Run No Entry / Bagging — Transaction — Courier ERP" },
      { name: "description", content: "Create and manage bagging manifests and run number entry." },
    ],
  }),
  component: BaggingPage,
});
