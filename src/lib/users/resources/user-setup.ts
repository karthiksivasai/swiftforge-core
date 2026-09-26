import { supabase } from "@/integrations/supabase/client";
import { authorizedFetch } from "@/lib/security/authorized-fetch";

export {
  ALLOW_CHANGING_DATE_MODULES,
  USER_SETUP_PASSWORD_RULES,
  additionalEmailError,
  userSetupEmailError,
  userSetupPasswordError,
} from "@/lib/users/resources/user-setup-rules";

export type UserSetupListRow = {
  id: string;
  username: string;
  user_type: string;
  origin: string | null;
  service_center: string | null;
  email: string | null;
  mobile: string | null;
  status: string;
  group_name: string | null;
  company_code: string | null;
  application_type: string | null;
};

export type UserSetupListFilters = {
  channel?: "" | "PORTAL" | "MOBILE" | "ALL";
  type?: string;
  name?: string;
  group?: string;
  company?: string;
  application?: string;
  serviceCenter?: string;
  status?: string;
  sort?: string;
  dir?: "asc" | "desc";
};

export type UserSetupSummary = {
  portal: number;
  mobile: number;
  both: number;
  total: number;
  groups: number;
};

export type UserSetupOption = { id: string; code?: string | null; name: string };

export type UserSetupOptions = {
  userGroups: UserSetupOption[];
  companies: UserSetupOption[];
  applications: UserSetupOption[];
};

export type UserSetupDetails = {
  id: string;
  userGroupId: string | null;
  userGroupName: string | null;
  userType: string;
  username: string;
  originId: string | null;
  originName: string | null;
  serviceCenterId: string | null;
  serviceCenterName: string | null;
  customerId: string | null;
  customerName: string | null;
  staffGroup: string | null;
  companyId: string | null;
  companyName: string | null;
  birthDate: string | null;
  joiningDate: string | null;
  email: string | null;
  mobile: string | null;
  status: string;
  applicationType: string;
  backdatingModules: string[];
  applicationIds: string[];
  defaultApplicationId: string | null;
  additionalEmails: string | null;
  vendorId: string | null;
  vendorName: string | null;
  addEntryOnManifest: boolean;
  allowLoginWithOtp: boolean;
  globalManifest: boolean;
  allowChangingAwbNo: boolean;
  mobileAppLens: boolean;
  manifestBranch: boolean;
  weightType: string;
};

export type UserSetupSaveInput = {
  id?: string | null;
  userGroupId: string;
  userType: string;
  username: string;
  originId: string;
  serviceCenterId: string;
  password: string;
  confirmPassword: string;
  customerId: string;
  staffGroup: string;
  companyId: string;
  birthDate: string;
  joiningDate: string;
  email: string;
  mobile: string;
  status: string;
  applicationType: string;
  backdatingModules: string[];
  applicationIds: string[];
  defaultApplicationId: string;
  additionalEmails: string;
  vendorId: string;
  addEntryOnManifest: boolean;
  allowLoginWithOtp: boolean;
  globalManifest: boolean;
  allowChangingAwbNo: boolean;
  mobileAppLens: boolean;
  manifestBranch: boolean;
  weightType: string;
};

type RpcError = { message: string };

type RpcClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: RpcError | null }>;
};

function rpcClient(): RpcClient {
  return supabase as unknown as RpcClient;
}

function asRows<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}

export async function listUsers(params: {
  search: string;
  limit: number;
  offset: number;
  filters?: UserSetupListFilters;
}): Promise<UserSetupListRow[]> {
  const { data, error } = await rpcClient().rpc("list_users", {
    p_search: params.search,
    p_limit: params.limit,
    p_offset: params.offset,
    p_filters: params.filters ?? {},
  });
  if (error) throw new Error(error.message);
  return asRows<UserSetupListRow>(data);
}

export async function countUsers(search: string, filters?: UserSetupListFilters): Promise<number> {
  const { data, error } = await rpcClient().rpc("count_users", {
    p_search: search,
    p_filters: filters ?? {},
  });
  if (error) throw new Error(error.message);
  return typeof data === "number" ? data : Number(data ?? 0);
}

export async function userSetupSummary(): Promise<UserSetupSummary> {
  const { data, error } = await rpcClient().rpc("user_setup_summary");
  if (error) throw new Error(error.message);
  const body = (data ?? {}) as Partial<UserSetupSummary>;
  return {
    portal: Number(body.portal ?? 0),
    mobile: Number(body.mobile ?? 0),
    both: Number(body.both ?? 0),
    total: Number(body.total ?? 0),
    groups: Number(body.groups ?? 0),
  };
}

export async function getUserDetails(id: string): Promise<UserSetupDetails> {
  const { data, error } = await rpcClient().rpc("get_user_details", { p_id: id });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object") throw new Error("User was not found");
  return data as UserSetupDetails;
}

export async function listUserSetupOptions(): Promise<UserSetupOptions> {
  const { data, error } = await rpcClient().rpc("list_user_setup_options");
  if (error) throw new Error(error.message);
  const body = (data ?? {}) as Partial<UserSetupOptions>;
  return {
    userGroups: body.userGroups ?? [],
    companies: body.companies ?? [],
    applications: body.applications ?? [],
  };
}

export async function saveUser(input: UserSetupSaveInput): Promise<{ id: string }> {
  const response = await authorizedFetch("/api/users", {
    method: input.id ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ screen: "user-setup", ...input }),
  });
  const body = (await response.json().catch(() => ({}))) as { id?: string; error?: string };
  if (!response.ok || !body.id) throw new Error(body.error || "Could not save the user");
  return { id: body.id };
}

export async function deleteUser(id: string): Promise<void> {
  const { error } = await rpcClient().rpc("delete_user", { p_id: id });
  if (error) throw new Error(error.message);
}
