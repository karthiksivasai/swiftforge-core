import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ----------------------------------------------------------------------------
// Custom Components
// ----------------------------------------------------------------------------

interface LookupInputProps {
  value: string;
  onChange: (val: string) => void;
  onSearchClick: () => void;
  placeholder?: string;
  label?: string;
  secondaryValue?: string;
  onSecondaryChange?: (val: string) => void;
  secondaryPlaceholder?: string;
}

function LookupInput({
  value,
  onChange,
  onSearchClick,
  placeholder,
  label,
  secondaryValue,
  onSecondaryChange,
  secondaryPlaceholder,
}: LookupInputProps) {
  return (
    <div className="flex flex-col space-y-1.5">
      {label && <Label className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">{label}</Label>}
      <div className="flex relative">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn("h-9 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500", secondaryValue !== undefined ? "rounded-r-none border-r-0" : "rounded-r-none")}
        />
        {secondaryValue !== undefined && (
          <Input
            value={secondaryValue}
            onChange={(e) => onSecondaryChange?.(e.target.value)}
            placeholder={secondaryPlaceholder}
            className="h-9 rounded-none bg-white border-r-0 focus-visible:z-20 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        )}
        <Button
          type="button"
          size="icon"
          onClick={onSearchClick}
          tabIndex={0}
          className="h-9 w-9 rounded-l-none shrink-0 bg-slate-900 hover:bg-slate-800 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 "
        >
          <Search className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function PillToggleGroup({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (val: string) => void;
  options: string[];
}) {
  return (
    <div className="flex p-0.5 bg-muted rounded-full w-fit">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange(opt); } }}
          className={cn(
            "px-4 py-1.5 rounded-full text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus-visible:ring-offset-2",
            value === opt
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function SearchModal({
  open,
  onOpenChange,
  title,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  onSelect: (item: { code: string; name: string }) => void;
}) {
  const [query, setQuery] = useState("");
  // Mock Data
  const mockData = useMemo(() => {
    return Array.from({ length: 20 }).map((_, i) => ({
      code: `CODE-${i + 100}`,
      name: `Mock Entity ${i + 1}`,
    })).filter((item) => 
      item.name.toLowerCase().includes(query.toLowerCase()) || 
      item.code.toLowerCase().includes(query.toLowerCase())
    );
  }, [query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="border rounded-md overflow-hidden">
            <div className="max-h-[300px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Code</th>
                    <th className="text-left px-3 py-2 font-medium">Name</th>
                    <th className="text-right px-3 py-2 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {mockData.map((item) => (
                    <tr key={item.code} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="px-3 py-2 font-mono text-xs">{item.code}</td>
                      <td className="px-3 py-2">{item.name}</td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          onClick={() => {
                            onSelect(item);
                            onOpenChange(false);
                          }}
                        >
                          Select
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {mockData.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-3 py-8 text-center text-muted-foreground">
                        No results found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="bg-muted p-2 flex items-center justify-between border-t text-xs text-muted-foreground">
              <span>Showing {mockData.length} results</span>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-6 w-6"><ChevronLeft className="h-3 w-3" /></Button>
                <Button variant="outline" size="icon" className="h-6 w-6"><ChevronRight className="h-3 w-3" /></Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Mock customer data for the Data Grid
const MOCK_CUSTOMERS = [
  { id: 1, code: "CUST-001", name: "Acme Corp", awbCount: 15, totalAmount: 12500.5, igst: 2250.09, cgst: 0, sgst: 0, grandTotal: 14750.59 },
  { id: 2, code: "CUST-002", name: "Stark Industries", awbCount: 8, totalAmount: 8500, igst: 0, cgst: 765, sgst: 765, grandTotal: 10030 },
  { id: 3, code: "CUST-003", name: "Wayne Enterprises", awbCount: 0, totalAmount: 0, igst: 0, cgst: 0, sgst: 0, grandTotal: 0 },
  { id: 4, code: "CUST-004", name: "Cyberdyne Systems", awbCount: 42, totalAmount: 45000.75, igst: 8100.135, cgst: 0, sgst: 0, grandTotal: 53100.885 },
  { id: 5, code: "CUST-005", name: "Tyrell Corporation", awbCount: 3, totalAmount: 1500, igst: 0, cgst: 135, sgst: 135, grandTotal: 1770 },
];

const getCustomerOutstandingBalance = async (customerId: string): Promise<number> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      switch (customerId) {
        case "CUST-001":
          resolve(1240835.59);
          break;
        case "CUST-002":
          resolve(45210.00);
          break;
        case "CUST-003":
          resolve(0.00);
          break;
        case "CUST-004":
          resolve(892140.25);
          break;
        default:
          resolve(0.00);
      }
    }, 600); // 600ms artificial delay for loading state
  });
};

function CustomerDataTable({
  customers,
  selectedCustomers,
  onToggleCustomer,
  onSelectAll,
}: {
  customers: typeof MOCK_CUSTOMERS;
  selectedCustomers: Set<number>;
  onToggleCustomer: (id: number) => void;
  onSelectAll: (checked: boolean) => void;
}) {
  const validCustomers = customers.filter(c => c.awbCount > 0);
  const allSelected = validCustomers.length > 0 && selectedCustomers.size === validCustomers.length;

  return (
    <div className="border rounded-md overflow-hidden bg-white mt-6 shadow-sm">
      <table className="w-full text-sm whitespace-nowrap">
        <thead className="bg-slate-900 text-white text-xs uppercase font-semibold">
          <tr>
            <th className="px-4 py-3 text-left w-12">
              <Checkbox 
                checked={allSelected}
                onCheckedChange={(c) => onSelectAll(c === true)}
                className="rounded-[2px] border-white data-[state=checked]:bg-white data-[state=checked]:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
              />
            </th>
            <th className="px-4 py-3 text-left">Code</th>
            <th className="px-4 py-3 text-left">Name</th>
            <th className="px-4 py-3 text-right">AWB Count</th>
            <th className="px-4 py-3 text-right">Total Amount</th>
            <th className="px-4 py-3 text-right">IGST</th>
            <th className="px-4 py-3 text-right">CGST</th>
            <th className="px-4 py-3 text-right">SGST</th>
            <th className="px-4 py-3 text-right">Grand Total</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {customers.map((cust) => {
            const hasData = cust.awbCount > 0;
            return (
              <tr key={cust.id} className={cn("hover:bg-muted/50 transition-colors", !hasData && "bg-muted/20 opacity-70")}>
                <td className="px-4 py-2">
                  {hasData ? (
                    <Checkbox 
                      checked={selectedCustomers.has(cust.id)}
                      onCheckedChange={() => onToggleCustomer(cust.id)}
                      className="rounded-[2px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  ) : (
                    <span className="text-muted-foreground ml-1 inline-flex w-4 justify-center">-</span>
                  )}
                </td>
                <td className="px-4 py-2 font-mono text-xs">{cust.code}</td>
                <td className="px-4 py-2 font-medium">{cust.name}</td>
                <td className="px-4 py-2 text-right">{hasData ? cust.awbCount : ""}</td>
                <td className="px-4 py-2 text-right font-mono">{hasData ? cust.totalAmount.toFixed(4) : ""}</td>
                <td className="px-4 py-2 text-right font-mono">{hasData ? cust.igst.toFixed(4) : ""}</td>
                <td className="px-4 py-2 text-right font-mono">{hasData ? cust.cgst.toFixed(4) : ""}</td>
                <td className="px-4 py-2 text-right font-mono">{hasData ? cust.sgst.toFixed(4) : ""}</td>
                <td className="px-4 py-2 text-right font-mono font-bold">{hasData ? cust.grandTotal.toFixed(3) : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Main Page Component
// ----------------------------------------------------------------------------

export const Route = createFileRoute("/documents/invoice-generation")({
  component: InvoiceGenerationPage,
  head: () => ({
    meta: [{ title: "Invoice Generation — Courier ERP" }],
  }),
});

const initialFormData = {
  year: "2025-2026",
  fromDate: "",
  toDate: "",
  productType: "",
  paymentType: "",
  serviceCenterCode: "",
  serviceCenterName: "",
  billingType: "",
  registerType: "",
  rcm: false,
  
  showAwb: false,
  customer: "",

  invoiceDate: "",
  invoiceNo: "",
  shipper: "",
  product: "",
  origin: "",
  dest: "",
  vendor: "",
  service: "",
  awbNo: "",
  content: "",
};

function InvoiceGenerationPage() {
  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [activeLookup, setActiveLookup] = useState<string | null>(null);

  // Form State
  const [scope, setScope] = useState("Single");
  const [selectedCustomers, setSelectedCustomers] = useState<Set<number>>(new Set());
  
  const [formData, setFormData] = useState(initialFormData);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [outstandingBalance, setOutstandingBalance] = useState<number>(0);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);

  useEffect(() => {
    let active = true;
    if (scope === "Single" && formData.customer) {
      setIsLoadingBalance(true);
      getCustomerOutstandingBalance(formData.customer).then((bal) => {
        if (active) {
          setOutstandingBalance(bal);
          setIsLoadingBalance(false);
        }
      });
    } else {
      setOutstandingBalance(0);
      setIsLoadingBalance(false);
    }
    return () => { active = false; };
  }, [formData.customer, scope]);

  const handleLookupClick = (field: string, title: string) => {
    setActiveLookup(field);
    setModalTitle(title);
    setModalOpen(true);
  };

  const handleLookupSelect = (item: { code: string; name: string }) => {
    console.log(`Selected for ${activeLookup}:`, item);
    if (activeLookup) {
      setFormData(prev => ({
        ...prev,
        [activeLookup]: item.code
      }));
    }
  };

  const handleScopeChange = (newScope: string) => {
    setScope(newScope);
    
    // Clear customer error if switching away from single
    if (newScope !== "Single" && errors.customer) {
      setErrors(prev => {
        const next = { ...prev };
        delete next.customer;
        return next;
      });
    }

    if (newScope === "All") {
      const allValid = new Set(MOCK_CUSTOMERS.filter(c => c.awbCount > 0).map(c => c.id));
      setSelectedCustomers(allValid);
    } else if (newScope === "Selective") {
      setSelectedCustomers(new Set());
    }
  };

  const handleToggleCustomer = (id: number) => {
    const next = new Set(selectedCustomers);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedCustomers(next);
  };

  const handleSelectAllCustomers = (checked: boolean) => {
    if (checked) {
      setSelectedCustomers(new Set(MOCK_CUSTOMERS.filter(c => c.awbCount > 0).map(c => c.id)));
    } else {
      setSelectedCustomers(new Set());
    }
  };

  const handleGenerate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.year) newErrors.year = "Required";
    if (!formData.fromDate) newErrors.fromDate = "Please select From Date";
    if (!formData.toDate) newErrors.toDate = "Please select To Date";
    
    // Dynamic validation: Customer only required in Single mode
    if (scope === "Single" && !formData.customer) {
      newErrors.customer = "Please select Customer";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      Object.values(newErrors).forEach(err => toast.error(err));
      return;
    }

    setErrors({});
    toast.success("Invoice generated successfully");
  };

  const handleReset = () => {
    setFormData(initialFormData);
    setErrors({});
    setScope("Single");
    setSelectedCustomers(new Set());
    toast.info("Form reset successfully");
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 w-full max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Invoice Generation</h1>
        <p className="text-sm text-muted-foreground">
          Generate, review, and manage invoices for your clients.
        </p>
      </div>

      <div className="bg-card border rounded-xl shadow-sm overflow-hidden flex flex-col">
        {/* SECTION 1: Core Parameters */}
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold mb-4 text-foreground/90">Core Parameters</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-5">
            <div className="flex flex-col space-y-1.5">
              <Label className={cn("text-xs uppercase font-semibold tracking-wider", errors.year ? "text-red-500" : "text-muted-foreground")}>
                Year *
              </Label>
              <Select 
                value={formData.year} 
                onValueChange={(val) => {
                  setFormData(p => ({ ...p, year: val }));
                  setErrors(p => ({ ...p, year: "" }));
                }}
              >
                <SelectTrigger className={cn("h-9 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500", errors.year && "border-red-500 text-red-500")}>
                  <SelectValue placeholder="Select Year" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2024-2025">2024-2025</SelectItem>
                  <SelectItem value="2025-2026">2025-2026</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col space-y-1.5">
              <Label className={cn("text-xs uppercase font-semibold tracking-wider", errors.fromDate ? "text-red-500" : "text-muted-foreground")}>
                From Date *
              </Label>
              <input 
                type="date" 
                value={formData.fromDate}
                onChange={(e) => {
                  setFormData(p => ({ ...p, fromDate: e.target.value }));
                  setErrors(p => ({ ...p, fromDate: "" }));
                }}
                className={cn(
                  "flex h-9 w-full rounded-md border bg-white px-3 py-1 text-sm shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500",
                  errors.fromDate ? "border-red-500 text-red-500" : "border-input"
                )}
              />
            </div>

            <div className="flex flex-col space-y-1.5">
              <Label className={cn("text-xs uppercase font-semibold tracking-wider", errors.toDate ? "text-red-500" : "text-muted-foreground")}>
                To Date *
              </Label>
              <input 
                type="date" 
                value={formData.toDate}
                onChange={(e) => {
                  setFormData(p => ({ ...p, toDate: e.target.value }));
                  setErrors(p => ({ ...p, toDate: "" }));
                }}
                className={cn(
                  "flex h-9 w-full rounded-md border bg-white px-3 py-1 text-sm shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500",
                  errors.toDate ? "border-red-500 text-red-500" : "border-input"
                )}
              />
            </div>

            <div className="flex flex-col space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Product Type</Label>
              <Select value={formData.productType} onValueChange={(val) => setFormData(p => ({ ...p, productType: val }))}>
                <SelectTrigger className="h-9 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                  <SelectValue placeholder="Select Product" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="domestic">Domestic</SelectItem>
                  <SelectItem value="international">International</SelectItem>
                  <SelectItem value="local">Local</SelectItem>
                  <SelectItem value="import">Import</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Payment Type</Label>
              <Select value={formData.paymentType} onValueChange={(val) => setFormData(p => ({ ...p, paymentType: val }))}>
                <SelectTrigger className="h-9 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                  <SelectValue placeholder="Select Payment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="credit">Credit</SelectItem>
                  <SelectItem value="topay">To Pay</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <LookupInput
              label="Service Center"
              value={formData.serviceCenterCode}
              onChange={(val) => setFormData(p => ({ ...p, serviceCenterCode: val }))}
              placeholder="Code"
              secondaryValue={formData.serviceCenterName}
              onSecondaryChange={(val) => setFormData(p => ({ ...p, serviceCenterName: val }))}
              secondaryPlaceholder="Name"
              onSearchClick={() => handleLookupClick('serviceCenterCode', 'Search Service Center')}
            />

            <div className="flex flex-col space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Billing Type</Label>
              <Select value={formData.billingType} onValueChange={(val) => setFormData(p => ({ ...p, billingType: val }))}>
                <SelectTrigger className="h-9 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                  <SelectValue placeholder="Select Billing" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="fortnightly">Fortnightly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Register Type</Label>
              <Select value={formData.registerType} onValueChange={(val) => setFormData(p => ({ ...p, registerType: val }))}>
                <SelectTrigger className="h-9 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                  <SelectValue placeholder="Select Register" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="b2b">B2B</SelectItem>
                  <SelectItem value="b2c">B2C</SelectItem>
                  <SelectItem value="sezwpk">SEZWPK</SelectItem>
                  <SelectItem value="sezwop">SEZWOP</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2 pt-2 col-span-1 md:col-span-2 lg:col-span-4">
              <Checkbox 
                id="rcm" 
                checked={formData.rcm}
                onCheckedChange={(c) => setFormData(p => ({ ...p, rcm: c === true }))}
                className="rounded-[2px] data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
              />
              <Label htmlFor="rcm" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Reverse Charge Mechanism (RCM)
              </Label>
            </div>
          </div>
        </div>

        {/* SECTION 2: Invoice Scope & Metrics */}
        <div className="p-6 border-b bg-muted/20">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-6">
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground/90">Invoice Scope</h2>
              <PillToggleGroup 
                value={scope} 
                onChange={handleScopeChange} 
                options={["Single", "Selective", "All"]} 
              />
            </div>

            {scope === "Single" && (
              <div className="flex items-center gap-6">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="show-awb" 
                    checked={formData.showAwb}
                    onCheckedChange={(c) => setFormData(p => ({ ...p, showAwb: c === true }))}
                    className="rounded-[2px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                  />
                  <Label htmlFor="show-awb">Show AWB</Label>
                </div>
                <div 
                  className={cn(
                    "border rounded-lg px-4 py-2 shadow-sm text-right min-w-[200px] transition-colors",
                    outstandingBalance >= 500000 ? "bg-rose-50 border-rose-200" : "bg-card"
                  )}
                  aria-live="polite"
                  title={outstandingBalance >= 500000 ? "Exceeds standard credit threshold" : undefined}
                >
                  <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-1">Total Cash Outstanding</div>
                  <div className={cn(
                    "text-xl font-bold flex justify-end",
                    outstandingBalance === 0 ? "text-slate-500" : outstandingBalance < 500000 ? "text-blue-600" : "text-rose-600"
                  )}>
                    {isLoadingBalance ? (
                      <div className="h-7 w-32 bg-muted rounded animate-pulse" />
                    ) : (
                      outstandingBalance.toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {scope === "Single" && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
              <div className="flex flex-col space-y-1.5 lg:col-span-2">
                <Label className={cn("text-xs uppercase font-semibold tracking-wider", errors.customer ? "text-red-500" : "text-muted-foreground")}>
                  Customer *
                </Label>
                <Select 
                  value={formData.customer} 
                  onValueChange={(val) => {
                    setFormData(p => ({ ...p, customer: val }));
                    setErrors(p => ({ ...p, customer: "" }));
                  }}
                >
                  <SelectTrigger className={cn("h-9 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500", errors.customer && "border-red-500 text-red-500")}>
                    <SelectValue placeholder="Select Customer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CUST-001">Bluedart Express</SelectItem>
                    <SelectItem value="CUST-002">Amazon Seller Services</SelectItem>
                    <SelectItem value="CUST-003">Flipkart India</SelectItem>
                    <SelectItem value="CUST-004">Tata Neu Retail</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {scope !== "Single" && (
            <CustomerDataTable 
              customers={MOCK_CUSTOMERS} 
              selectedCustomers={selectedCustomers}
              onToggleCustomer={handleToggleCustomer}
              onSelectAll={handleSelectAllCustomers}
            />
          )}
        </div>

        {/* SECTION 3: Identity & Waybill Lookups */}
        <div className="p-6">
          <h2 className="text-lg font-semibold mb-4 text-foreground/90">Identity & Lookups</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-5">
            <div className="flex flex-col space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Invoice Date</Label>
              <input 
                type="date"
                value={formData.invoiceDate}
                onChange={(e) => setFormData(p => ({ ...p, invoiceDate: e.target.value }))}
                className="flex h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            
            <div className="flex flex-col space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Invoice No.</Label>
              <Input 
                value={formData.invoiceNo}
                onChange={(e) => setFormData(p => ({ ...p, invoiceNo: e.target.value }))}
                className="h-9 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                placeholder="Enter Invoice No" 
              />
            </div>

            <LookupInput label="Shipper" value={formData.shipper} onChange={(val) => setFormData(p => ({ ...p, shipper: val }))} onSearchClick={() => handleLookupClick('shipper', 'Search Shipper')} placeholder="Search Shipper..." />
            <LookupInput label="Product" value={formData.product} onChange={(val) => setFormData(p => ({ ...p, product: val }))} onSearchClick={() => handleLookupClick('product', 'Search Product')} placeholder="Search Product..." />
            <LookupInput label="Origin" value={formData.origin} onChange={(val) => setFormData(p => ({ ...p, origin: val }))} onSearchClick={() => handleLookupClick('origin', 'Search Origin')} placeholder="Search Origin..." />
            <LookupInput label="Destination" value={formData.dest} onChange={(val) => setFormData(p => ({ ...p, dest: val }))} onSearchClick={() => handleLookupClick('dest', 'Search Destination')} placeholder="Search Destination..." />
            <LookupInput label="Vendor" value={formData.vendor} onChange={(val) => setFormData(p => ({ ...p, vendor: val }))} onSearchClick={() => handleLookupClick('vendor', 'Search Vendor')} placeholder="Search Vendor..." />
            <LookupInput label="Service" value={formData.service} onChange={(val) => setFormData(p => ({ ...p, service: val }))} onSearchClick={() => handleLookupClick('service', 'Search Service')} placeholder="Search Service..." />
            
            <div className="flex flex-col space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">AWB No.</Label>
              <Input 
                value={formData.awbNo}
                onChange={(e) => setFormData(p => ({ ...p, awbNo: e.target.value }))}
                className="h-9 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                placeholder="Enter AWB No" 
              />
            </div>

            <div className="flex flex-col space-y-1.5 lg:col-span-3">
              <Label className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Content</Label>
              <Input 
                value={formData.content}
                onChange={(e) => setFormData(p => ({ ...p, content: e.target.value }))}
                className="h-9 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                placeholder="Enter content description" 
              />
            </div>
          </div>
        </div>

        {/* SECTION 4: Action Footer */}
        <div className="p-4 border-t bg-muted/30 flex flex-col sm:flex-row sm:items-center justify-start gap-4">
          <Button onClick={handleGenerate} className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ">
            Generate
          </Button>
          <Button onClick={handleReset} variant="destructive" className="w-full sm:w-auto font-medium focus-visible:ring-2 focus-visible:ring-destructive focus-visible:outline-none ">
            Reset
          </Button>
          <Button variant="secondary" className="w-full sm:w-auto bg-slate-200 hover:bg-slate-300 text-slate-700 font-medium focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:outline-none ">
            Last Invoice No
          </Button>
        </div>
      </div>

      <SearchModal 
        open={modalOpen} 
        onOpenChange={setModalOpen} 
        title={modalTitle} 
        onSelect={handleLookupSelect} 
      />
    </div>
  );
}
