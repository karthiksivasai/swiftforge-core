import { createFileRoute } from "@tanstack/react-router";
import { PickupInscanPage } from "./transaction.pickup-inscan";

export const Route = createFileRoute("/transaction/un-delivery-scan")({
  head: () => ({
    meta: [
      { title: "Un-Delivery Scan — Transaction — Courier ERP" },
      {
        name: "description",
        content:
          "Scan undelivered shipments received back at the service centre. Records 'Shipment Undelivered Received' and transitions OUT_FOR_DELIVERY → UNDELIVERED_RECEIVED.",
      },
    ],
  }),
  component: UnDeliveryScanPage,
});

function UnDeliveryScanPage() {
  return <PickupInscanPage mode="undelivery" />;
}
