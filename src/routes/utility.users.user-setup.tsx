import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { IconButton, MasterBreadcrumb, PAGE_SIZE, TablePager } from "@/components/master-table-kit";

type Mode = "User" | "Group";
type Status = "Active" | "In-Active";

type UserSetupRow = {
  id: string;
  type: Mode;
  name: string;
  group: string;
  company: string;
  applicationType: string;
  serviceCenter: string;
  status: Status;
};

type UserForm = {
  userType: string;
  username: string;
  password: string;
  confirmPassword: string;
  birthDate: string;
  joiningDate: string;
  status: Status;
  applicationType: string;
  origin: string;
  serviceCenter: string;
  customer: string;
  group: string;
  emailId: string;
  mobileNo: string;
  allowChangingDate: string;
  allowLoginWithOtp: boolean;
  globalManifest: boolean;
  allowChangingAwbNo: boolean;
  addEntryOnManifest: boolean;
  mobileAppLens: boolean;
  manifestBranch: "Yes" | "No";
  weightType: "Kgs" | "Lbs";
};

const rowsSeed: UserSetupRow[] = [
  ["1", "User", "admin", "BS", "COUR", "", "HYD", "Active"],
  ["2", "User", "SRAV", "BS", "COUR", "", "HYD", "Active"],
  ["3", "User", "SKOKHIL", "OPERATION", "COUR", "", "HYD", "Active"],
  ["4", "User", "SATYA", "OPERATION", "COUR", "", "HYD", "Active"],
  ["5", "User", "CHINNU", "BS", "COUR", "", "HYD", "Active"],
  ["6", "User", "kavya", "OPERATION", "COUR", "", "HYD", "In-Active"],
  ["7", "User", "ARUNV", "OPERATION", "COUR", "", "HYD", "Active"],
  ["8", "User", "BHAVS", "OPERATION", "COUR", "", "HYD", "Active"],
  ["9", "User", "BILLING", "BS", "COUR", "", "HYD", "Active"],
  ["10", "User", "SRAVANI", "Staff", "COUR", "", "HYD", "In-Active"],
  ["11", "Group", "BS", "", "COUR", "", "HYD", "Active"],
  ["12", "Group", "OPERATION", "BS", "COUR", "", "HYD", "Active"],
  ["13", "Group", "Staff", "BS", "COUR", "", "HYD", "Active"],
].map(([id, type, name, group, company, applicationType, serviceCenter, status]) => ({
  id,
  type: type as Mode,
  name,
  group,
  company,
  applicationType,
  serviceCenter,
  status: status as Status,
}));

const origins = [
  "A S PETA",
  "Aalo",
  "ABHANPUR",
  "ABHAYAPURI",
  "ABOHAR",
  "Achampet",
  "Achampet-AP",
  "ACHAMPETA",
  "ACHANTA",
  "ACHROL",
  "ADAMPUR",
  "ADASPUR",
  "ADDANKI",
  "ADDATTEEGALA",
  "ADDURROAD",
  "Adilabad",
  "Adimali",
  "Adirampattinam",
  "ADONI",
];
const groups = ["BS", "OPERATION", "Staff"];
const serviceCenters = ["HYD", "BLR", "BOM", "DEL"];
const changingDateOptions = ["Inscan", "Manifest Scan", "AWB Entry", "DRS Scan", "Progress", "Comments", "Receipt Entry", "Debit Note", "Credit Note", "Manifest Inscan"];

const today = () => new Date().toISOString().slice(0, 10);
const emptyUser = (): UserForm => ({
  userType: "",
  username: "",
  password: "",
  confirmPassword: "",
  birthDate: today(),
  joiningDate: today(),
  status: "Active",
  applicationType: "",
  origin: "",
  serviceCenter: "",
  customer: "",
  group: "",
  emailId: "",
  mobileNo: "",
  allowChangingDate: "",
  allowLoginWithOtp: false,
  globalManifest: false,
  allowChangingAwbNo: false,
  addEntryOnManifest: false,
  mobileAppLens: false,
  manifestBranch: "Yes",
  weightType: "Kgs",
});

export const Route = createFileRoute("/utility/users/user-setup")({
  head: () => ({
    meta: [
      { title: "User Setup — Utility — Courier ERP" },
      { name: "description", content: "Manage users and groups for courier ERP access." },
    ],
  }),
  component: UserSetupPage,
});

