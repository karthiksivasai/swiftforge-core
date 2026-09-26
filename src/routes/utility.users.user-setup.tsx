import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check as CheckIcon, FileText, Globe, Loader2, Monitor, Pencil, Plus, Smartphone, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

import { LookupCombobox } from "@/components/masters/lookup-combobox";
import { PAGE_SIZE, TablePager } from "@/components/master-table-kit";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { useAuth } from "@/lib/auth";
import { archiveGroup, createGroup, listGroups, updateGroup } from "@/lib/rbac-data";
import {
  ALLOW_CHANGING_DATE_MODULES,
  USER_SETUP_PASSWORD_RULES,
  additionalEmailError,
  countUsers,
  deleteUser,
  getUserDetails,
  listUserSetupOptions,
  listUsers,
  saveUser,
  userSetupEmailError,
  userSetupPasswordError,
  userSetupSummary,
  type UserSetupDetails,
  type UserSetupListFilters,
  type UserSetupSaveInput,
} from "@/lib/users/resources/user-setup";

type FormState = {
  userGroupId: string;
  userGroupLabel: string;
  userType: string;
  username: string;
  originId: string;
  originLabel: string;
  serviceCenterId: string;
  serviceCenterLabel: string;
  password: string;
  confirmPassword: string;
  customerId: string;
  customerLabel: string;
  staffGroup: string;
  companyId: string;
  companyLabel: string;
  birthDate: string;
  joiningDate: string;
  email: string;
  mobile: string;
  status: "ACTIVE" | "INACTIVE";
  applicationType: string;
  backdatingModules: string[];
  applicationIds: string[];
  defaultApplicationId: string;
  additionalEmails: string;
  vendorId: string;
  vendorLabel: string;
  addEntryOnManifest: boolean;
  allowLoginWithOtp: boolean;
  globalManifest: boolean;
  allowChangingAwbNo: boolean;
  mobileAppLens: boolean;
  manifestBranch: boolean;
  weightType: "KG" | "LB";
};

function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

const emptyForm = (): FormState => ({
  userGroupId: "",
  userGroupLabel: "",
  userType: "",
  username: "",
  originId: "",
  originLabel: "",
  serviceCenterId: "",
  serviceCenterLabel: "",
  password: "",
  confirmPassword: "",
  customerId: "",
  customerLabel: "",
  staffGroup: "",
  companyId: "",
  companyLabel: "",
  birthDate: todayIso(),
  joiningDate: todayIso(),
  email: "",
  mobile: "",
  status: "ACTIVE",
  applicationType: "",
  backdatingModules: [],
  applicationIds: [],
  defaultApplicationId: "",
  additionalEmails: "",
  vendorId: "",
  vendorLabel: "",
  addEntryOnManifest: false,
  allowLoginWithOtp: false,
  globalManifest: false,
  allowChangingAwbNo: false,
  mobileAppLens: false,
  manifestBranch: false,
  weightType: "KG",
});

function formFromDetails(row: UserSetupDetails): FormState {
  const modules = (row.backdatingModules ?? []).filter((module) =>
    (ALLOW_CHANGING_DATE_MODULES as readonly string[]).includes(module),
  );
  return {
    ...emptyForm(),
    userGroupId: row.userGroupId ?? "",
    userGroupLabel: row.userGroupName ?? "",
    userType: row.userType === "ADMIN" ? "ADMIN" : "STAFF",
    username: row.username,
    originId: row.originId ?? "",
    originLabel: row.originName ?? "",
    serviceCenterId: row.serviceCenterId ?? "",
    serviceCenterLabel: row.serviceCenterName ?? "",
    customerId: row.customerId ?? "",
    customerLabel: row.customerName ?? "",
    staffGroup: row.staffGroup ?? "",
    companyId: row.companyId ?? "",
    companyLabel: row.companyName ?? "",
    birthDate: row.birthDate ?? "",
    joiningDate: row.joiningDate ?? "",
    email: row.email ?? "",
    mobile: row.mobile ?? "",
    status: row.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
    applicationType: row.applicationType || "",
    backdatingModules: modules,
    applicationIds: row.applicationIds ?? [],
    defaultApplicationId: row.defaultApplicationId ?? "",
    additionalEmails: row.additionalEmails ?? "",
    vendorId: row.vendorId ?? "",
    vendorLabel: row.vendorName ?? "",
    addEntryOnManifest: row.addEntryOnManifest,
    allowLoginWithOtp: row.allowLoginWithOtp,
    globalManifest: row.globalManifest,
    allowChangingAwbNo: row.allowChangingAwbNo,
    mobileAppLens: row.mobileAppLens,
    manifestBranch: row.manifestBranch,
    weightType: row.weightType === "LB" ? "LB" : "KG",
  };
}

