import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Printer, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/lib/auth";
import { useCan } from "@/lib/use-can";
import {
  getGroupPermissions,
  listGroups,
  listPermissionModules,
  saveGroupPermissions,
  type PermissionModuleRow,
  type SaveGrant,
} from "@/lib/rbac-data";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MasterBreadcrumb } from "@/components/master-table-kit";

type SectionKey =
  | "Masters"
  | "Transaction"
  | "Documents"
  | "Reports"
  | "Utilities"
  | "Manager Notification"
  | "CRM"
  | "Mobile Application";
type PermissionKey = "allAccess" | "add" | "modify" | "delete" | "list" | "search";

type AccessItem = {
  moduleId: string;
  slug: string;
  description: string;
  underMenu: string;
};

const groups = ["BS", "OPERATION", "Staff"] as const;
const permissionKeys: PermissionKey[] = ["allAccess", "add", "modify", "delete", "list", "search"];
const permissionLabels = ["All Access", "Add", "Modify", "Delete", "List", "Search"];

const sectionOrder: SectionKey[] = [
  "Masters",
  "Transaction",
  "Documents",
  "Reports",
  "Utilities",
  "Manager Notification",
  "CRM",
  "Mobile Application",
];

const SECTION_FROM_CODE: Record<string, SectionKey> = {
  MASTERS: "Masters",
  TRANSACTION: "Transaction",
  DOCUMENTS: "Documents",
  REPORTS: "Reports",
  UTILITIES: "Utilities",
  MANAGER_NOTIFICATION: "Manager Notification",
  CRM: "CRM",
  MOBILE: "Mobile Application",
};

const PERMISSION_COLUMN: Record<PermissionKey, keyof SaveGrant> = {
  allAccess: "all_access",
  add: "can_add",
  modify: "can_modify",
  delete: "can_delete",
  list: "can_list",
  search: "can_search",
};

function emptyCatalog(): Record<SectionKey, AccessItem[]> {
  return {
    Masters: [],
    Transaction: [],
    Documents: [],
    Reports: [],
    Utilities: [],
    "Manager Notification": [],
    CRM: [],
    "Mobile Application": [],
  };
}

function catalogFromModules(modules: PermissionModuleRow[]): Record<SectionKey, AccessItem[]> {
  const catalog = emptyCatalog();
  for (const module of modules) {
    const section = SECTION_FROM_CODE[module.section];
    if (!section) continue;
    catalog[section].push({
      moduleId: module.id,
      slug: module.slug,
      description: module.name,
      underMenu: module.under_menu ?? section,
    });
  }
  return catalog;
}

function permissionId(slug: string, key: PermissionKey) {
  return `${slug}-${key}`;
}

