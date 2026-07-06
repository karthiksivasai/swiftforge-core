import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FieldWrapper,
  IconButton,
  MasterBreadcrumb,
  PAGE_SIZE,
  TablePager,
  downloadCsv,
} from "@/components/master-table-kit";

type AuthStatus = "Authorized" | "Un-Authorized";

type ExpenseRow = {
  id: string;
  srno: number;
  tranDate: string;
  name: string;
  bankCash: string;
  description: string;
  amount: string;
  documentUrl: string;
  status: AuthStatus;
};

type ColFilterKey = "srno" | "tranDate" | "name" | "bankCash" | "description" | "amount";

const STATUS_OPTIONS: AuthStatus[] = ["Authorized", "Un-Authorized"];

const SEED_TEMPLATE: Omit<ExpenseRow, "id" | "srno" | "status">[] = [
  { tranDate: "30/05/2026", name: "OFFICE EXPENSES", bankCash: "Cash", description: "WF SANDEEP", amount: "173400.00", documentUrl: "" },
  { tranDate: "30/05/2026", name: "FOOD", bankCash: "Cash", description: "SNACKS", amount: "400.00", documentUrl: "" },
  { tranDate: "30/05/2026", name: "FOOD", bankCash: "Cash", description: "TEA", amount: "120.00", documentUrl: "" },
  { tranDate: "29/05/2026", name: "TRAVEL", bankCash: "Cash", description: "PETROL", amount: "2500.00", documentUrl: "" },
  { tranDate: "29/05/2026", name: "OFFICE EXPENSES", bankCash: "Cash", description: "BAGS", amount: "850.00", documentUrl: "" },
  { tranDate: "28/05/2026", name: "FOOD", bankCash: "Cash", description: "LUNCH", amount: "650.00", documentUrl: "" },
  { tranDate: "28/05/2026", name: "MAINTENANCE", bankCash: "Bank", description: "PRINTER REPAIR", amount: "3200.00", documentUrl: "" },
  { tranDate: "27/05/2026", name: "TRAVEL", bankCash: "Cash", description: "AUTO FARE", amount: "180.00", documentUrl: "" },
  { tranDate: "27/05/2026", name: "OFFICE EXPENSES", bankCash: "Cash", description: "STATIONERY", amount: "920.00", documentUrl: "" },
  { tranDate: "26/05/2026", name: "FOOD", bankCash: "Cash", description: "SNACKS", amount: "300.00", documentUrl: "" },
  { tranDate: "26/05/2026", name: "TRAVEL", bankCash: "Cash", description: "PETROL", amount: "1800.00", documentUrl: "" },
  { tranDate: "25/05/2026", name: "OFFICE EXPENSES", bankCash: "Bank", description: "COURIER CHARGES", amount: "5400.00", documentUrl: "" },
];

const buildSeedRows = (): ExpenseRow[] => {
  const rows: ExpenseRow[] = [];
  let srno = 31722;
  for (let batch = 0; batch < 12; batch += 1) {
    for (let i = 0; i < SEED_TEMPLATE.length; i += 1) {
      const template = SEED_TEMPLATE[i];
      rows.push({
        id: crypto.randomUUID(),
        srno: srno--,
        ...template,
        status: batch === 0 && i < 3 ? "Un-Authorized" : "Authorized",
      });
    }
  }
  return rows;
};

const emptyColFilters = (): Record<ColFilterKey, string> => ({
  srno: "",
  tranDate: "",
  name: "",
  bankCash: "",
  description: "",
  amount: "",
});

export const Route = createFileRoute("/transaction/receipt/expense-authorize")({
  head: () => ({
    meta: [
      { title: "Expense Authorize — Transaction — Courier ERP" },
      { name: "description", content: "Review and authorize expense transactions." },
    ],
  }),
  component: ExpenseAuthorizePage,
});

