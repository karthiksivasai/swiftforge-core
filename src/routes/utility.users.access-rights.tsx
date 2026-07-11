import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Printer } from "lucide-react";
import { toast } from "sonner";

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

type SectionKey = "Masters" | "Transaction" | "Documents" | "Reports" | "Utilities" | "Mobile Application";
type PermissionKey = "allAccess" | "add" | "modify" | "delete" | "list" | "search";

type AccessItem = {
  description: string;
  underMenu: string;
};

const groups = ["BS", "OPERATION", "Staff"] as const;
type GroupName = (typeof groups)[number];
const permissionKeys: PermissionKey[] = ["allAccess", "add", "modify", "delete", "list", "search"];
const permissionLabels = ["AllAccess", "Add", "Modify", "Delete", "List", "Search"];

const accessSections: Record<SectionKey, AccessItem[]> = {
  Masters: [
    "Product Master|Masters",
    "Zone Master|Masters",
    "Country Master|Masters",
    "Customer Master Edit Contract Amount|Masters",
    "Unit Master|Masters",
    "Destination Master|Masters",
    "Location Master|Masters",
    "State Master|Masters",
    "Sales Executive Master|Masters",
    "Industry Master|Masters",
    "Flight No Master|Masters",
    "Product Type|Masters",
    "Content Master|Masters",
    "Instruction Master|Masters",
    "Local Branch Master|Masters",
    "Charge Master|Masters",
    "Bank Master|Masters",
    "Customer Master|Masters",
    "Customer Contract Master|Masters",
    "Consignee Master|Masters",
    "Shipper Master|Masters",
    "Expense Master|Masters",
    "Vendor Master|Masters",
    "Vendor Contract Master|Masters",
    "Service Mapping|Masters",
    "Pickup/delivery Boy Master|Masters",
    "Delivery Routes Master|Masters",
    "Area Master|Masters",
    "Delivery Exception Master|Masters",
    "Airlines|Masters",
    "Country Pincodes|Masters",
  ].map(toItem),
  Transaction: [
    "Pickup|Entry",
    "Pickup Insacn|Entry",
    "Allow Modify Delivered Entry|Entry",
    "AWB Entry|Entry",
    "AWB Entry Allow Previous Date Entry|Entry",
    "AWB Entry Change Volumetric Weight Divide|Entry",
    "AWB Entry Display Amount|Entry",
    "AWB Entry Display Cash Receipt Details|Entry",
    "AWB Entry Display Vendor Amount|Entry",
    "AWB Entry Edit Amount|Entry",
    "Awb Entry File Setup|Entry",
    "AWB Entry Lock Option|Entry",
    "AWB Entry Modify after Invoice Generated|Entry",
    "AWB Entry Modify after Manifest Generated|Entry",
    "AWB Entry Modify Customer Code-Entryby Customer|Entry",
    "AWB Entry VOID/Cancel|Entry",
    "AWB Weight Change Access|Entry",
    "Freight Amount Edit|Entry",
    "Modify Amount Edit Entry|Entry",
    "OBC Entry Lock/UnLock|Entry",
    "Performa Invoice|Entry",
    "POD Entry OK Update|Entry",
    "shipment details|Entry",
    "Manifest Scan|Entry",
    "Manifest In Scan|Entry",
    "Update Manifest|Entry",
    "Drs Scan|Entry",
    "Bagging|Entry",
    "Un-Delivery Scan|Entry",
    "Miss Route Scan|Entry",
    "Transfer Run|Entry",
    "OBC Entry|Entry",
    "Awb Query|Entry",
    "Forwarding Updation|Entry",
    "AWB Query Comment Update|Entry",
    "AWB Query Progress Update|Entry",
    "Progress / Comments Update|Entry",
    "KYC Tracking|Entry",
    "AWB Hold Unhold|Entry",
    "Entry Lock Update|Entry",
    "Update Record|Entry",
    "Expense Authorize|Entry",
    "Receipt Adjustment|Entry",
    "Receipt Entry|Entry",
    "Expense Entry|Entry",
    "Debit Note|Entry",
    "Credit Note|Entry",
    "Customer Pay|Entry",
    "Pickup Cancel|Entry",
    "Pod To Excel|Entry",
    "Vendor Rate Compare|Entry",
    "CustomerRateCompare|Entry",
    "Opertation Dashboard|Entry",
    "Sales Dashboard|Entry",
  ].map(toItem),
  Documents: [
    "Invoice Cancel After IRN Generated|Documents",
    "Generate Invoice|Documents",
    "Print Invoice|Documents",
    "Allow Invoice Date To Change|Documents",
    "Invoice Finalise|Documents",
    "Invoice IRN Generation|Documents",
  ].map(toItem),
  Reports: [
    "Action Log|Reports",
    "AWB Printing|Reports",
    "Bag wise Detail Print|Reports",
    "Bagging Report|Reports",
    "Billing Report|Reports",
    "Cash Collection Report|Reports",
    "COD Report|Reports",
    "Comment View Report|Reports",
    "Customer AWB Stock Report|Reports",
    "Customer Register / Profit|Reports",
    "Customer Summary|Reports",
    "Daily Report|Reports",
    "Delivery Status Report|Reports",
    "Destination Summary Report|Reports",
    "DRS Report|Reports",
    "EDI CSB Files|Reports",
    "Forwarding No Missing Report|Reports",
    "Forwarding Report|Reports",
    "Invoice Report|Reports",
    "Location Summary|Reports",
    "Login Log|Reports",
    "Manifest POD Report|Reports",
    "Manifest Report|Reports",
    "MIS Report|Reports",
    "OBC Report / Checklist|Reports",
    "OK Delivery|Reports",
    "Operation Report|Reports",
    "Product Summary|Reports",
    "Sales Executive Wise Sales Report|Reports",
    "Scan Report|Reports",
    "Tariff Rate Report|Reports",
    "Tax Report|Reports",
    "Unassigned DRS Report|Reports",
    "Unassigned Manifest Report|Reports",
    "Unassigned OBC Report|Reports",
    "Undelivery Report|Reports",
    "User Analysis Report|Reports",
    "User Entry Log Report|Reports",
    "Vendor Profit Report|Reports",
    "Void Report|Reports",
    "Volumetric Weight Report|Reports",
    "Zero Report|Reports",
    "Statement Report|Reports",
    "AWB Report|Reports",
    "Reports Allow Report Field Selection|Reports",
    "Scan Report|Reports",
    "AR Report|Reports",
  ].map(toItem),
  Utilities: [
    "Serviceable Pincode|Utilities",
    "Notification|Utilities",
    "Fuel Setup|Utilities",
    "User Setup|Utilities",
    "Access Rights|Utilities",
    "AWB Merging|Utilities",
    "LoggedIn Users|Utilities",
    "Pod Merging|Utilities",
    "Forwarding Merging|Utilities",
    "Customer AWB Stock Merging|Utilities",
    "Data Import|Utilities",
    "Other Charges Import|Utilities",
    "Data Updation|Utilities",
    "Tax & Surcharge Setup|Utilities",
    "Xpresion Setup|Utilities",
    "Rate Update|Utilities",
    "Zone Update|Utilities",
    "Rate Import|Utilities",
  ].map(toItem),
  "Mobile Application": [
    "AWBEntry|MobileApplication",
    "Delivery|MobileApplication",
    "DRS|MobileApplication",
    "Manifest|MobileApplication",
    "ManifestInscan|MobileApplication",
    "Pickup|MobileApplication",
    "PickupInScan|MobileApplication",
    "POD Entry|MobileApplication",
    "PreDrs|MobileApplication",
    "Report|MobileApplication",
    "TRACK|MobileApplication",
    "Pickup Return|MobileApplication",
    "Scan & Print|MobileApplication",
  ].map(toItem),
};

