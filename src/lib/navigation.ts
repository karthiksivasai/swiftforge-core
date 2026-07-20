import {
  LayoutDashboard,
  Database,
  ArrowLeftRight,
  FileBarChart,
  ShoppingBag,
  Users,
  Truck,
  Settings2,
  Package,
  MapPin,
  Building2,
  Wallet,
  Receipt,
  ClipboardList,
  BarChart3,
  FileSpreadsheet,
  Scale,
  Send,
  ScanLine,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export type NavLeaf = {
  label: string;
  slug: string;
  /** Full absolute path — computed. */
  path: string;
  description?: string;
};

export type NavGroup = {
  label: string;
  slug: string;
  icon?: LucideIcon;
  items: NavLeaf[];
};

export type NavSection = {
  label: string;
  slug: string;
  icon: LucideIcon;
  /** Direct leaves (no sub-group) rendered before groups. */
  items?: NavLeaf[];
  groups?: NavGroup[];
  /** For sections that are a single page (e.g. Dashboard). */
  standalone?: boolean;
  path?: string;
};

function makeLeaves(basePath: string, items: Omit<NavLeaf, "path">[]): NavLeaf[] {
  return items.map((i) => ({ ...i, path: `${basePath}/${i.slug}` }));
}

function makeGroup(
  sectionSlug: string,
  group: Omit<NavGroup, "items"> & { items: Omit<NavLeaf, "path">[] },
): NavGroup {
  return {
    ...group,
    items: makeLeaves(`/${sectionSlug}/${group.slug}`, group.items),
  };
}

export const NAVIGATION: NavSection[] = [
  {
    label: "Dashboard",
    slug: "dashboard",
    icon: LayoutDashboard,
    standalone: true,
    path: "/dashboard",
  },
  {
    label: "Master",
    slug: "master",
    icon: Database,
    groups: [
      makeGroup("master", {
        label: "Sales",
        slug: "sales",
        icon: ShoppingBag,
        items: [
          { label: "Product", slug: "product" },
          { label: "Product Master", slug: "product-master" },
          { label: "Zone", slug: "zone" },
          { label: "Country", slug: "country" },
          { label: "Destination", slug: "destination" },
          { label: "Service Center", slug: "service-center" },
          { label: "State", slug: "state" },
          { label: "Sales Executive", slug: "sales-executive" },
          { label: "Industry", slug: "industry" },
          { label: "Flight", slug: "flight" },
          { label: "Product Type", slug: "product-type" },
          { label: "Content", slug: "content" },
          { label: "Instruction", slug: "instruction" },
          { label: "Local Branch", slug: "local-branch" },
          { label: "Charges Master", slug: "charges-master" },
          { label: "Bank Master", slug: "bank-master" },
        ],
      }),
      makeGroup("master", {
        label: "Customer",
        slug: "customer",
        icon: Users,
        items: [
          { label: "Customer", slug: "customer" },
          { label: "Customer Rate", slug: "customer-rate" },
          { label: "Consignee", slug: "consignee" },
          { label: "Shipper", slug: "shipper" },
          { label: "Expense", slug: "expense" },
        ],
      }),
      makeGroup("master", {
        label: "Vendor",
        slug: "vendor",
        icon: Truck,
        items: [
          { label: "Vendor", slug: "vendor" },
          { label: "Vendor Contract", slug: "vendor-contract" },
        ],
      }),
      makeGroup("master", {
        label: "Operation",
        slug: "operation",
        icon: Settings2,
        items: [
          { label: "Service Mapping", slug: "service-mapping" },
          { label: "Field Executive", slug: "field-executive" },
          { label: "Pin Code", slug: "pin-code" },
          { label: "Area", slug: "area" },
          { label: "Exception", slug: "exception" },
          { label: "Airline", slug: "airline" },
          { label: "Country Pincodes", slug: "country-pincodes" },
        ],
      }),
    ],
  },
  {
    label: "Transaction",
    slug: "transaction",
    icon: ArrowLeftRight,
    items: makeLeaves("/transaction", [
      { label: "Pickup", slug: "pickup" },
      { label: "Pickup Inscan", slug: "pickup-inscan" },
      { label: "AWB Entry", slug: "awb-entry" },
      { label: "Manifest Scan", slug: "manifest-scan" },
      { label: "Manifest In Scan", slug: "manifest-in-scan" },
      { label: "Manifest View", slug: "manifest-view" },
      { label: "DRS Scan", slug: "drs-scan" },
      { label: "Un-Delivery Scan", slug: "un-delivery-scan" },
      { label: "Bagging", slug: "bagging" },
      { label: "Transfer Run", slug: "transfer-run" },
      { label: "Miss Route Scan", slug: "miss-route-scan" },
    ]),
    groups: [
      makeGroup("transaction", {
        label: "Out Scan",
        slug: "out-scan",
        icon: Send,
        items: [{ label: "OBC Entry", slug: "obc-entry" }],
      }),
      makeGroup("transaction", {
        label: "Tracking / Delivery",
        slug: "tracking",
        icon: ScanLine,
        items: [
          { label: "AWB Query", slug: "awb-query" },
          { label: "Forwarding Updation", slug: "forwarding-updation" },
          { label: "Progress / Comment", slug: "progress-comment" },
          { label: "KYC Tracking", slug: "kyc-tracking" },
          { label: "Update Entry", slug: "update-entry" },
        ],
      }),
      makeGroup("transaction", {
        label: "Receipt / Expenses",
        slug: "receipt",
        icon: Receipt,
        items: [
          { label: "Expense Authorize", slug: "expense-authorize" },
          { label: "Receipt Entry", slug: "receipt-entry" },
          { label: "Expense Entry", slug: "expense-entry" },
          { label: "Debit Note", slug: "debit-note" },
          { label: "Credit Note", slug: "credit-note" },
          { label: "Customer Payment", slug: "customer-payment" },
        ],
      }),
      makeGroup("transaction", {
        label: "Bulk Import",
        slug: "bulk-import",
        icon: FileSpreadsheet,
        items: [{ label: "POD to Excel", slug: "pod-to-excel" }],
      }),
      makeGroup("transaction", {
        label: "Rate Compare",
        slug: "rate-compare",
        icon: Scale,
        items: [
          { label: "Vendor Rate Compare", slug: "vendor-rate-compare" },
          { label: "Customer Rate Compare", slug: "customer-rate-compare" },
        ],
      }),
    ],
  },
  {
    label: "Reports",
    slug: "reports",
    icon: FileBarChart,
    items: makeLeaves("/reports", [
      { label: "Operations", slug: "operations" },
      { label: "Statements", slug: "statements" },
      { label: "AWB", slug: "awb" },
      { label: "Scan", slug: "scan" },
      { label: "Accounts", slug: "ar-report" },
    ]),
  },
  {
    label: "Utility",
    slug: "utility",
    icon: Wrench,
    items: makeLeaves("/utility", [
      { label: "Serviceable Pincode", slug: "serviceable-pincode" },
      { label: "Notification", slug: "notification" },
      { label: "Integration Configuration", slug: "integration-configuration" },
    ]),
    groups: [
      makeGroup("utility", {
        label: "Users",
        slug: "users",
        items: [
          { label: "User Setup", slug: "user-setup" },
          { label: "Access Rights", slug: "access-rights" },
          { label: "Loggedin Users", slug: "loggedin-users" },
        ],
      }),
      makeGroup("utility", {
        label: "Excel Import",
        slug: "excel-import",
        items: [
          { label: "AWB Merging", slug: "awb-merging" },
          { label: "POD Merging", slug: "pod-merging" },
          { label: "Forwarding Merging", slug: "forwarding-merging" },
          { label: "Data Import", slug: "data-import" },
          { label: "Data Updation", slug: "data-updation" },
        ],
      }),
      makeGroup("utility", {
        label: "Tax / Charges Setup",
        slug: "tax-charges-setup",
        items: [
          { label: "Fuel Setup", slug: "fuel-setup" },
          { label: "Tax Setup", slug: "tax-setup" },
          { label: "Setup", slug: "setup" },
        ],
      }),
      makeGroup("utility", {
        label: "Rate / Zone Update",
        slug: "rate-zone-update",
        items: [
          { label: "Rate Update", slug: "rate-update" },
          { label: "Rate Update Jobs", slug: "rate-update-jobs" },
          { label: "Zone Update", slug: "zone-update" },
          { label: "Zone Update Jobs", slug: "zone-update-jobs" },
          { label: "Rate Import", slug: "rate-import" },
        ],
      }),
    ],
  },
];

// Suppress unused-import warnings for the icon set (kept for future use).
export const _navIcons = {
  Package,
  MapPin,
  Building2,
  Wallet,
  ClipboardList,
  BarChart3,
};

export type ResolvedPage = {
  section: NavSection;
  group?: NavGroup;
  leaf?: NavLeaf;
  title: string;
  breadcrumbs: { label: string; path?: string }[];
};

/** Resolve a full pathname against the nav config. Returns undefined if not registered. */
export function resolvePage(pathname: string): ResolvedPage | undefined {
  const parts = pathname.replace(/^\/+/, "").split("/").filter(Boolean);
  if (parts.length === 0) return undefined;

  const section = NAVIGATION.find((s) => s.slug === parts[0]);
  if (!section) return undefined;

  // Standalone section (e.g. dashboard)
  if (section.standalone && parts.length === 1) {
    return {
      section,
      title: section.label,
      breadcrumbs: [{ label: section.label }],
    };
  }

  // Direct leaf under section (e.g. /transaction/pickup)
  if (parts.length === 2 && section.items) {
    const leaf = section.items.find((l) => l.slug === parts[1]);
    if (leaf) {
      return {
        section,
        leaf,
        title: leaf.label,
        breadcrumbs: [{ label: section.label, path: `/${section.slug}` }, { label: leaf.label }],
      };
    }
  }

  // Grouped leaf (e.g. /master/sales/product)
  if (parts.length === 3 && section.groups) {
    const group = section.groups.find((g) => g.slug === parts[1]);
    const leaf = group?.items.find((l) => l.slug === parts[2]);
    if (group && leaf) {
      return {
        section,
        group,
        leaf,
        title: leaf.label,
        breadcrumbs: [
          { label: section.label, path: `/${section.slug}` },
          { label: group.label },
          { label: leaf.label },
        ],
      };
    }
  }

  return undefined;
}
