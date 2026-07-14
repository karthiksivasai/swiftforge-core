import type { BaseRow } from "@/lib/masters/core/baseCrud";
import type { MasterResource } from "@/lib/masters/core/useMasterResource";
import { SERVICE_MAPPING_PERMISSIONS } from "@/lib/permissions";
import {
  serviceMappingCreateSchema,
  serviceMappingUpdateSchema,
  type ServiceMappingCreate,
  type ServiceMappingUpdate,
} from "@/lib/masters/schemas/serviceMappings";

export type ServiceMappingRow = BaseRow & {
  vendor_id: string;
  service: string;
  service_type: string | null;
  billing_vendor_id: string | null;
  min_weight: number;
  max_weight: number;
  vendor_link: string | null;
  is_single_piece: boolean;
  status: "ACTIVE" | "INACTIVE";
};

export const serviceMappingsResource: MasterResource<
  ServiceMappingRow,
  ServiceMappingCreate,
  ServiceMappingUpdate
> = {
  key: "service_mappings",
  table: "service_mappings",
  master: "service_mappings",
  permission: SERVICE_MAPPING_PERMISSIONS.service_mappings,
  label: { singular: "Service Mapping", plural: "Service Mappings" },
  columns:
    "id, tenant_id, vendor_id, service, service_type, billing_vendor_id, min_weight, max_weight, vendor_link, is_single_piece, status, created_at, created_by, updated_at, updated_by, deleted_at, row_version",
  searchColumns: ["service", "service_type", "vendor_link"],
  orderBy: "service",
  ascending: true,
  importColumns: [
    "vendor_code",
    "service",
    "service_type",
    "billing_vendor_code",
    "min_weight",
    "max_weight",
    "vendor_link",
    "is_single_piece",
    "status",
  ],
  createSchema: serviceMappingCreateSchema,
  updateSchema: serviceMappingUpdateSchema,
};
