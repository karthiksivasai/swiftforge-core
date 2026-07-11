import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { IconButton, MasterBreadcrumb } from "@/components/master-table-kit";

type NotificationRow = {
  id: string;
  date: string;
  time: string;
  type: string;
  notification: string;
  userId: string;
};

type NotificationForm = Omit<NotificationRow, "id" | "userId">;

const INITIAL_ROWS: NotificationRow[] = [
  {
    id: "1",
    date: "02/08/2023",
    time: "120",
    type: "Customer",
    notification: "WELCOME TO COURIERWALA EXPRESS",
    userId: "admin",
  },
];

const emptyForm = (): NotificationForm => ({
  date: new Date().toISOString().slice(0, 10),
  time: new Date().toTimeString().slice(0, 5),
  type: "Customer",
  notification: "",
});

const formatInputDate = (value: string) => {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
};

export const Route = createFileRoute("/utility/notification")({
  head: () => ({
    meta: [
      { title: "Notification — Utility — Courier ERP" },
      { name: "description", content: "Manage user notifications in the courier ERP utility module." },
    ],
  }),
  component: NotificationPage,
});

function NotificationPage() {
  const [rows, setRows] = useState<NotificationRow[]>(INITIAL_ROWS);
  const [mode, setMode] = useState<"list" | "form">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<NotificationForm>(emptyForm());
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({
    date: "",
    time: "",
    type: "",
    notification: "",
    userId: "",
  });

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const values = [row.date, row.time, row.type, row.notification, row.userId];
      if (q && !values.some((value) => value.toLowerCase().includes(q))) return false;
      if (filters.date && !row.date.toLowerCase().includes(filters.date.toLowerCase())) return false;
      if (filters.time && !row.time.toLowerCase().includes(filters.time.toLowerCase())) return false;
      if (filters.type && !row.type.toLowerCase().includes(filters.type.toLowerCase())) return false;
      if (filters.notification && !row.notification.toLowerCase().includes(filters.notification.toLowerCase())) return false;
      if (filters.userId && !row.userId.toLowerCase().includes(filters.userId.toLowerCase())) return false;
      return true;
    });
  }, [rows, search, filters]);

  const deleteRow = (id: string) => {
    setRows((current) => current.filter((row) => row.id !== id));
    toast.success("Notification deleted");
  };

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm());
    setMode("form");
  };

  const openEdit = (row: NotificationRow) => {
    const [day, month, year] = row.date.split("/");
    setEditingId(row.id);
    setForm({
      date: year && month && day ? `${year}-${month}-${day}` : row.date,
      time: row.time,
      type: row.type,
      notification: row.notification,
    });
    setMode("form");
  };

  const saveNotification = () => {
    if (!form.date.trim()) return toast.error("Date is required");
    if (!form.time.trim()) return toast.error("Time is required");
    if (!form.notification.trim()) return toast.error("Notification is required");

    const payload: NotificationRow = {
      id: editingId ?? crypto.randomUUID(),
      date: formatInputDate(form.date),
      time: form.time,
      type: form.type,
      notification: form.notification.trim(),
      userId: "admin",
    };

    setRows((current) =>
      editingId
        ? current.map((row) => (row.id === editingId ? payload : row))
        : [payload, ...current],
    );
    toast.success(editingId ? "Notification updated" : "Notification saved");
    setMode("list");
  };

  if (mode === "form") {
    return (
      <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
        <MasterBreadcrumb trail={["Utility", "Notification"]} />

        <Card className="relative min-w-0 border p-4 pt-6 md:p-6 md:pt-7">
          <span className="absolute -top-3 left-4 rounded-full bg-sidebar px-4 py-1 text-xs font-semibold text-sidebar-foreground shadow">
            User Notification
          </span>

          <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_1.35fr_auto] md:items-end">
            <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
              Date <span className="sr-only">required</span>
              <Input
                type="date"
                value={form.date}
                onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
                className="h-9"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
              Time
              <Input
                type="time"
                value={form.time}
                onChange={(event) => setForm((current) => ({ ...current, time: event.target.value }))}
                className="h-9"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
              Type *
              <Select value={form.type} onValueChange={(value) => setForm((current) => ({ ...current, type: value }))}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Customer">Customer</SelectItem>
                  <SelectItem value="User">User</SelectItem>
                </SelectContent>
              </Select>
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
              Notification *
              <Textarea
                value={form.notification}
                onChange={(event) => setForm((current) => ({ ...current, notification: event.target.value }))}
                className="min-h-9 resize-none py-2"
              />
            </label>

            <div className="flex justify-end gap-2 pb-0.5">
              <Button
                type="button"
                onClick={saveNotification}
                className="h-8 rounded-full bg-green-500 px-6 text-white hover:bg-green-600"
              >
                Save
              </Button>
              <Button
                type="button"
                onClick={() => setMode("list")}
                className="h-8 rounded-full bg-red-500 px-6 text-white hover:bg-red-600"
              >
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <MasterBreadcrumb trail={["Utility", "Notification"]} />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">User Notification</h1>
        <p className="text-sm text-muted-foreground">
          Manage notification messages for customer and branch users.
        </p>
      </div>

      <Card className="min-w-0 overflow-hidden border p-4 md:p-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => toast.success("Export queued")}
            aria-label="Export notifications"
          >
            <Download className="h-4 w-4" />
          </Button>

          <div className="flex items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-foreground">
              Search:
              <Input value={search} onChange={(event) => setSearch(event.target.value)} className="h-8 w-48" />
            </label>
            <Button
              size="sm"
              className="h-9 gap-1.5"
              onClick={openAdd}
            >
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="bg-sidebar hover:bg-sidebar">
              {["Date", "Time", "Type", "Notification", "UserID", "Action"].map((heading) => (
                <TableHead key={heading} className="text-sidebar-foreground">
                  <span className="flex items-center justify-between gap-2">
                    {heading}
                    {heading !== "Action" ? <span className="text-xs">⇅</span> : null}
                  </span>
                </TableHead>
              ))}
            </TableRow>
            <TableRow className="hover:bg-transparent">
              <TableHead>
                <Input
                  value={filters.date}
                  onChange={(event) => setFilters((current) => ({ ...current, date: event.target.value }))}
                  placeholder="Date"
                  className="h-8"
                />
              </TableHead>
              <TableHead>
                <Input
                  value={filters.time}
                  onChange={(event) => setFilters((current) => ({ ...current, time: event.target.value }))}
                  placeholder="Time"
                  className="h-8"
                />
              </TableHead>
              <TableHead>
                <Input
                  value={filters.type}
                  onChange={(event) => setFilters((current) => ({ ...current, type: event.target.value }))}
                  placeholder="Type"
                  className="h-8"
                />
              </TableHead>
              <TableHead>
                <Input
                  value={filters.notification}
                  onChange={(event) => setFilters((current) => ({ ...current, notification: event.target.value }))}
                  placeholder="Notification"
                  className="h-8"
                />
              </TableHead>
              <TableHead>
                <Input
                  value={filters.userId}
                  onChange={(event) => setFilters((current) => ({ ...current, userId: event.target.value }))}
                  placeholder="UserID"
                  className="h-8"
                />
              </TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.map((row) => (
              <TableRow key={row.id} className="odd:bg-muted/50">
                <TableCell>{row.date}</TableCell>
                <TableCell>{row.time}</TableCell>
                <TableCell>{row.type}</TableCell>
                <TableCell>{row.notification}</TableCell>
                <TableCell>{row.userId}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <IconButton label="Edit" size="row" variant="ghost" onClick={() => openEdit(row)}>
                      <Pencil className="h-4 w-4" />
                    </IconButton>
                    <IconButton label="Delete" size="row" variant="ghost" onClick={() => deleteRow(row.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </IconButton>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="mt-4 flex flex-col gap-3 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
          <span>
            Showing {filteredRows.length ? 1 : 0} to {filteredRows.length} of {filteredRows.length} entries
          </span>
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground">
              &lt;&lt;
            </Button>
            <Button variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground">
              &lt;
            </Button>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar text-sidebar-foreground">
              1
            </span>
            <Button variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground">
              &gt;
            </Button>
            <Button variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground">
              &gt;&gt;
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
