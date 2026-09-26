import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/lib/auth";
import { authorizedFetch } from "@/lib/security/authorized-fetch";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MasterBreadcrumb } from "@/components/master-table-kit";

type Lookup = { id: string; code?: string; name: string };
type UserRow = {
  id: string;
  username: string;
  full_name: string | null;
  email: string | null;
  mobile: string | null;
  user_type: string;
  user_subtype: string | null;
  status: string;
  application_type: string;
  home_branch_id: string | null;
  origin_id: string | null;
  customer_id: string | null;
  group_id: string | null;
  birth_date: string | null;
  joining_date: string | null;
  allow_changing_date: string | null;
  add_entry_on_manifest: boolean;
  otp_login_enabled: boolean;
  global_manifest: boolean;
  allow_changing_awb_no: boolean;
  allow_mobile_scanning: boolean;
  weight_unit: string;
  email_verified_at: string | null;
};

type FormState = {
  userType: string;
  userSubtype: string;
  username: string;
  fullName: string;
  email: string;
  mobile: string;
  originId: string;
  serviceCenterId: string;
  customerId: string;
  groupId: string;
  birthDate: string;
  joiningDate: string;
  status: string;
  applicationType: string;
  allowChangingDate: string;
  addEntryOnManifest: boolean;
  allowLoginWithOtp: boolean;
  globalManifest: boolean;
  allowChangingAwbNo: boolean;
  allowMobileScanning: boolean;
  weightType: string;
};

const emptyForm = (): FormState => ({
  userType: "STAFF",
  userSubtype: "BRANCH",
  username: "",
  fullName: "",
  email: "",
  mobile: "",
  originId: "",
  serviceCenterId: "",
  customerId: "",
  groupId: "",
  birthDate: "",
  joiningDate: "",
  status: "ACTIVE",
  applicationType: "PORTAL",
  allowChangingDate: "",
  addEntryOnManifest: false,
  allowLoginWithOtp: false,
  globalManifest: false,
  allowChangingAwbNo: false,
  allowMobileScanning: false,
  weightType: "KG",
});

export const Route = createFileRoute("/utility/users/user-setup")({
  head: () => ({
    meta: [{ title: "User Setup — Utility — Courier ERP" }],
  }),
  component: UserSetupPage,
});