export const Route = createFileRoute("/utility/users/user-setup")({
  head: () => ({
    meta: [{ title: "User Setup — Utility — Courier ERP" }],
  }),
  component: UserSetupPage,
});

function UserSetupPage() {
  const { hasPermission, loading: authLoading, profile } = useAuth();
  const canList =
    hasPermission("utility.user_setup", "list") ||
    hasPermission("utility.user_setup", "search") ||
    hasPermission("utl.user-setup", "list") ||
    hasPermission("utl.user-setup", "search");
  const canAdd = hasPermission("utility.user_setup", "add") || hasPermission("utl.user-setup", "add");
  const canModify = hasPermission("utility.user_setup", "modify") || hasPermission("utl.user-setup", "modify");
  const canDelete = hasPermission("utility.user_setup", "delete") || hasPermission("utl.user-setup", "delete") || canModify;
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [screen, setScreen] = useState<"list" | "form">("list");
  const [tab, setTab] = useState<"user" | "group">("user");
  const [channel, setChannel] = useState<"" | "PORTAL" | "MOBILE" | "ALL">("");
  const [columnFilters, setColumnFilters] = useState({
    type: "",
    name: "",
    group: "",
    company: "",
    application: "",
    serviceCenter: "",
    status: "",
  });
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "name", dir: "asc" });
  const [groupName, setGroupName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmKind, setConfirmKind] = useState<"user" | "group">("user");

  const filters: UserSetupListFilters = {
    channel,
    type: columnFilters.type,
    name: columnFilters.name,
    group: columnFilters.group,
    company: columnFilters.company,
    application: columnFilters.application,
    serviceCenter: columnFilters.serviceCenter,
    status: columnFilters.status,
    sort: sort.key,
    dir: sort.dir,
  };

  const listQuery = useQuery({
    queryKey: ["user-setup", search, page, filters],
    queryFn: () => listUsers({ search, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, filters }),
    enabled: !authLoading && canList && tab === "user",
  });
  const countQuery = useQuery({
    queryKey: ["user-setup-count", search, filters],
    queryFn: () => countUsers(search, filters),
    enabled: !authLoading && canList && tab === "user",
  });
  const summaryQuery = useQuery({
    queryKey: ["user-setup-summary"],
    queryFn: userSetupSummary,
    enabled: !authLoading && canList,
  });
  const groupsQuery = useQuery({
    queryKey: ["user-setup-groups"],
    queryFn: listGroups,
    enabled: !authLoading && canList,
  });
  const optionsQuery = useQuery({
    queryKey: ["user-setup-options"],
    queryFn: listUserSetupOptions,
    enabled: !authLoading && canList,
  });

  const total = countQuery.data ?? 0;
  useEffect(() => {
    if (countQuery.data == null) return;
    if (page > 1 && (page - 1) * PAGE_SIZE >= countQuery.data) setPage(1);
  }, [countQuery.data, page]);

  const openCreate = () => {
    setEditingId(null);
    setEditingGroupId(null);
    setForm(emptyForm());
    setGroupName("");
    setScreen("form");
  };

  const openEdit = async (id: string) => {
    try {
      const details = await getUserDetails(id);
      setEditingId(id);
      setEditingGroupId(null);
      setForm(formFromDetails(details));
      setTab("user");
      setScreen("form");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open the user");
    }
  };

  const openGroupEdit = (id: string, name: string) => {
    setEditingGroupId(id);
    setEditingId(null);
    setGroupName(name);
    setTab("group");
    setScreen("form");
  };

  const cancel = () => {
    setEditingId(null);
    setEditingGroupId(null);
    setForm(emptyForm());
    setGroupName("");
    setScreen("list");
  };

  const saveGroup = async () => {
    const name = groupName.trim();
    if (!name) {
      toast.error("Enter a group name");
      return;
    }
    if (!editingGroupId && !profile?.tenant_id) {
      toast.error("Could not save the group");
      return;
    }
    setSaving(true);
    try {
      if (editingGroupId) await updateGroup(editingGroupId, name);
      else await createGroup(profile!.tenant_id, name);
      toast.success(editingGroupId ? "Group updated" : "Group created");
      setGroupName("");
      setEditingGroupId(null);
      setScreen("list");
      setTab("group");
      await queryClient.invalidateQueries({ queryKey: ["user-setup-options"] });
      await queryClient.invalidateQueries({ queryKey: ["user-setup-groups"] });
      await queryClient.invalidateQueries({ queryKey: ["user-setup-summary"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the group");
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    if (!form.userGroupId) {
      toast.error("Select a group");
      return;
    }
    if (form.userType !== "ADMIN" && form.userType !== "STAFF") {
      toast.error("User Type is required");
      return;
    }
    if (!form.username.trim()) {
      toast.error("Username is required");
      return;
    }
    const emailError = userSetupEmailError(form.email);
    if (emailError) {
      toast.error(emailError);
      return;
    }
    const extraError = additionalEmailError(form.additionalEmails);
    if (extraError) {
      toast.error(extraError);
      return;
    }
    if (form.defaultApplicationId && !form.applicationIds.includes(form.defaultApplicationId)) {
      toast.error("Default Application must be one of the selected Applications");
      return;
    }
    const passwordError = userSetupPasswordError(form.password, form.confirmPassword, form.username, !editingId);
    if (passwordError) {
      toast.error(passwordError);
      return;
    }
    const input: UserSetupSaveInput = {
      id: editingId,
      userGroupId: form.userGroupId,
      userType: form.userType,
      username: form.username.trim(),
      originId: form.originId,
      serviceCenterId: form.serviceCenterId,
      password: form.password,
      confirmPassword: form.confirmPassword,
      customerId: form.customerId,
      staffGroup: form.staffGroup,
      companyId: form.companyId,
      birthDate: form.birthDate,
      joiningDate: form.joiningDate,
      email: form.email.trim(),
      mobile: form.mobile.trim(),
      status: form.status,
      applicationType: form.applicationType,
      backdatingModules: form.backdatingModules,
      applicationIds: form.applicationIds,
      defaultApplicationId: form.defaultApplicationId,
      additionalEmails: form.additionalEmails.trim(),
      vendorId: form.vendorId,
      addEntryOnManifest: form.addEntryOnManifest,
      allowLoginWithOtp: form.allowLoginWithOtp,
      globalManifest: form.globalManifest,
      allowChangingAwbNo: form.allowChangingAwbNo,
      mobileAppLens: form.mobileAppLens,
      manifestBranch: form.manifestBranch,
      weightType: form.weightType,
    };
    setSaving(true);
    try {
      await saveUser(input);
      toast.success(editingId ? "User updated" : "User created");
      await queryClient.invalidateQueries({ queryKey: ["user-setup"] });
      await queryClient.invalidateQueries({ queryKey: ["user-setup-count"] });
      await queryClient.invalidateQueries({ queryKey: ["user-setup-summary"] });
      setEditingId(null);
      setForm(emptyForm());
      setScreen("list");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the user");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteUser(id);
      toast.success("User deleted");
      await queryClient.invalidateQueries({ queryKey: ["user-setup"] });
      await queryClient.invalidateQueries({ queryKey: ["user-setup-count"] });
      await queryClient.invalidateQueries({ queryKey: ["user-setup-summary"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the user");
    }
  };

  const removeGroup = async (id: string) => {
    const group = (groupsQuery.data ?? []).find((row) => row.id === id);
    if (group?.is_system) {
      toast.error("This group cannot be deleted");
      return;
    }
    try {
      await archiveGroup(id);
      toast.success("Group deleted");
      await queryClient.invalidateQueries({ queryKey: ["user-setup-groups"] });
      await queryClient.invalidateQueries({ queryKey: ["user-setup-options"] });
      await queryClient.invalidateQueries({ queryKey: ["user-setup-summary"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the group");
    }
  };

  if (authLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading users…</p>;
  }
  if (!canList) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">User Setup</h1>
        <p className="mt-2 text-sm text-muted-foreground">You do not have permission to open User Setup.</p>
      </div>
    );
  }


  const rows = listQuery.data ?? [];
  const failed = tab === "user" ? (listQuery.isError || countQuery.isError) : groupsQuery.isError;
  const loading = tab === "user" ? (listQuery.isLoading || countQuery.isLoading) : groupsQuery.isLoading;
  const summary = summaryQuery.data ?? { portal: 0, mobile: 0, both: 0, total: 0, groups: 0 };
  const groupRows = (groupsQuery.data ?? []).filter((group) => {
    const statusLabel = group.status === "ACTIVE" ? "Active" : "In-Active";
    const checks: Array<[string, string]> = [
      [columnFilters.type, "Group"],
      [columnFilters.name, group.name],
      [columnFilters.group, ""],
      [columnFilters.company, ""],
      [columnFilters.application, ""],
      [columnFilters.serviceCenter, ""],
      [columnFilters.status, statusLabel],
    ];
    const searchOk = !search.trim() || group.name.toLowerCase().includes(search.trim().toLowerCase());
    return searchOk && checks.every(([needle, value]) => !needle.trim() || value.toLowerCase().includes(needle.trim().toLowerCase()));
  }).sort((left, right) => {
    const direction = sort.dir === "asc" ? 1 : -1;
    const valueOf = (group: { name: string; status: string }) => {
      if (sort.key === "status") return group.status === "ACTIVE" ? "Active" : "In-Active";
      if (sort.key === "name") return group.name;
      if (sort.key === "type") return "Group";
      return "";
    };
    return valueOf(left).localeCompare(valueOf(right)) * direction;
  });
  const directoryRows = tab === "group" ? groupRows : rows;
  const directoryTotal = tab === "group" ? groupRows.length : total;
  const totalPages = Math.max(1, Math.ceil(directoryTotal / PAGE_SIZE));
  const pagedGroups = groupRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const errorMessage = listQuery.error instanceof Error
    ? listQuery.error.message
    : countQuery.error instanceof Error
      ? countQuery.error.message
      : summaryQuery.error instanceof Error
        ? summaryQuery.error.message
        : groupsQuery.error instanceof Error
          ? groupsQuery.error.message
          : "Could not load users";

  const groups = optionsQuery.data?.userGroups ?? [];
  const dateLabel = form.backdatingModules.length ? form.backdatingModules.join(", ") : "Select Type";
  const setFilter = (key: keyof typeof columnFilters, value: string) => {
    setColumnFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };
  const toggleSort = (key: string) => {
    setSort((current) => current.key === key
      ? { key, dir: current.dir === "asc" ? "desc" : "asc" }
      : { key, dir: "asc" });
    setPage(1);
  };

  return (
    <div className="flex min-w-0 flex-col gap-4 bg-slate-50 p-4 md:p-6">
      {screen === "form" ? (
      <>
      <div className="inline-flex w-fit rounded-full bg-slate-800 px-4 py-1.5 text-sm font-medium text-white">User Setup</div>
      <Card className="rounded-xl border-slate-200 p-4 shadow-sm md:p-5">
        <div className="mb-4 flex gap-2">
          <TabButton active={tab === "user"} onClick={() => setTab("user")}>User</TabButton>
          <TabButton active={tab === "group"} onClick={() => setTab("group")}>Group</TabButton>
        </div>
        {tab === "group" ? (
          <div>
            <Field label="Groupname">
              <Input aria-label="Groupname" value={groupName} onChange={(event) => setGroupName(event.target.value)} className="h-9 max-w-xs border-slate-200" />
            </Field>
            <ActionButtons saving={saving} onCancel={cancel} onSave={() => void saveGroup()} saveDisabled={saving || (editingGroupId ? !canModify : !canAdd)} />
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2 xl:grid-cols-4">
              <Field label="User Type">
                <Select value={form.userType || "unset"} onValueChange={(value) => setForm({ ...form, userType: value === "unset" ? "" : value })}>
                  <SelectTrigger aria-label="User Type" className="h-9 border-slate-200"><SelectValue placeholder="Select Type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unset">Select Type</SelectItem>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                    <SelectItem value="STAFF">User</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Text label="Username" value={form.username} onChange={(username) => setForm({ ...form, username })} />
              <Field label="Origin">
                <LookupCombobox lookupKey="destination" value={form.originId} valueLabel={form.originLabel} placeholder="Select Origin" className="h-9 border-slate-200 shadow-sm" onChange={(id, item) => setForm({ ...form, originId: id, originLabel: item?.name ?? "" })} />
              </Field>
              <Field label="Service Center">
                <LookupCombobox lookupKey="service-center" value={form.serviceCenterId} valueLabel={form.serviceCenterLabel} placeholder=" " className="h-9 border-slate-200 shadow-sm" onChange={(id, item) => setForm({ ...form, serviceCenterId: id, serviceCenterLabel: item ? [item.code, item.name].filter(Boolean).join(" — ") : "" })} />
              </Field>
              <Text label="Password" type="password" value={form.password} onChange={(password) => setForm({ ...form, password })} />
              <Text label="Confirm Password" type="password" value={form.confirmPassword} onChange={(confirmPassword) => setForm({ ...form, confirmPassword })} />
              <Field label="Customer">
                <LookupCombobox lookupKey="customer" value={form.customerId} valueLabel={form.customerLabel} placeholder="Select Customer" className="h-9 border-slate-200 shadow-sm" onChange={(id, item) => setForm({ ...form, customerId: id, customerLabel: item?.name ?? "" })} />
              </Field>
              <Field label="Group">
                <Select value={form.userGroupId || "unset"} onValueChange={(value) => {
                  const group = groups.find((row) => row.id === value);
                  setForm({ ...form, userGroupId: value === "unset" ? "" : value, userGroupLabel: group?.name ?? "" });
                }}>
                  <SelectTrigger aria-label="Group" className="h-9 border-slate-200"><SelectValue placeholder="Select Group" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unset">Select Group</SelectItem>
                    {groups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Text label="Birth Date" type="date" value={form.birthDate} onChange={(birthDate) => setForm({ ...form, birthDate })} />
              <Text label="Joining Date" type="date" value={form.joiningDate} onChange={(joiningDate) => setForm({ ...form, joiningDate })} />
              <Text label="Email ID" type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} />
              <Text label="Mobile No." value={form.mobile} onChange={(mobile) => setForm({ ...form, mobile })} />
              <Field label="Status">
                <Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value === "INACTIVE" ? "INACTIVE" : "ACTIVE" })}>
                  <SelectTrigger aria-label="Status" className="h-9 border-slate-200"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="INACTIVE">In-Active</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Application Type">
                <Select value={form.applicationType || "unset"} onValueChange={(value) => setForm({ ...form, applicationType: value === "unset" ? "" : value })}>
                  <SelectTrigger aria-label="Application Type" className="h-9 border-slate-200"><SelectValue placeholder="Select Type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unset">Select Type</SelectItem>
                    <SelectItem value="ALL">All</SelectItem>
                    <SelectItem value="MOBILE">Mobile</SelectItem>
                    <SelectItem value="PORTAL">Portal</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Allow Changing Date">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" className="h-9 w-full justify-between border-slate-200 px-3 font-normal shadow-sm">
                      <span className={form.backdatingModules.length ? "truncate" : "text-muted-foreground"}>{dateLabel}</span>
                      <span className="text-slate-400">▾</span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-1" align="start">
                    {ALLOW_CHANGING_DATE_MODULES.map((module) => {
                      const checked = form.backdatingModules.includes(module);
                      return (
                        <label key={module} className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50">
                          <span>{module}</span>
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={checked}
                            onChange={(event) => {
                              const backdatingModules = event.target.checked
                                ? [...form.backdatingModules, module]
                                : form.backdatingModules.filter((item) => item !== module);
                              setForm({ ...form, backdatingModules });
                            }}
                          />
                          <Tick checked={checked} />
                        </label>
                      );
                    })}
                  </PopoverContent>
                </Popover>
              </Field>
              <Check label="Add Entry on Manifest" checked={form.addEntryOnManifest} onChange={(addEntryOnManifest) => setForm({ ...form, addEntryOnManifest })} />
              <Check label="Allow Login With OTP" checked={form.allowLoginWithOtp} onChange={(allowLoginWithOtp) => setForm({ ...form, allowLoginWithOtp })} />
              <Check label="Global Manifest" checked={form.globalManifest} onChange={(globalManifest) => setForm({ ...form, globalManifest })} />
              <Check label="Allow changing AWB No." checked={form.allowChangingAwbNo} onChange={(allowChangingAwbNo) => setForm({ ...form, allowChangingAwbNo })} />
              <Check label="Mobile App Lens" checked={form.mobileAppLens} onChange={(mobileAppLens) => setForm({ ...form, mobileAppLens })} />
              <Choice
                label="Manifest Branch"
                value={form.manifestBranch ? "yes" : "no"}
                options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]}
                onChange={(value) => setForm({ ...form, manifestBranch: value === "yes" })}
              />
              <Choice
                label="Weight Type"
                value={form.weightType}
                options={[{ value: "KG", label: "Kgs" }, { value: "LB", label: "Lbs" }]}
                onChange={(value) => setForm({ ...form, weightType: value === "LB" ? "LB" : "KG" })}
              />
            </div>
            <ActionButtons saving={saving} onCancel={cancel} onSave={() => void save()} saveDisabled={saving || (editingId ? !canModify : !canAdd)} />
          </div>
        )}
      </Card>
      {tab === "user" ? (
        <div className="rounded-md border border-amber-100 bg-[#fbf6df] px-4 py-3 text-sm text-slate-700">
          <p className="font-medium text-slate-800">Note</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {USER_SETUP_PASSWORD_RULES.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </div>
      ) : null}
      </>
      ) : (
      <Card className="overflow-hidden rounded-xl border-slate-200 shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b px-3 py-3">
          <FileText className="h-5 w-5 text-slate-500" aria-hidden />
          <div className="flex gap-2">
            <TabButton active={tab === "user"} onClick={() => { setTab("user"); setPage(1); }}>User</TabButton>
            <TabButton active={tab === "group"} onClick={() => { setTab("group"); setPage(1); }}>Group</TabButton>
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-center gap-2 overflow-x-auto">
            <CountChip icon={<Monitor className="h-3.5 w-3.5" />} label="Portal Users" count={summary.portal} tone="red" active={tab === "user" && channel === "PORTAL"} onClick={() => { setTab("user"); setChannel(channel === "PORTAL" ? "" : "PORTAL"); setPage(1); }} />
            <CountChip icon={<Smartphone className="h-3.5 w-3.5" />} label="Mobile Users" count={summary.mobile} tone="red" active={tab === "user" && channel === "MOBILE"} onClick={() => { setTab("user"); setChannel(channel === "MOBILE" ? "" : "MOBILE"); setPage(1); }} />
            <CountChip icon={<Globe className="h-3.5 w-3.5" />} label="Mob & Web" count={summary.both} tone="blue" active={tab === "user" && channel === "ALL"} onClick={() => { setTab("user"); setChannel(channel === "ALL" ? "" : "ALL"); setPage(1); }} />
            <CountChip icon={<Users className="h-3.5 w-3.5" />} label="Total" count={summary.total} tone="blue" active={tab === "user" && channel === ""} onClick={() => { setTab("user"); setChannel(""); setPage(1); }} />
            <CountChip icon={<Users className="h-3.5 w-3.5" />} label="Group" count={summary.groups} tone="blue" active={tab === "group"} onClick={() => { setTab("group"); setPage(1); }} />
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(1); }}
              className="h-9 w-44 border-slate-200"
              aria-label="Search"
              placeholder="Search:"
            />
            {canAdd ? (
              <Button type="button" variant="outline" size="icon" className="h-9 w-9 border-slate-300" aria-label="Add" onClick={openCreate}>
                <Plus className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </div>
        {loading ? (
          <p className="p-6 text-sm text-muted-foreground">{tab === "group" ? "Loading groups…" : "Loading users…"}</p>
        ) : failed ? (
          <div className="flex flex-col gap-3 p-6">
            <p className="text-sm">{errorMessage}</p>
            <Button type="button" variant="outline" className="w-fit" onClick={() => { void listQuery.refetch(); void countQuery.refetch(); void summaryQuery.refetch(); }}>
              Try again
            </Button>
          </div>
        ) : directoryRows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">{tab === "group" ? "No groups match this search." : "No users match this search."}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-0 hover:bg-[#1e3a5f]">
                {DIRECTORY_COLUMNS.map((column) => (
                  <TableHead key={column.key} className="bg-[#1e3a5f] text-white">
                    <button type="button" className="inline-flex items-center gap-1 font-medium" onClick={() => toggleSort(column.key)}>
                      {column.label}
                      <span aria-hidden className="text-[10px] opacity-80">{sort.key === column.key && sort.dir === "desc" ? "▼" : "▲"}</span>
                    </button>
                  </TableHead>
                ))}
                <TableHead className="bg-[#1e3a5f] text-white">Action</TableHead>
              </TableRow>
              <TableRow className="hover:bg-white">
                {DIRECTORY_COLUMNS.map((column) => (
                  <TableHead key={column.key} className="bg-white py-2">
                    <Input
                      value={columnFilters[column.filter]}
                      onChange={(event) => setFilter(column.filter, event.target.value)}
                      aria-label={column.label}
                      placeholder={column.label}
                      className="h-8 border-slate-200 text-xs font-normal"
                    />
                  </TableHead>
                ))}
                <TableHead className="bg-white" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tab === "group"
                ? pagedGroups.map((group) => (
                  <TableRow key={group.id} className="odd:bg-slate-50">
                    <TableCell>Group</TableCell>
                    <TableCell>{group.name}</TableCell>
                    <TableCell />
                    <TableCell />
                    <TableCell />
                    <TableCell />
                    <TableCell>{group.status === "ACTIVE" ? "Active" : "In-Active"}</TableCell>
                    <TableCell>
                      <RowActions
                        canModify={canModify}
                        canDelete={canDelete && !group.is_system}
                        onEdit={() => openGroupEdit(group.id, group.name)}
                        onDelete={() => { setConfirmKind("group"); setConfirmId(group.id); }}
                      />
                    </TableCell>
                  </TableRow>
                ))
                : rows.map((row) => (
                  <TableRow key={row.id} className="odd:bg-slate-50">
                    <TableCell>User</TableCell>
                    <TableCell>{row.username}</TableCell>
                    <TableCell>{row.group_name || ""}</TableCell>
                    <TableCell>{row.company_code || ""}</TableCell>
                    <TableCell>{applicationLabel(row.application_type)}</TableCell>
                    <TableCell>{row.service_center || ""}</TableCell>
                    <TableCell>{row.status === "ACTIVE" ? "Active" : "In-Active"}</TableCell>
                    <TableCell>
                      <RowActions
                        canModify={canModify}
                        canDelete={canDelete}
                        onEdit={() => void openEdit(row.id)}
                        onDelete={() => { setConfirmKind("user"); setConfirmId(row.id); }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        )}
        {!loading && !failed && directoryTotal > 0 ? (
          <TablePager
            totalPages={totalPages}
            currentPage={page}
            setPage={setPage}
            startIdx={(page - 1) * PAGE_SIZE + 1}
            endIdx={(page - 1) * PAGE_SIZE + (tab === "group" ? pagedGroups.length : rows.length)}
            total={directoryTotal}
          />
        ) : null}
      </Card>
      )}
      <AlertDialog open={Boolean(confirmId)} onOpenChange={(open) => !open && setConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmKind === "group" ? "Delete this group?" : "Delete this user?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmKind === "group"
                ? "The group is hidden. Users already in it stay as they are."
                : "The account is hidden and cannot sign in. The record is kept."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (!confirmId) return;
              if (confirmKind === "group") void removeGroup(confirmId);
              else void remove(confirmId);
              setConfirmId(null);
            }}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const DIRECTORY_COLUMNS = [
  { key: "type", label: "Type", filter: "type" },
  { key: "name", label: "Name", filter: "name" },
  { key: "group", label: "Group", filter: "group" },
  { key: "company", label: "Company", filter: "company" },
  { key: "application", label: "Application Type", filter: "application" },
  { key: "serviceCenter", label: "Service Center", filter: "serviceCenter" },
  { key: "status", label: "Status", filter: "status" },
] as const;

function applicationLabel(value: string | null | undefined): string {
  if (value === "PORTAL") return "Portal";
  if (value === "MOBILE") return "Mobile";
  if (value === "ALL") return "Mob & Web";
  return "";
}

function CountChip({ icon, label, count, tone, active, onClick }: {
  icon: React.ReactNode;
  label: string;
  count: number;
  tone: "red" | "blue";
  active: boolean;
  onClick: () => void;
}) {
  const color = tone === "red" ? "text-red-600" : "text-blue-700";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 text-xs shadow-sm transition-colors ${
        active ? "border-blue-600 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50"
      }`}
    >
      <span className={color}>{icon}</span>
      <span className="font-semibold text-slate-800">{label}</span>
      <span className={`font-bold ${color}`}>{count}</span>
    </button>
  );
}

function RowActions({ canModify, canDelete, onEdit, onDelete }: {
  canModify: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {canModify ? (
        <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-sky-600" aria-label="Edit" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
        </Button>
      ) : null}
      {canDelete ? (
        <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-red-600" aria-label="Delete" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-normal text-slate-600">{label}</span>
      {children}
    </div>
  );
}

function Text({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <Field label={label}>
      <Input aria-label={label} type={type} value={value} onChange={(event) => onChange(event.target.value)} className="h-9 border-slate-200" />
    </Field>
  );
}

function Tick({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={checked
        ? "grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[4px] border border-emerald-600 bg-emerald-600 text-white"
        : "grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[4px] border border-slate-300 bg-white"}
    >
      {checked ? <CheckIcon className="h-3 w-3" strokeWidth={3} /> : null}
    </span>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  const id = label.replace(/\s+/g, "-").toLowerCase();
  return (
    <label htmlFor={id} className="flex h-9 cursor-pointer items-center justify-between gap-3 self-end rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm">
      <span className="truncate">{label}</span>
      <input id={id} type="checkbox" className="sr-only" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <Tick checked={checked} />
    </label>
  );
}

function Choice({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col justify-end gap-1">
      <span className="text-xs text-slate-600">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex h-9 rounded-md border border-slate-200 bg-slate-100 p-0.5 shadow-sm">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(option.value)}
              className={active
                ? "flex-1 rounded-[5px] bg-emerald-600 text-sm font-medium text-white shadow-sm"
                : "flex-1 rounded-[5px] text-sm text-slate-600 hover:text-slate-900"}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={active
        ? "rounded-md bg-emerald-600 px-4 py-1 text-sm font-medium text-white"
        : "rounded-md border border-slate-200 bg-white px-4 py-1 text-sm text-slate-700"}
    >
      {children}
    </button>
  );
}

function ActionButtons({ saving, onCancel, onSave, saveDisabled }: { saving: boolean; onCancel: () => void; onSave: () => void; saveDisabled: boolean }) {
  return (
    <div className="mt-8 flex justify-end gap-3">
      <Button type="button" className="rounded-full bg-red-600 px-6 text-white hover:bg-red-700" onClick={onCancel}>Cancel</Button>
      <Button type="button" className="rounded-full bg-emerald-600 px-6 text-white hover:bg-emerald-700" onClick={onSave} disabled={saveDisabled}>
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Save
      </Button>
    </div>
  );
}