const sectionOrder = Object.keys(accessSections) as SectionKey[];

function toItem(value: string): AccessItem {
  const [description, underMenu] = value.split("|");
  return { description, underMenu };
}

function permissionId(section: SectionKey, rowIndex: number, key: PermissionKey) {
  return `${section}-${rowIndex}-${key}`;
}

function buildInitialPermissions() {
  const permissions: Record<string, boolean> = {};
  sectionOrder.forEach((section) => {
    accessSections[section].forEach((_, rowIndex) => {
      permissionKeys.forEach((key) => {
        permissions[permissionId(section, rowIndex, key)] = true;
      });
    });
  });
  return permissions;
}

function buildGroupPermissions() {
  return groups.reduce(
    (acc, groupName) => ({
      ...acc,
      [groupName]: buildInitialPermissions(),
    }),
    {} as Record<GroupName, Record<string, boolean>>,
  );
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
  const [group, setGroup] = useState<GroupName | "">("");
  const [searched, setSearched] = useState(false);
  const [openSections, setOpenSections] = useState<SectionKey[]>(["Masters"]);
  const [groupPermissions, setGroupPermissions] = useState<Record<GroupName, Record<string, boolean>>>(buildGroupPermissions);

  const selectedGroup = useMemo(() => group || "Select User", [group]);
  const permissions = group ? groupPermissions[group] : groupPermissions.BS;

  const runSearch = () => {
    if (!group) return toast.error("Please select group");
    setSearched(true);
  };

  const toggleSection = (section: SectionKey) => {
    setOpenSections((current) =>
      current.includes(section)
        ? current.filter((item) => item !== section)
        : [...current, section],
    );
  };

  const setSectionAccess = (section: SectionKey, checked: boolean) => {
    if (!group) return;
    setGroupPermissions((current) => {
      const nextGroupPermissions = { ...current[group] };
      accessSections[section].forEach((_, rowIndex) => {
        permissionKeys.forEach((key) => {
          nextGroupPermissions[permissionId(section, rowIndex, key)] = checked;
        });
      });
      return { ...current, [group]: nextGroupPermissions };
    });
  };

  const updateCell = (section: SectionKey, rowIndex: number, key: PermissionKey, checked: boolean) => {
    if (!group) return;
    setGroupPermissions((current) => {
      const currentGroupPermissions = current[group];
      const nextGroupPermissions = { ...currentGroupPermissions, [permissionId(section, rowIndex, key)]: checked };
      if (key === "allAccess") {
        permissionKeys.forEach((permissionKey) => {
          nextGroupPermissions[permissionId(section, rowIndex, permissionKey)] = checked;
        });
      } else if (!checked) {
        nextGroupPermissions[permissionId(section, rowIndex, "allAccess")] = false;
      } else {
        const childKeys = permissionKeys.filter((permissionKey) => permissionKey !== "allAccess");
        nextGroupPermissions[permissionId(section, rowIndex, "allAccess")] = childKeys.every((permissionKey) =>
          permissionKey === key ? checked : currentGroupPermissions[permissionId(section, rowIndex, permissionKey)],
        );
      }
      return { ...current, [group]: nextGroupPermissions };
    });
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
            <Select value={group} onValueChange={(value) => setGroup(value as GroupName)}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder={selectedGroup} />
              </SelectTrigger>
              <SelectContent>
                {groups.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <Button onClick={runSearch} className="h-9 rounded-full bg-slate-600 px-8 text-white hover:bg-slate-700">
            Search
          </Button>
          {searched ? (
            <Button onClick={() => toast.success("Print queued")} className="h-9 rounded-full bg-sky-500 px-8 text-white hover:bg-sky-600">
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
          ) : null}
        </div>
      </Card>

      {searched ? (
        <div className="flex flex-col gap-3">
          {sectionOrder.map((section) => (
            <AccessSection
              key={section}
              section={section}
              items={accessSections[section]}
              open={openSections.includes(section)}
              permissions={permissions}
              onToggle={() => toggleSection(section)}
              onSetSectionAccess={(checked) => setSectionAccess(section, checked)}
              onUpdateCell={(rowIndex, key, checked) => updateCell(section, rowIndex, key, checked)}
            />
          ))}
        </div>
      ) : null}
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
}: {
  section: SectionKey;
  items: AccessItem[];
  open: boolean;
  permissions: Record<string, boolean>;
  onToggle: () => void;
  onSetSectionAccess: (checked: boolean) => void;
  onUpdateCell: (rowIndex: number, key: PermissionKey, checked: boolean) => void;
}) {
  const allChecked = items.every((_, rowIndex) =>
    permissionKeys.every((key) => permissions[permissionId(section, rowIndex, key)]),
  );

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
        <label className="flex items-center gap-2 text-xs font-normal" onClick={(event) => event.stopPropagation()}>
          <span>Un Check All</span>
          <Checkbox checked={allChecked} onCheckedChange={(value) => onSetSectionAccess(Boolean(value))} />
        </label>
      </button>

      {open ? (
        <>
          <div className="max-h-[420px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[320px]">Description</TableHead>
                  <TableHead className="min-w-[140px]">UnderMenu</TableHead>
                  {permissionLabels.map((label) => (
                    <TableHead key={label} className="w-24 text-center">
                      {label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, rowIndex) => (
                  <TableRow key={`${section}-${item.description}`}>
                    <TableCell>{item.description}</TableCell>
                    <TableCell>{item.underMenu}</TableCell>
                    {permissionKeys.map((key) => (
                      <TableCell key={key} className="text-center">
                        <Checkbox
                          checked={permissions[permissionId(section, rowIndex, key)]}
                          onCheckedChange={(value) => onUpdateCell(rowIndex, key, Boolean(value))}
                          className="mx-auto"
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex justify-end border-t px-3 py-2">
            <Button
              onClick={() => toast.success(`${section} access updated`)}
              className="h-8 rounded-full bg-green-500 px-6 text-white hover:bg-green-600"
            >
              Update
            </Button>
          </div>
        </>
      ) : null}
    </Card>
  );
}