function UserSetupPage() {
  const [rows, setRows] = useState<UserSetupRow[]>(rowsSeed);
  const [tab, setTab] = useState<Mode>("User");
  const [screen, setScreen] = useState<"list" | "form">("list");
  const [formTab, setFormTab] = useState<Mode>("User");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [userForm, setUserForm] = useState<UserForm>(emptyUser());
  const [groupName, setGroupName] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    type: "",
    name: "",
    group: "",
    company: "",
    applicationType: "",
    serviceCenter: "",
    status: "",
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (row.type !== tab) return false;
      const values = [row.type, row.name, row.group, row.company, row.applicationType, row.serviceCenter, row.status];
      if (q && !values.some((value) => value.toLowerCase().includes(q))) return false;
      return (Object.keys(filters) as (keyof typeof filters)[]).every((key) => {
        const rowValue = String(row[key] ?? "").toLowerCase();
        return !filters[key] || rowValue.includes(filters[key].toLowerCase());
      });
    });
  }, [filters, rows, search, tab]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const startIdx = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(currentPage * PAGE_SIZE, filtered.length);
  const groupRows = rows.filter((row) => row.type === "Group");

  const openAdd = () => {
    setEditingId(null);
    setUserForm(emptyUser());
    setGroupName("");
    setFormTab(tab);
    setScreen("form");
  };

  const openEdit = (row: UserSetupRow) => {
    setEditingId(row.id);
    setFormTab(row.type);
    if (row.type === "Group") setGroupName(row.name);
    else setUserForm({ ...emptyUser(), username: row.name, group: row.group, serviceCenter: row.serviceCenter, applicationType: row.applicationType, status: row.status });
    setScreen("form");
  };

  const save = () => {
    if (formTab === "Group") {
      if (!groupName.trim()) return toast.error("Groupname is required");
      upsert({ id: editingId ?? crypto.randomUUID(), type: "Group", name: groupName.trim(), group: "BS", company: "COUR", applicationType: "", serviceCenter: "HYD", status: "Active" });
      setTab("Group");
      toast.success(editingId ? "Group updated" : "Group saved");
      return;
    }

    if (!userForm.username.trim()) return toast.error("Username is required");
    if (!editingId && !userForm.password.trim()) return toast.error("Password is required");
    if (userForm.password !== userForm.confirmPassword) return toast.error("Password and confirm password must match");
    upsert({
      id: editingId ?? crypto.randomUUID(),
      type: "User",
      name: userForm.username.trim(),
      group: userForm.group || "BS",
      company: "COUR",
      applicationType: userForm.applicationType,
      serviceCenter: userForm.serviceCenter || "HYD",
      status: userForm.status,
    });
    setTab("User");
    toast.success(editingId ? "User updated" : "User saved");
  };

  const upsert = (row: UserSetupRow) => {
    setRows((current) => (editingId ? current.map((item) => (item.id === editingId ? row : item)) : [row, ...current]));
    setScreen("list");
  };

  if (screen === "form") {
    return (
      <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
        <MasterBreadcrumb trail={["Utility", "Users", "User Setup"]} />
        <Card className="relative min-w-0 border p-4 pt-7">
          <span className="absolute -top-3 left-4 rounded-full bg-sidebar px-4 py-1 text-xs font-semibold text-sidebar-foreground shadow">User Setup</span>
          <div className="mb-3 flex items-center gap-2">
            <TabButton active={formTab === "User"} onClick={() => setFormTab("User")}>User</TabButton>
            <TabButton active={formTab === "Group"} onClick={() => setFormTab("Group")}>Group</TabButton>
          </div>
          {formTab === "User" ? <UserFields form={userForm} setForm={setUserForm} /> : <div className="max-w-sm"><TextField label="Groupname" value={groupName} onChange={setGroupName} /></div>}
        </Card>
        <div className="flex justify-end gap-2">
          <Button onClick={save} className="h-8 rounded-full bg-green-500 px-6 text-white hover:bg-green-600">Save</Button>
          <Button onClick={() => setScreen("list")} className="h-8 rounded-full bg-red-500 px-6 text-white hover:bg-red-600">Cancel</Button>
        </div>
        {formTab === "User" ? (
          <Card className="border-yellow-200 bg-yellow-50 p-4 text-xs text-yellow-900">
            <p className="mb-2 font-medium">Note</p>
            <ul className="list-disc space-y-1 pl-4">
              <li>Password must contain one special character.</li>
              <li>Password must contain one numeric character.</li>
              <li>Password length should be greater or equal to 8 characters.</li>
              <li>UserName and Password cannot be same.</li>
            </ul>
          </Card>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <MasterBreadcrumb trail={["Utility", "Users", "User Setup"]} />
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">User Setup</h1>
        <p className="text-sm text-muted-foreground">Manage portal users, mobile users, application access, and groups.</p>
      </div>
      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <IconButton label="Export" onClick={() => toast.success("Export queued")}><Download className="h-4 w-4" /></IconButton>
            <TabButton active={tab === "User"} onClick={() => { setTab("User"); setPage(1); }}>User</TabButton>
            <TabButton active={tab === "Group"} onClick={() => { setTab("Group"); setPage(1); }}>Group</TabButton>
            <SummaryChip label="Portal Users" count={14} />
            <SummaryChip label="Mobile Users" count={2} />
            <SummaryChip label="Mob & Web" count={2} />
            <SummaryChip label="Total" count={rows.length} />
            <SummaryChip label="Group" count={groupRows.length} />
          </div>
          <div className="flex items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-foreground">
              Search:
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className="h-9 w-56 pl-8" />
              </div>
            </label>
            <Button size="sm" className="h-9 gap-1.5" onClick={openAdd}><Plus className="h-4 w-4" />Add</Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-sidebar hover:bg-sidebar">
                {["Type", "Name", "Group", "Company", "Application Type", "Service Center", "Status", "Action"].map((heading) => (
                  <TableHead key={heading} className="whitespace-nowrap text-sidebar-foreground">
                    <span className="flex items-center justify-between gap-2">{heading}{heading !== "Action" ? <span className="text-xs">⇅</span> : null}</span>
                  </TableHead>
                ))}
              </TableRow>
              <TableRow className="bg-muted/20 hover:bg-muted/20">
                {(["type", "name", "group", "company", "applicationType", "serviceCenter", "status"] as const).map((key) => (
                  <TableHead key={key} className="py-2">
                    <Input value={filters[key]} onChange={(event) => { setFilters((current) => ({ ...current, [key]: event.target.value })); setPage(1); }} placeholder={key === "applicationType" ? "Application Type" : key === "serviceCenter" ? "Service Center" : key[0].toUpperCase() + key.slice(1)} className="h-8" />
                  </TableHead>
                ))}
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((row) => (
                <TableRow key={row.id} className="odd:bg-muted/50">
                  <TableCell>{row.type}</TableCell>
                  <TableCell>{row.name}</TableCell>
                  <TableCell>{row.group}</TableCell>
                  <TableCell>{row.company}</TableCell>
                  <TableCell>{row.applicationType}</TableCell>
                  <TableCell>{row.serviceCenter}</TableCell>
                  <TableCell>{row.status}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <IconButton label="Edit" size="row" variant="ghost" onClick={() => openEdit(row)}><Pencil className="h-4 w-4" /></IconButton>
                      <IconButton label="Delete" size="row" variant="ghost" onClick={() => { setRows((current) => current.filter((item) => item.id !== row.id)); toast.success("Deleted"); }}><Trash2 className="h-4 w-4 text-destructive" /></IconButton>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <TablePager totalPages={totalPages} currentPage={currentPage} setPage={setPage} startIdx={startIdx} endIdx={endIdx} total={filtered.length} />
      </Card>
    </div>
  );
}

function UserFields({ form, setForm }: { form: UserForm; setForm: React.Dispatch<React.SetStateAction<UserForm>> }) {
  const update = <K extends keyof UserForm>(key: K, value: UserForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  return (
    <div className="grid gap-x-3 gap-y-2 md:grid-cols-4">
      <SelectField label="User Type" value={form.userType} placeholder="Select Type" options={["Admin", "User", "Customer"]} onChange={(value) => update("userType", value)} />
      <TextField label="Username" value={form.username} onChange={(value) => update("username", value)} />
      <SelectField label="Origin" value={form.origin} placeholder="Select Origin" options={origins} onChange={(value) => update("origin", value)} />
      <SelectField label="Service Center" value={form.serviceCenter} placeholder="Select Service Center" options={serviceCenters} onChange={(value) => update("serviceCenter", value)} />
      <TextField label="Password" type="password" value={form.password} onChange={(value) => update("password", value)} />
      <TextField label="Confirm Password" type="password" value={form.confirmPassword} onChange={(value) => update("confirmPassword", value)} />
      <SelectField label="Customer" value={form.customer} placeholder="Select Customer" options={["COURIERWALA EXPRESS", "Retail Customer", "Corporate Customer"]} onChange={(value) => update("customer", value)} />
      <SelectField label="Group" value={form.group} placeholder="Select Group" options={groups} onChange={(value) => update("group", value)} />
      <TextField label="Birth Date" type="date" value={form.birthDate} onChange={(value) => update("birthDate", value)} />
      <TextField label="Joining Date" type="date" value={form.joiningDate} onChange={(value) => update("joiningDate", value)} />
      <TextField label="Email ID" value={form.emailId} onChange={(value) => update("emailId", value)} />
      <TextField label="Mobile No." value={form.mobileNo} onChange={(value) => update("mobileNo", value)} />
      <SelectField label="Status" value={form.status} options={["Active", "In-Active"]} onChange={(value) => update("status", value as Status)} />
      <SelectField label="Application Type" value={form.applicationType} placeholder="Select Type" options={["All", "Mobile", "Portal"]} onChange={(value) => update("applicationType", value)} />
      <SelectField label="Allow Changing Date" value={form.allowChangingDate} placeholder="Select Type" options={changingDateOptions} onChange={(value) => update("allowChangingDate", value)} />
      <CheckField label="Add Entry on Manifest" checked={form.addEntryOnManifest} onChange={(value) => update("addEntryOnManifest", value)} />
      <CheckField label="Allow Login With OTP" checked={form.allowLoginWithOtp} onChange={(value) => update("allowLoginWithOtp", value)} />
      <CheckField label="Global Manifest" checked={form.globalManifest} onChange={(value) => update("globalManifest", value)} />
      <CheckField label="Allow changing AWB No." checked={form.allowChangingAwbNo} onChange={(value) => update("allowChangingAwbNo", value)} />
      <CheckField label="Mobile App Lens" checked={form.mobileAppLens} onChange={(value) => update("mobileAppLens", value)} />
      <ToggleField label="Manifest Branch" value={form.manifestBranch} options={["Yes", "No"]} onChange={(value) => update("manifestBranch", value as "Yes" | "No")} />
      <ToggleField label="Weight Type" value={form.weightType} options={["Kgs", "Lbs"]} onChange={(value) => update("weightType", value as "Kgs" | "Lbs")} />
    </div>
  );
}

function TextField({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label className="flex flex-col gap-1 text-xs font-medium text-foreground">{label}<Input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="h-9" /></label>;
}

function SelectField({ label, value, onChange, options, placeholder }: { label: string; value: string; onChange: (value: string) => void; options: string[]; placeholder?: string }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
      {label}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9"><SelectValue placeholder={placeholder ?? label} /></SelectTrigger>
        <SelectContent>{options.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
      </Select>
    </label>
  );
}

function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex h-9 items-end gap-2 pb-2 text-xs text-foreground"><Checkbox checked={checked} onCheckedChange={(value) => onChange(Boolean(value))} /><span>{label}</span></label>;
}

function ToggleField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <div className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
      <span>{label}</span>
      <div className="inline-flex w-fit overflow-hidden rounded-md border bg-background">
        {options.map((option) => <button key={option} type="button" onClick={() => onChange(option)} className={`h-7 px-3 text-xs ${value === option ? "bg-green-600 text-white" : "text-muted-foreground hover:bg-muted"}`}>{option}</button>)}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <Button type="button" size="sm" variant={active ? "default" : "outline"} className={`h-8 px-4 ${active ? "bg-green-600 text-white hover:bg-green-700" : ""}`} onClick={onClick}>{children}</Button>;
}

function SummaryChip({ label, count }: { label: string; count: number }) {
  return <span className="inline-flex h-7 items-center gap-2 rounded-md border bg-background px-3 text-xs text-muted-foreground"><span>{label}</span><span className="rounded-full bg-slate-600 px-2 py-0.5 text-[10px] font-semibold text-white">{count}</span></span>;
}