function UserSetupPage() {
  const { hasPermission, loading: authLoading } = useAuth();
  const canList = hasPermission("utl.user-setup", "list") || hasPermission("utl.user-setup", "search");
  const canAdd = hasPermission("utl.user-setup", "add");
  const canModify = hasPermission("utl.user-setup", "modify");
  const canDelete = hasPermission("utl.user-setup", "delete");
  const [rows, setRows] = useState<UserRow[]>([]);
  const [lookups, setLookups] = useState<{ branches: Lookup[]; origins: Lookup[]; customers: Lookup[]; groups: Lookup[] }>({
    branches: [],
    origins: [],
    customers: [],
    groups: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [screen, setScreen] = useState<"list" | "form">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<{ id: string; action: "deactivate" | "delete" } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [userRes, lookupRes] = await Promise.all([
        authorizedFetch(`/api/users?search=${encodeURIComponent(search)}`),
        authorizedFetch("/api/users?lookups=1"),
      ]);
      if (userRes.status === 403 || lookupRes.status === 403) {
        setError("You do not have permission to manage users.");
        setRows([]);
        return;
      }
      if (!userRes.ok || !lookupRes.ok) throw new Error("Could not load users");
      const userBody = (await userRes.json()) as { users: UserRow[] };
      const lookupBody = (await lookupRes.json()) as typeof lookups;
      setRows(userBody.users ?? []);
      setLookups(lookupBody);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load users");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    if (authLoading || !canList) {
      if (!authLoading) setLoading(false);
      return;
    }
    void load();
  }, [authLoading, canList, load]);

  const openEdit = (row: UserRow) => {
    setEditingId(row.id);
    setForm({
      userType: row.user_type === "ADMIN" ? "ADMIN" : "STAFF",
      userSubtype: row.user_subtype === "HUB" ? "HUB" : "BRANCH",
      username: row.username,
      fullName: row.full_name ?? "",
      email: row.email ?? "",
      mobile: row.mobile ?? "",
      originId: row.origin_id ?? "",
      serviceCenterId: row.home_branch_id ?? "",
      customerId: row.customer_id ?? "",
      groupId: row.group_id ?? "",
      birthDate: row.birth_date ?? "",
      joiningDate: row.joining_date ?? "",
      status: row.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
      applicationType: row.application_type || "PORTAL",
      allowChangingDate: row.allow_changing_date ?? "",
      addEntryOnManifest: row.add_entry_on_manifest,
      allowLoginWithOtp: row.otp_login_enabled,
      globalManifest: row.global_manifest,
      allowChangingAwbNo: row.allow_changing_awb_no,
      allowMobileScanning: row.allow_mobile_scanning,
      weightType: row.weight_unit === "LB" ? "LB" : "KG",
    });
    setScreen("form");
  };

  const save = async () => {
    setSaving(true);
    try {
      const response = await authorizedFetch("/api/users", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, userId: editingId }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; emailSent?: boolean };
      if (!response.ok) {
        toast.error(body.error || "Could not save the user");
        return;
      }
      if (!editingId && body.emailSent === false) {
        toast.warning("User created, but the activation email was not sent. Use Resend invite after mail is configured.");
      } else {
        toast.success(editingId ? "User updated" : "User created. An activation email was sent.");
      }
      setScreen("list");
      await load();
    } catch {
      toast.error("Could not save the user");
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (userId: string, action: "deactivate" | "reactivate" | "delete" | "invite") => {
    const response = await authorizedFetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, userId }),
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      toast.error(body.error || "Could not update the user");
      return;
    }
    toast.success("User updated");
    await load();
  };

  if (!authLoading && !canList) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">User Setup</h1>
        <p className="mt-2 text-sm text-muted-foreground">You do not have permission to open User Setup.</p>
      </div>
    );
  }

  if (screen === "form") {
    return (
      <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
        <MasterBreadcrumb trail={["Utility", "Users", "User Setup"]} />
        <h1 className="text-xl font-semibold">{editingId ? "Edit user" : "New user"}</h1>
        <Card className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="User type">
            <Select value={form.userType} onValueChange={(value) => setForm({ ...form, userType: value })}>
              <SelectTrigger aria-label="User type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ADMIN">Admin</SelectItem>
                <SelectItem value="STAFF">User</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="User subtype">
            <Select value={form.userSubtype} onValueChange={(value) => setForm({ ...form, userSubtype: value })}>
              <SelectTrigger aria-label="User subtype"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="HUB">HUB</SelectItem>
                <SelectItem value="BRANCH">Branch</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Text label="Username" value={form.username} onChange={(username) => setForm({ ...form, username })} />
          <Text label="Full name" value={form.fullName} onChange={(fullName) => setForm({ ...form, fullName })} />
          <Text label="Email" type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} />
          <Text label="Mobile" value={form.mobile} onChange={(mobile) => setForm({ ...form, mobile })} />
          <LookupField label="Origin" value={form.originId} options={lookups.origins} onChange={(originId) => setForm({ ...form, originId })} />
          <LookupField label="Service center" value={form.serviceCenterId} options={lookups.branches} onChange={(serviceCenterId) => setForm({ ...form, serviceCenterId })} />
          <LookupField label="Customer" value={form.customerId} options={lookups.customers} onChange={(customerId) => setForm({ ...form, customerId })} />
          <LookupField label="Group" value={form.groupId} options={lookups.groups} onChange={(groupId) => setForm({ ...form, groupId })} />
          <Text label="Birth date" type="date" value={form.birthDate} onChange={(birthDate) => setForm({ ...form, birthDate })} />
          <Text label="Joining date" type="date" value={form.joiningDate} onChange={(joiningDate) => setForm({ ...form, joiningDate })} />
          <Field label="Status">
            <Select value={form.status} onValueChange={(status) => setForm({ ...form, status })}>
              <SelectTrigger aria-label="Status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="INACTIVE">In-Active</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Application type">
            <Select value={form.applicationType} onValueChange={(applicationType) => setForm({ ...form, applicationType })}>
              <SelectTrigger aria-label="Application type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                <SelectItem value="MOBILE">Mobile</SelectItem>
                <SelectItem value="PORTAL">Portal</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Text label="Allow changing date" value={form.allowChangingDate} onChange={(allowChangingDate) => setForm({ ...form, allowChangingDate })} />
          <Field label="Weight type">
            <Select value={form.weightType} onValueChange={(weightType) => setForm({ ...form, weightType })}>
              <SelectTrigger aria-label="Weight type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="KG">Kgs</SelectItem>
                <SelectItem value="LB">Lbs</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Check label="Add entry on manifest" checked={form.addEntryOnManifest} onChange={(addEntryOnManifest) => setForm({ ...form, addEntryOnManifest })} />
          <Check label="Allow login with OTP" checked={form.allowLoginWithOtp} onChange={(allowLoginWithOtp) => setForm({ ...form, allowLoginWithOtp })} />
          <Check label="Global manifest" checked={form.globalManifest} onChange={(globalManifest) => setForm({ ...form, globalManifest })} />
          <Check label="Allow changing AWB number" checked={form.allowChangingAwbNo} onChange={(allowChangingAwbNo) => setForm({ ...form, allowChangingAwbNo })} />
          <Check label="Allow Mobile Scanning" checked={form.allowMobileScanning} onChange={(allowMobileScanning) => setForm({ ...form, allowMobileScanning })} />
        </Card>
        <p className="text-xs text-muted-foreground">
          The user sets their own password from the activation email. Allow Mobile Scanning opens camera scan workflows only. Shipment, bagging, manifest, and status updates still require their own permissions. Manifest branch scope is always applied on the server.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setScreen("list")}>Cancel</Button>
          <Button type="button" onClick={save} disabled={saving || (editingId ? !canModify : !canAdd)}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <MasterBreadcrumb trail={["Utility", "Users", "User Setup"]} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">User Setup</h1>
          <p className="text-sm text-muted-foreground">Create accounts, send activation email, and manage access.</p>
        </div>
        <div className="flex items-end gap-2">
          <label className="flex flex-col gap-1 text-xs">
            Search
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} className="h-9 w-56 pl-8" aria-label="Search users" />
            </div>
          </label>
          <Button type="button" variant="outline" onClick={() => void load()}>Refresh</Button>
          {canAdd ? (
            <Button type="button" onClick={() => { setEditingId(null); setForm(emptyForm()); setScreen("form"); }}>
              <Plus className="mr-1 h-4 w-4" /> Add
            </Button>
          ) : null}
        </div>
      </div>
      <Card className="overflow-x-auto">
        {loading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading users…</p>
        ) : error ? (
          <div className="flex flex-col gap-3 p-6">
            <p className="text-sm">{error}</p>
            <Button type="button" variant="outline" className="w-fit" onClick={() => void load()}>Try again</Button>
          </div>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No users match this search.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {["Username", "Email", "Type", "Subtype", "Status", "OTP", "Action"].map((heading) => (
                  <TableHead key={heading}>{heading}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.username}</TableCell>
                  <TableCell>{row.email}</TableCell>
                  <TableCell>{row.user_type === "ADMIN" ? "Admin" : "User"}</TableCell>
                  <TableCell>{row.user_subtype ?? "—"}</TableCell>
                  <TableCell>{row.status === "ACTIVE" ? "Active" : "In-Active"}</TableCell>
                  <TableCell>{row.otp_login_enabled ? "Yes" : "No"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {canModify ? <Button type="button" size="sm" variant="ghost" aria-label={`Edit ${row.username}`} onClick={() => openEdit(row)}><Pencil className="h-4 w-4" /></Button> : null}
                      {canModify ? (
                        <Button type="button" size="sm" variant="outline" onClick={() => void runAction(row.id, "invite")}>Resend invite</Button>
                      ) : null}
                      {canModify && row.status === "ACTIVE" ? (
                        <Button type="button" size="sm" variant="outline" onClick={() => setConfirm({ id: row.id, action: "deactivate" })}>Deactivate</Button>
                      ) : null}
                      {canModify && row.status !== "ACTIVE" ? (
                        <Button type="button" size="sm" variant="outline" onClick={() => void runAction(row.id, "reactivate")}>Reactivate</Button>
                      ) : null}
                      {canDelete ? (
                        <Button type="button" size="sm" variant="outline" onClick={() => setConfirm({ id: row.id, action: "delete" })}>Delete</Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
      <AlertDialog open={Boolean(confirm)} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.action === "delete" ? "Delete this user?" : "Deactivate this user?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.action === "delete"
                ? "The account is hidden and cannot sign in. The record is kept."
                : "The account cannot sign in until an administrator reactivates it."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirm) void runAction(confirm.id, confirm.action);
                setConfirm(null);
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium">
      {label}
      {children}
    </label>
  );
}

function Text({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <Field label={label}>
      <Input aria-label={label} type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

function LookupField({ label, value, options, onChange }: { label: string; value: string; options: Lookup[]; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <Select value={value || "none"} onValueChange={(next) => onChange(next === "none" ? "" : next)}>
        <SelectTrigger aria-label={label}><SelectValue placeholder={`Select ${label}`} /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">None</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>{option.code ? `${option.code} — ${option.name}` : option.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  const id = label.replace(/\s+/g, "-").toLowerCase();
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm">
      <Checkbox id={id} checked={checked} onCheckedChange={(value) => onChange(value === true)} />
      {label}
    </label>
  );
}
