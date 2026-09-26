import { useAuth } from "@/lib/auth";
import type { PermissionAction } from "@/lib/permissions";

/** Client gate. The matching RPC remains the authority. */
export function useCan(menuKey: string, action: PermissionAction): boolean {
  const { hasPermission } = useAuth();
  return hasPermission(menuKey, action);
}