function grantsFor(
  items: AccessItem[],
  permissions: Record<string, boolean>,
): SaveGrant[] {
  return items.map((item) => ({
    module_id: item.moduleId,
    all_access: permissions[permissionId(item.slug, "allAccess")] ?? false,
    can_add: permissions[permissionId(item.slug, "add")] ?? false,
    can_modify: permissions[permissionId(item.slug, "modify")] ?? false,
    can_delete: permissions[permissionId(item.slug, "delete")] ?? false,
    can_list: permissions[permissionId(item.slug, "list")] ?? false,
    can_search: permissions[permissionId(item.slug, "search")] ?? false,
  }));
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function matrixHtml(
  groupName: string,
  catalog: Record<SectionKey, AccessItem[]>,
  permissions: Record<string, boolean>,
  readOnly: boolean,
) {
  const rows = sectionOrder
    .flatMap((section) =>
      catalog[section].map((item) => {
        const flags = permissionKeys
          .map((key) => `<td>${permissions[permissionId(item.slug, key)] ? "Yes" : "No"}</td>`)
          .join("");
        return `<tr><td>${escapeHtml(section)}</td><td>${escapeHtml(item.description)}</td><td>${escapeHtml(item.description)}</td><td>${escapeHtml(item.underMenu)}</td>${flags}</tr>`;
      }),
    )
    .join("");
  const note = readOnly
    ? "<p>Read-only preview. No access is granted from this screen.</p>"
    : `<p>Group: ${escapeHtml(groupName)}</p>`;
  return `<!doctype html><html><head><title>Access Rights — ${escapeHtml(groupName)}</title>
<style>
  body { font-family: sans-serif; margin: 24px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ccc; padding: 4px 8px; font-size: 12px; }
  th { background: #f3f4f6; }
</style></head><body>
<h1>Access Rights</h1>
${note}
<table>
<thead><tr><th>Section</th><th>Menu Name</th><th>Description</th><th>Under Menu</th>${permissionLabels.map((label) => `<th>${label}</th>`).join("")}</tr></thead>
<tbody>${rows || "<tr><td colspan='10'>No forms loaded.</td></tr>"}</tbody>
</table>
</body></html>`;
}

export const Route = createFileRoute("/utility/users/access-rights")({
  head: () => ({
    meta: [
      { title: "Access Rights — Utility — Courier ERP" },
      { name: "description", content: "Configure module permissions by user group." },
    ],
  }),
  component: AccessRightsPage,
});

function AccessRightsPage() {
  const { isAuthenticated, profile } = useAuth();
  const allowedToEdit = useCan("utl.access-rights", "modify");
  const canEdit = isAuthenticated && allowedToEdit;
  const [group, setGroup] = useState<string>("");
  const [searched, setSearched] = useState(false);
  const [openSections, setOpenSections] = useState<SectionKey[]>(["Masters"]);
  const [emptySearchAttempt, setEmptySearchAttempt] = useState(false);
  const [savingSections, setSavingSections] = useState<Record<string, boolean>>({});
  const [catalog, setCatalog] = useState<Record<SectionKey, AccessItem[]>>(emptyCatalog);
  const [catalogReady, setCatalogReady] = useState(false);

  const [liveGroups, setLiveGroups] = useState<{ id: string; name: string }[]>([]);
  const [livePermissions, setLivePermissions] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isAuthenticated) {
      setCatalog(emptyCatalog());
      setCatalogReady(false);
      setLivePermissions({});
      return;
    }
    Promise.all([listGroups(), listPermissionModules()])
      .then(([groupsData, modules]) => {
        setLiveGroups(groupsData.map((g) => ({ id: g.id, name: g.name })));
        setCatalog(catalogFromModules(modules));
        setCatalogReady(true);
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : "Could not load the form catalog";
        toast.error(message);
      });
  }, [isAuthenticated]);

  const groupOptions = isAuthenticated
    ? liveGroups.map((g) => g.name)
    : (groups as readonly string[]);
  const selectedGroup = useMemo(() => group || "Select Group", [group]);
  const permissions = livePermissions;

  const runSearch = async () => {
    if (!group) {
      setEmptySearchAttempt(true);
      return toast.warning("Please select a user group to search permissions.");
    }
    setEmptySearchAttempt(false);
    if (!isAuthenticated) {
      setLivePermissions({});
      setSearched(true);
      return;
    }
    if (!catalogReady) {
      return toast.warning("The form catalog is still loading.");
    }
    const groupId = liveGroups.find((g) => g.name === group)?.id;
    if (!groupId) return toast.error("Group not found");
    try {
      const rows = await getGroupPermissions(groupId);
      const byModule = new Map(rows.map((r) => [r.module_id, r]));
      const next: Record<string, boolean> = {};
      sectionOrder.forEach((section) => {
        catalog[section].forEach((item) => {
          const grant = byModule.get(item.moduleId);
          permissionKeys.forEach((key) => {
            const col = PERMISSION_COLUMN[key];
            next[permissionId(item.slug, key)] = grant ? Boolean(grant[col]) : false;
          });
        });
      });
      setLivePermissions(next);
      setSearched(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load permissions";
      toast.error(message);
    }
  };

  const saveSection = async (section: SectionKey) => {
    if (!isAuthenticated || !canEdit) {
      toast.error("Sign in with Access Rights Modify permission to save.");
      return;
    }
    const groupId = liveGroups.find((g) => g.name === group)?.id;
    if (!groupId || !profile) return toast.error("Sign in as a tenant user to save");
    const items = catalog[section];
    const missing = items.filter((item) => !item.moduleId);
    if (missing.length > 0) {
      return toast.error(`These forms are not in the catalog yet: ${missing.map((item) => item.slug).join(", ")}`);
    }

    setSavingSections((prev) => ({ ...prev, [section]: true }));
    try {
      await saveGroupPermissions(profile.tenant_id, groupId, grantsFor(items, permissions));
      toast.success(`Access rights updated successfully for group: ${group}`, { duration: 3000 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Save failed (permission denied?)";
      toast.error(message);
    } finally {
      setSavingSections((prev) => ({ ...prev, [section]: false }));
    }
  };

  const toggleSection = (section: SectionKey) => {
    setOpenSections((current) =>
      current.includes(section)
        ? current.filter((item) => item !== section)
        : [...current, section],
    );
  };

  const applyPermissions = (
    updater: (prev: Record<string, boolean>) => Record<string, boolean>,
  ) => {
    if (!isAuthenticated) return;
    setLivePermissions((prev) => updater(prev));
  };

  const setSectionAccess = (section: SectionKey, checked: boolean) => {
    if (!group || !canEdit) return;
    applyPermissions((prev) => {
      const next = { ...prev };
      catalog[section].forEach((item) => {
        permissionKeys.forEach((key) => {
          next[permissionId(item.slug, key)] = checked;
        });
      });
      return next;
    });
  };

  const updateCell = (slug: string, key: PermissionKey, checked: boolean) => {
    if (!group || !canEdit) return;
    applyPermissions((prev) => {
      const next = { ...prev, [permissionId(slug, key)]: checked };
      if (key === "allAccess") {
        permissionKeys.forEach((permissionKey) => {
          next[permissionId(slug, permissionKey)] = checked;
        });
      } else if (!checked) {
        next[permissionId(slug, "allAccess")] = false;
      } else {
        const childKeys = permissionKeys.filter((permissionKey) => permissionKey !== "allAccess");
        next[permissionId(slug, "allAccess")] = childKeys.every((permissionKey) =>
          permissionKey === key ? checked : prev[permissionId(slug, permissionKey)],
        );
      }
      return next;
    });
  };

  const printMatrix = () => {
    const html = matrixHtml(group || "Preview", catalog, permissions, !isAuthenticated);
    const popup = window.open("", "_blank", "noopener,noreferrer");
    if (!popup) {
      toast.error("Allow pop-ups to print the access matrix.");
      return;
    }
    popup.document.write(html);
    popup.document.close();
    popup.focus();
    popup.print();
  };

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <MasterBreadcrumb trail={["Utility", "Users", "Access Rights"]} />

      <Card className="relative min-w-0 border p-4 pt-7">
        <span className="absolute -top-3 left-4 rounded-full bg-sidebar px-4 py-1 text-xs font-semibold text-sidebar-foreground shadow">
          Access Right
        </span>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex w-44 flex-col gap-1 text-xs font-medium text-foreground">
            Group
            <Select
              value={group}
              onValueChange={(value) => {
                setGroup(value);
                setSearched(false);
                setOpenSections([]);
                setLivePermissions({});
              }}
            >
              <SelectTrigger
                className={`h-9 ${
                  emptySearchAttempt && !group ? "border-red-500 ring-1 ring-red-500" : ""
                }`}
              >
                <SelectValue placeholder={selectedGroup} />
              </SelectTrigger>
              <SelectContent>
                {groupOptions.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <Button
            onClick={() => void runSearch()}
            className="h-9 rounded-full bg-slate-600 px-8 text-white hover:bg-slate-700"
          >
            Search
          </Button>
          {searched ? (
            <Button
              onClick={printMatrix}
              className="h-9 rounded-full bg-sky-500 px-8 text-white hover:bg-sky-600"
            >
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
          ) : null}
        </div>
      </Card>

      {!isAuthenticated ? (
        <Card className="border-dashed p-4 text-sm text-muted-foreground">
          Signed-out preview is read-only. Nothing on this screen is granted. Sign in to load the
          form catalog and a group's access rights.
        </Card>
      ) : null}

      {searched ? (
        <div className="flex flex-col gap-3">
          {sectionOrder.map((section) => (
            <AccessSection
              key={section}
              section={section}
              items={catalog[section]}
              open={openSections.includes(section)}
              permissions={permissions}
              onToggle={() => toggleSection(section)}
              onSetSectionAccess={(checked) => setSectionAccess(section, checked)}
              onUpdateCell={updateCell}
              onSave={() => saveSection(section)}
              canEdit={canEdit}
              isSaving={savingSections[section]}
            />
          ))}
        </div>
      ) : (
        <Card className="flex h-40 items-center justify-center border-dashed text-sm text-muted-foreground">
          Select a User Group from the dropdown above and click Search to configure access rights.
        </Card>
      )}
    </div>
  );
}

function AccessSection({
  section,
  items,
  open,
  permissions,
  onToggle,
  onSetSectionAccess,
  onUpdateCell,
  onSave,
  canEdit,
  isSaving,
}: {
  section: SectionKey;
  items: AccessItem[];
  open: boolean;
  permissions: Record<string, boolean>;
  onToggle: () => void;
  onSetSectionAccess: (checked: boolean) => void;
  onUpdateCell: (slug: string, key: PermissionKey, checked: boolean) => void;
  onSave: () => Promise<void> | void;
  canEdit: boolean;
  isSaving?: boolean;
}) {
  const allChecked =
    items.length > 0 &&
    items.every((item) => permissionKeys.every((key) => permissions[permissionId(item.slug, key)]));

  return (
    <Card className="overflow-hidden p-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between bg-muted px-3 py-2 text-left text-sm font-medium text-foreground hover:bg-muted/80"
      >
        <span className="flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          {section}
        </span>
        <label
          className="flex items-center gap-2 text-xs font-normal"
          onClick={(event) => event.stopPropagation()}
        >
          <span>Un Check All</span>
          <Checkbox
            checked={allChecked}
            disabled={!canEdit || items.length === 0}
            onCheckedChange={(value) => onSetSectionAccess(Boolean(value))}
          />
        </label>
      </button>

      {open ? (
        <>
          <div className="max-h-[420px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[220px]">Menu Name</TableHead>
                  <TableHead className="min-w-[220px]">Description</TableHead>
                  <TableHead className="min-w-[140px]">Under Menu</TableHead>
                  {permissionLabels.map((label) => (
                    <TableHead key={label} className="w-24 text-center">
                      {label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.slug}>
                    <TableCell>{item.description}</TableCell>
                    <TableCell>{item.description}</TableCell>
                    <TableCell>{item.underMenu}</TableCell>
                    {permissionKeys.map((key) => (
                      <TableCell key={key} className="text-center">
                        <Checkbox
                          checked={permissions[permissionId(item.slug, key)] ?? false}
                          disabled={!canEdit}
                          onCheckedChange={(value) => onUpdateCell(item.slug, key, Boolean(value))}
                          className="mx-auto"
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {canEdit ? (
            <div className="flex justify-end border-t px-3 py-2">
              <Button
                onClick={onSave}
                disabled={isSaving}
                className="h-8 rounded-full bg-green-500 px-6 text-white hover:bg-green-600"
              >
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSaving ? "Saving..." : "Update"}
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

export { catalogFromModules, grantsFor, matrixHtml, sectionOrder };
