import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LogOut, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/lib/auth";
import { forceLogoff, listActiveSessions } from "@/lib/rbac-data";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MasterBreadcrumb, PAGE_SIZE, TablePager } from "@/components/master-table-kit";

type LoggedInUserRow = {
  id: string;
  userName: string;
  loginDate: string;
  loginTime: string;
  userType: string;
  ipAddress: string;
};

const INITIAL_ROWS: LoggedInUserRow[] = [
  ["1", "MNR", "11/07/2026", "1013", "Customer Login", "106.201.167.67"],
  ["2", "VCS", "11/07/2026", "1052", "Customer Login", "110.235.236.88"],
  ["3", "RAJESH", "11/07/2026", "1102", "Customer Login", "49.205.121.80"],
  ["4", "AIRACOU", "11/07/2026", "1128", "Customer Login", "122.177.240.132"],
  ["5", "DECCAN", "11/07/2026", "1253", "Customer Login", "115.98.102.211"],
  ["6", "Uditta", "11/07/2026", "1314", "Customer Login", "106.205.31.153"],
  ["7", "admin", "11/07/2026", "1317", "Web Login", "124.123.163.56"],
  ["8", "SLPE", "11/07/2026", "1347", "Customer Login", "106.222.231.170"],
  ["9", "ANWAR", "11/07/2026", "1403", "Customer Login", "106.200.57.118"],
  ["10", "SHIVSAI", "11/07/2026", "1412", "Customer Login", "49.43.232.111"],
  ["11", "BS", "11/07/2026", "1424", "Web Login", "106.201.145.88"],
  ["12", "OPERATION", "11/07/2026", "1435", "Web Login", "110.235.240.11"],
].map(([id, userName, loginDate, loginTime, userType, ipAddress]) => ({
  id,
  userName,
  loginDate,
  loginTime,
  userType,
  ipAddress,
}));

export const Route = createFileRoute("/utility/users/loggedin-users")({
  head: () => ({
    meta: [
      { title: "Loggedin Users — Utility — Courier ERP" },
      { name: "description", content: "View and log off currently logged-in users." },
    ],
  }),
  component: LoggedInUsersPage,
});

function LoggedInUsersPage() {
  const { isAuthenticated } = useAuth();
  const [rows, setRows] = useState<LoggedInUserRow[]>(INITIAL_ROWS);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const loadLive = useCallback(async () => {
    const sessions = await listActiveSessions();
    setRows(
      sessions.map((s) => {
        const dt = new Date(s.created_at);
        return {
          id: s.id,
          userName: s.username,
          loginDate: dt.toLocaleDateString(),
          loginTime: dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          userType: s.app === "MOBILE" ? "Mobile Login" : "Web Login",
          ipAddress: s.ip_address ?? "—",
        };
      }),
    );
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    loadLive().catch((error) => {
      const message = error instanceof Error ? error.message : "Could not load sessions";
      toast.error(message);
    });
  }, [isAuthenticated, loadLive]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [row.userName, row.loginDate, row.loginTime, row.userType, row.ipAddress].some((value) =>
        value.toLowerCase().includes(q),
      ),
    );
  }, [rows, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const startIdx = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(currentPage * PAGE_SIZE, filtered.length);

  const logOff = async (row: LoggedInUserRow) => {
    if (isAuthenticated) {
      try {
        await forceLogoff(row.id);
        await loadLive();
        toast.success(`${row.userName} logged off`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Force logoff failed";
        toast.error(message);
      }
      return;
    }
    setRows((current) => current.filter((item) => item.id !== row.id));
    toast.success(`${row.userName} logged off`);
  };

  const refresh = () => {
    setSearch("");
    setPage(1);
    if (isAuthenticated) {
      loadLive()
        .then(() => toast.success("Loggedin users refreshed"))
        .catch(() => toast.error("Refresh failed"));
      return;
    }
    toast.success("Loggedin users refreshed");
  };

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <MasterBreadcrumb trail={["Utility", "Users", "Loggedin Users"]} />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Loggedin Users</h1>
        <p className="text-sm text-muted-foreground">
          Monitor active sessions and force log off users when needed.
        </p>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 bg-background"
            onClick={refresh}
            aria-label="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>

          <label className="flex flex-col gap-1 text-xs text-foreground">
            Search:
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                className="h-9 w-56 pl-8"
              />
            </div>
          </label>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-sidebar hover:bg-sidebar">
                {["User Name", "Login Date", "Login Time", "User Type", "IP Address", "Action"].map(
                  (heading) => (
                    <TableHead key={heading} className="whitespace-nowrap text-sidebar-foreground">
                      <span className="flex items-center justify-between gap-2">
                        {heading}
                        {heading !== "Action" ? <span className="text-xs">⇅</span> : null}
                      </span>
                    </TableHead>
                  ),
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((row) => (
                <TableRow key={row.id} className="odd:bg-muted/50">
                  <TableCell>{row.userName}</TableCell>
                  <TableCell>{row.loginDate}</TableCell>
                  <TableCell>{row.loginTime}</TableCell>
                  <TableCell>{row.userType}</TableCell>
                  <TableCell>{row.ipAddress}</TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void logOff(row)}
                      className="h-7 rounded-md bg-slate-600 px-4 text-xs text-white hover:bg-slate-700"
                    >
                      <LogOut className="mr-1.5 h-3.5 w-3.5" />
                      Log Off
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <TablePager
          totalPages={totalPages}
          currentPage={currentPage}
          setPage={setPage}
          startIdx={startIdx}
          endIdx={endIdx}
          total={filtered.length}
        />
      </Card>
    </div>
  );
}
