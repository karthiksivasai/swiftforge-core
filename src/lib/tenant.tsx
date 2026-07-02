import { createContext, useContext, useMemo, type ReactNode } from "react";

export type Tenant = {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  logoInitials: string;
  supportEmail: string;
  supportPhone: string;
  primaryBranch: string;
};

const TENANTS: Record<string, Tenant> = {
  default: {
    id: "default",
    slug: "default",
    name: "Courierwala Express",
    shortName: "Courierwala",
    logoInitials: "CW",
    supportEmail: "support@courierwalaexpress.in",
    supportPhone: "+91 00000 00000",
    primaryBranch: "Head Office",
  },
  companya: {
    id: "companya",
    slug: "companya",
    name: "Company A Logistics",
    shortName: "Company A",
    logoInitials: "CA",
    supportEmail: "support@companya.com",
    supportPhone: "+91 11111 11111",
    primaryBranch: "Mumbai HQ",
  },
  companyb: {
    id: "companyb",
    slug: "companyb",
    name: "Company B Couriers",
    shortName: "Company B",
    logoInitials: "CB",
    supportEmail: "support@companyb.com",
    supportPhone: "+91 22222 22222",
    primaryBranch: "Bengaluru HQ",
  },
};

/**
 * Resolve tenant from the current hostname.
 *
 * Convention: `apptivesoft.<tenant>.com` or `<tenant>.apptivesoft.com` — the
 * first subdomain that matches a known tenant slug wins. Falls back to the
 * default mock tenant otherwise (dev, preview URLs, unknown hosts).
 */
export function resolveTenantFromHost(hostname: string | undefined): Tenant {
  if (!hostname) return TENANTS.default;
  const parts = hostname.toLowerCase().split(".");
  for (const part of parts) {
    if (TENANTS[part]) return TENANTS[part];
  }
  return TENANTS.default;
}

const TenantContext = createContext<Tenant | null>(null);

export function TenantProvider({ children }: { children: ReactNode }) {
  const tenant = useMemo(() => {
    if (typeof window === "undefined") return TENANTS.default;
    return resolveTenantFromHost(window.location.hostname);
  }, []);

  return <TenantContext.Provider value={tenant}>{children}</TenantContext.Provider>;
}

export function useTenant(): Tenant {
  const ctx = useContext(TenantContext);
  return ctx ?? TENANTS.default;
}
