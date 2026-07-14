/**
 * POD UI ↔ RPC mapping helpers (Milestone 4E).
 */
import {
  canCancelPod,
  canSavePod,
  canUpdatePod,
  podStatusLabel,
  type PodFields,
} from "@/lib/transactions/schemas/pod";
import type { PodLookupResult } from "@/lib/transactions/resources/pod";

export type PodEntryForm = {
  awbNo: string;
  shipmentId: string;
  shipmentStatus: string;
  podId: string;
  rowVersion: number | null;
  podStatus: string;
  receiverName: string;
  podDate: string;
  remark: string;
  signatureFileId: string;
  photoFileId: string;
};

export const emptyPodEntryForm = (): PodEntryForm => ({
  awbNo: "",
  shipmentId: "",
  shipmentStatus: "",
  podId: "",
  rowVersion: null,
  podStatus: "",
  receiverName: "",
  podDate: new Date().toISOString().slice(0, 10),
  remark: "",
  signatureFileId: "",
  photoFileId: "",
});

export function lookupToEntryForm(result: PodLookupResult): PodEntryForm {
  const pod = result.pod;
  return {
    awbNo: result.awb_no ?? "",
    shipmentId: result.shipment_id ?? "",
    shipmentStatus: result.current_status ?? "",
    podId: pod?.id ?? "",
    rowVersion: pod?.row_version ?? null,
    podStatus: pod?.status ?? result.pod_status ?? "",
    receiverName: pod?.receiver_name ?? result.pod_receiver ?? result.receiver ?? "",
    podDate: pod?.pod_date ?? result.pod_date ?? new Date().toISOString().slice(0, 10),
    remark: pod?.remark ?? result.pod_remark ?? "",
    signatureFileId: pod?.signature_file_id ?? "",
    photoFileId: pod?.photo_file_id ?? "",
  };
}

export function entryFormToFields(form: PodEntryForm): PodFields {
  return {
    receiver_name: form.receiverName.trim(),
    pod_date: form.podDate,
    remark: form.remark.trim() || null,
    source: "MANUAL",
    signature_file_id: form.signatureFileId.trim() || null,
    photo_file_id: form.photoFileId.trim() || null,
  };
}

export function podBadgeLabel(form: PodEntryForm): string {
  if (form.podStatus === "DELIVERED" || form.shipmentStatus === "DELIVERED") {
    return "Delivered";
  }
  if (form.shipmentStatus === "DELIVERED_PENDING_POD") {
    return "Delivered (pending POD)";
  }
  return podStatusLabel(form.podStatus || form.shipmentStatus);
}

export function podActionsEnabled(form: PodEntryForm) {
  return {
    save: canSavePod(form.shipmentStatus),
    update: canUpdatePod(form.shipmentStatus, form.podStatus) && Boolean(form.podId),
    cancel: canCancelPod(form.shipmentStatus, form.podStatus) && Boolean(form.podId),
  };
}

export { canSavePod, canUpdatePod, canCancelPod, podStatusLabel };