function ExpenseAuthorizePage() {
  const [rows, setRows] = useState<ExpenseRow[]>(buildSeedRows);
  const [statusFilter, setStatusFilter] = useState<AuthStatus>("Authorized");
  const [search, setSearch] = useState("");
  const [colFilters, setColFilters] = useState(emptyColFilters);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (row.status !== statusFilter) return false;
      if (q) {
        const hay = [
          String(row.srno),
          row.tranDate,
          row.name,
          row.bankCash,
          row.description,
          row.amount,
          row.status,
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const cf = colFilters;
      if (cf.srno && !String(row.srno).includes(cf.srno)) return false;
      if (cf.tranDate && !row.tranDate.includes(cf.tranDate)) return false;
      if (cf.name && !row.name.toLowerCase().includes(cf.name.toLowerCase())) return false;
      if (cf.bankCash && !row.bankCash.toLowerCase().includes(cf.bankCash.toLowerCase())) return false;
      if (cf.description && !row.description.toLowerCase().includes(cf.description.toLowerCase())) {
        return false;
      }
      if (cf.amount && !row.amount.includes(cf.amount)) return false;
      return true;
    });
  }, [rows, statusFilter, search, colFilters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const startIdx = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(currentPage * PAGE_SIZE, filtered.length);

  const handleExport = () => {
    downloadCsv(
      "expense-authorize.csv",
      ["Srno.", "Tran_Date", "Name", "Bank_Cash", "Description", "Amount", "Status"],
      filtered.map((row) => [
        String(row.srno),
        row.tranDate,
        row.name,
        row.bankCash,
        row.description,
        row.amount,
        row.status,
      ]),
    );
    toast.success("Exported expense-authorize.csv");
  };

  const handleRefresh = () => {
    setSearch("");
    setColFilters(emptyColFilters());
    setPage(1);
    toast.success("List refreshed");
  };

  const authorizeRow = (row: ExpenseRow) => {
    setRows((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, status: "Authorized" as const } : r)),
    );
    toast.success(`Expense ${row.srno} authorized`);
  };

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <MasterBreadcrumb trail={["Transaction", "Receipt / Expenses", "Expense Authorize"]} />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Expense Authorize</h1>
        <p className="text-sm text-muted-foreground">
          Review expense entries and authorize or track pending approvals.
        </p>
      </div>

      <Card className="min-w-0 overflow-hidden border p-4 md:p-6">
        <div className="mb-4 max-w-xs">
          <FieldWrapper label="Status">
            <Select
              value={statusFilter}
              onValueChange={(value) => {
                setStatusFilter(value as AuthStatus);
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldWrapper>
        </div>
      </Card>

      <Card className="min-w-0 overflow-hidden border p-0">
        <div className="flex flex-col gap-3 border-b bg-muted/30 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            <IconButton label="Export" onClick={handleExport}>
              <Download className="h-4 w-4" />
            </IconButton>
            <IconButton label="Refresh" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4" />
            </IconButton>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3 lg:justify-end">
            <span className="shrink-0 text-sm text-muted-foreground">Search:</span>
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="h-9 w-full min-w-[10rem] sm:w-48"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] caption-bottom text-sm">
            <TableHeader>
              <TableRow className="bg-sidebar hover:bg-sidebar">
                <TableHead className="whitespace-nowrap text-sidebar-foreground">Srno.</TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">Tran_Date</TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">Name</TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">Bank_Cash</TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">Description</TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">Amount</TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">View Document</TableHead>
                <TableHead className="whitespace-nowrap text-center text-sidebar-foreground">Action</TableHead>
              </TableRow>
              <TableRow className="bg-muted/20 hover:bg-muted/20">
                {(
                  [
                    ["srno", "Srno."],
                    ["tranDate", "Tran_Date"],
                    ["name", "Name"],
                    ["bankCash", "Bank_Cash"],
                    ["description", "Description"],
                    ["amount", "Amount"],
                  ] as const
                ).map(([key, placeholder]) => (
                  <TableHead key={key} className="py-2">
                    <Input
                      value={colFilters[key]}
                      onChange={(e) => {
                        setColFilters((f) => ({ ...f, [key]: e.target.value }));
                        setPage(1);
                      }}
                      placeholder={placeholder}
                      className="h-8"
                    />
                  </TableHead>
                ))}
                <TableHead />
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center text-sm text-muted-foreground">
                    No data available in table
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.srno}</TableCell>
                    <TableCell className="whitespace-nowrap">{row.tranDate}</TableCell>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{row.bankCash}</TableCell>
                    <TableCell>{row.description}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">{row.amount}</TableCell>
                    <TableCell>
                      {row.documentUrl ? (
                        <button
                          type="button"
                          className="text-sky-600 hover:underline dark:text-sky-400"
                          onClick={() => toast.info("Document viewer will be enabled with backend wiring")}
                        >
                          View
                        </button>
                      ) : (
                        ""
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {row.status === "Authorized" ? (
                        <span className="text-sm text-muted-foreground">Authorized</span>
                      ) : (
                        <Button
                          size="sm"
                          className="h-8 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
                          onClick={() => authorizeRow(row)}
                        >
                          Authorize
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </table>
        </div>

        <TablePager
          startIdx={startIdx}
          endIdx={endIdx}
          total={filtered.length}
          currentPage={currentPage}
          totalPages={totalPages}
          setPage={setPage}
        />
      </Card>
    </div>
  );
}
