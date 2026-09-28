import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Search, ChevronLeft, ChevronRight, Loader2, Calendar as CalendarIcon, Lock, Unlock } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

// ----------------------------------------------------------------------------
// Custom Reusable Components
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
  error?: boolean;
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
  error,
}: LookupInputProps) {
  return (
    <div className="flex flex-col space-y-1.5">
      {label && <Label className={cn("text-xs uppercase font-semibold tracking-wider", error ? "text-red-500" : "text-muted-foreground")}>{label}</Label>}
      <div className="flex relative">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(
            "h-9 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500",
            secondaryValue !== undefined ? "rounded-r-none border-r-0" : "rounded-r-none",
            error ? "border-red-500" : ""
          )}
        />
        {secondaryValue !== undefined && (
          <Input
            value={secondaryValue}
            onChange={(e) => onSecondaryChange?.(e.target.value)}
            placeholder={secondaryPlaceholder}
            className={cn(
              "h-9 rounded-none bg-white border-r-0 focus:z-20 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500",
              error ? "border-y-red-500 border-l-red-500" : ""
            )}
          />
        )}
        <Button
          type="button"
          size="icon"
          onClick={onSearchClick}
          tabIndex={0}
          className={cn(
            "h-9 w-9 rounded-l-none shrink-0 bg-slate-900 hover:bg-slate-800 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500",
            error ? "border border-red-500" : ""
          )}
        >
          <Search className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function DatePicker({ date, setDate, error }: { date: string; setDate: (val: string) => void; error?: boolean }) {
  const parsedDate = date ? parseISO(date) : undefined;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={"outline"}
          className={cn(
            "w-full justify-start text-left font-normal h-9 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500",
            !date && "text-muted-foreground",
            error ? "border-red-500" : ""
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(parsedDate as Date, "dd/MM/yyyy") : <span>Select date</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={parsedDate}
          onSelect={(d) => setDate(d ? format(d, "yyyy-MM-dd") : "")}
          initialFocus
        />
      </PopoverContent>
    </Popover>
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
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ----------------------------------------------------------------------------
// Main Page Component
// ----------------------------------------------------------------------------

export const Route = createFileRoute("/documents/invoice-finalise")({
  component: InvoiceFinalisePage,
  head: () => ({
    meta: [{ title: "Invoice Finalise — Courier ERP" }],
  }),
});

const today = new Date().toISOString().split("T")[0];

const initialFormData = {
  typeWise: "date",
  fromDate: today,
  toDate: today,
  fromNo: "",
  toNo: "",
  lockType: "all",
  serviceCenterCode: "",
  serviceCenterName: "",
};

// Mock Data for the results
const mockInvoiceData = [
  { id: 1, invoiceNo: "INV-2026-001", invoiceDate: "2026-09-26", customerName: "Acme Corp", grandTotal: "1,250.00", status: "locked" },
  { id: 2, invoiceNo: "INV-2026-002", invoiceDate: "2026-09-25", customerName: "Global Logistics", grandTotal: "4,500.00", status: "un-locked" },
  { id: 3, invoiceNo: "INV-2026-003", invoiceDate: "2026-09-24", customerName: "Swift Retail", grandTotal: "890.50", status: "cancelled" },
];

const mockLogData = [
  { logId: "LOG-001", invoiceNo: "INV-2026-001", action: "Locked", modifiedBy: "SURYA", timestamp: "26/09/2026 14:32:10", remarks: "Finalised for month end" },
  { logId: "LOG-002", invoiceNo: "INV-2026-003", action: "Cancelled", modifiedBy: "ADMIN", timestamp: "25/09/2026 09:15:22", remarks: "Customer requested cancellation" },
];

function InvoiceFinalisePage() {
  const [activeMainTab, setActiveMainTab] = useState("lock-unlock");
  
  // Form State
  const [formData, setFormData] = useState(initialFormData);
  const [isLoading, setIsLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);

  // Lookup Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [activeLookup, setActiveLookup] = useState<string | null>(null);

  // Table Selections
  const [selectedInvoices, setSelectedInvoices] = useState<Set<number>>(new Set());

  const handleLookupClick = (field: string, title: string) => {
    setActiveLookup(field);
    setModalTitle(title);
    setModalOpen(true);
  };

  const handleLookupSelect = (item: { code: string; name: string }) => {
    if (activeLookup === "serviceCenter") {
      setFormData(prev => ({ 
        ...prev, 
        serviceCenterCode: item.code, 
        serviceCenterName: item.name 
      }));
    }
  };

  const handleReset = () => {
    setFormData(initialFormData);
    setShowResults(false);
    setSelectedInvoices(new Set());
    toast.info("Filters reset");
  };

  const handleView = () => {
    setIsLoading(true);
    setShowResults(false);
    
    // Simulate API call
    setTimeout(() => {
      setIsLoading(false);
      // Check if service center is selected or if 'empty' is typed
      if (!formData.serviceCenterCode || !formData.serviceCenterName || (formData.typeWise === 'number' && formData.fromNo === 'empty')) {
        toast.error("No Record found", { position: "top-right" });
      } else {
        setShowResults(true);
      }
    }, 800);
  };

  const toggleInvoiceSelection = (id: number) => {
    const newSet = new Set(selectedInvoices);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedInvoices(newSet);
  };

  const toggleAllInvoices = () => {
    if (selectedInvoices.size === mockInvoiceData.length) {
      setSelectedInvoices(new Set());
    } else {
      setSelectedInvoices(new Set(mockInvoiceData.map(i => i.id)));
    }
  };

  const renderFilterGrid = () => (
    <div className="bg-card border rounded-xl shadow-sm overflow-hidden flex flex-col mb-6">
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          
          {/* Row 1 */}
          <div className="flex flex-col space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Type Wise</Label>
            <Select value={formData.typeWise} onValueChange={(val) => setFormData(p => ({ ...p, typeWise: val }))}>
              <SelectTrigger className="h-9 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                <SelectValue placeholder="Select Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date">Date</SelectItem>
                <SelectItem value="number">Number</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.typeWise === "date" ? (
            <>
              <div className="flex flex-col space-y-1.5">
                <Label className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">From Date</Label>
                <DatePicker date={formData.fromDate} setDate={(d) => setFormData(p => ({ ...p, fromDate: d }))} />
              </div>
              <div className="flex flex-col space-y-1.5">
                <Label className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">To Date</Label>
                <DatePicker date={formData.toDate} setDate={(d) => setFormData(p => ({ ...p, toDate: d }))} />
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-col space-y-1.5">
                <Label className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">From Number</Label>
                <Input 
                  value={formData.fromNo}
                  onChange={(e) => setFormData(p => ({ ...p, fromNo: e.target.value }))}
                  placeholder="Enter From No"
                  className="h-9 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex flex-col space-y-1.5">
                <Label className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">To Number</Label>
                <Input 
                  value={formData.toNo}
                  onChange={(e) => setFormData(p => ({ ...p, toNo: e.target.value }))}
                  placeholder="Enter To No"
                  className="h-9 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </>
          )}

          {/* Row 2 */}
          <div className="flex flex-col space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Lock Type</Label>
            <Select value={formData.lockType} onValueChange={(val) => setFormData(p => ({ ...p, lockType: val }))}>
              <SelectTrigger className="h-9 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                <SelectValue placeholder="Select Lock Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="locked">Locked</SelectItem>
                <SelectItem value="un-locked">Un-Locked</SelectItem>
                <SelectItem value="cancel-invoice">Cancel-Invoice</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-1 md:col-span-2 lg:col-span-2">
            <LookupInput
              label="Service Center"
              value={formData.serviceCenterName}
              onChange={(val) => setFormData(p => ({ ...p, serviceCenterName: val }))}
              placeholder="Name"
              secondaryValue={formData.serviceCenterCode}
              onSecondaryChange={(val) => setFormData(p => ({ ...p, serviceCenterCode: val }))}
              secondaryPlaceholder="Code"
              onSearchClick={() => handleLookupClick('serviceCenter', 'Search Service Center')}
            />
          </div>

        </div>
      </div>
      
      {/* Action Footer */}
      <div className="p-4 border-t bg-muted/30 flex items-center justify-end gap-4">
        <Button 
          onClick={handleView} 
          className="bg-cyan-500 hover:bg-cyan-600 text-white font-medium min-w-[100px] rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors"
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Fetching
            </>
          ) : (
            "View"
          )}
        </Button>
        <Button 
          onClick={handleReset} 
          className="bg-red-500 hover:bg-red-600 text-white font-medium min-w-[100px] rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors"
          disabled={isLoading}
        >
          Reset
        </Button>
      </div>
    </div>
  );

  return (
    <div className="p-4 md:p-6 lg:p-8 w-full max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Invoice Finalise</h1>
        <p className="text-sm text-muted-foreground">
          Lock or unlock invoices and view audit logs.
        </p>
      </div>

      <Tabs value={activeMainTab} onValueChange={setActiveMainTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-6 bg-slate-200/50 p-1">
          <TabsTrigger 
            value="lock-unlock" 
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 data-[state=active]:bg-emerald-500 data-[state=active]:text-white font-medium"
          >
            Lock/Unlock Invoice
          </TabsTrigger>
          <TabsTrigger 
            value="log-report" 
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 data-[state=active]:bg-emerald-500 data-[state=active]:text-white font-medium"
          >
            Log Report
          </TabsTrigger>
        </TabsList>

        {/* -------------------------------------------------------------------------
            TAB 1: LOCK / UNLOCK INVOICE
        -------------------------------------------------------------------------- */}
        <TabsContent value="lock-unlock" className="focus:outline-none">
          {renderFilterGrid()}

          {showResults && (
            <div className="bg-white border rounded-xl shadow-sm overflow-hidden flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 border-b text-slate-600 font-semibold uppercase text-xs tracking-wider">
                    <tr>
                      <th className="px-4 py-3 w-12">
                        <Checkbox 
                          checked={selectedInvoices.size === mockInvoiceData.length && mockInvoiceData.length > 0} 
                          onCheckedChange={toggleAllInvoices}
                          className="focus-visible:ring-2 focus-visible:ring-blue-500"
                        />
                      </th>
                      <th className="px-4 py-3">Invoice No</th>
                      <th className="px-4 py-3">Invoice Date</th>
                      <th className="px-4 py-3">Customer Name</th>
                      <th className="px-4 py-3">Grand Total</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {mockInvoiceData.map((inv) => (
                      <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <Checkbox 
                            checked={selectedInvoices.has(inv.id)} 
                            onCheckedChange={() => toggleInvoiceSelection(inv.id)}
                            className="focus-visible:ring-2 focus-visible:ring-blue-500"
                          />
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-900">{inv.invoiceNo}</td>
                        <td className="px-4 py-3 text-slate-600">{inv.invoiceDate}</td>
                        <td className="px-4 py-3 text-slate-600">{inv.customerName}</td>
                        <td className="px-4 py-3 font-mono">{inv.grandTotal}</td>
                        <td className="px-4 py-3">
                          {inv.status === 'locked' && <Badge className="bg-green-100 text-green-700 hover:bg-green-200 border-green-200">Locked</Badge>}
                          {inv.status === 'un-locked' && <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-200 border-amber-200">Un-Locked</Badge>}
                          {inv.status === 'cancelled' && <Badge variant="destructive" className="bg-red-100 text-red-700 hover:bg-red-200 border-red-200">Cancelled</Badge>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {inv.status === 'locked' ? (
                            <Button size="sm" variant="outline" className="text-amber-600 border-amber-200 hover:bg-amber-50 h-8 focus:outline-none focus:ring-2 focus:ring-blue-500">
                              <Unlock className="w-3 h-3 mr-1" /> Unlock
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline" className="text-green-600 border-green-200 hover:bg-green-50 h-8 focus:outline-none focus:ring-2 focus:ring-blue-500">
                              <Lock className="w-3 h-3 mr-1" /> Lock
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="p-4 bg-slate-50 border-t flex justify-between items-center">
                <span className="text-sm text-slate-500">{selectedInvoices.size} item(s) selected</span>
                <div className="flex gap-2">
                  <Button variant="outline" className="text-green-600 border-green-200 hover:bg-green-50 focus:outline-none focus:ring-2 focus:ring-blue-500" disabled={selectedInvoices.size === 0}>
                    Bulk Lock
                  </Button>
                  <Button variant="outline" className="text-amber-600 border-amber-200 hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-blue-500" disabled={selectedInvoices.size === 0}>
                    Bulk Unlock
                  </Button>
                </div>
              </div>
            </div>
          )}
        </TabsContent>
        
        {/* -------------------------------------------------------------------------
            TAB 2: LOG REPORT
        -------------------------------------------------------------------------- */}
        <TabsContent value="log-report" className="focus:outline-none">
          {renderFilterGrid()}

          {showResults && (
            <div className="bg-white border rounded-xl shadow-sm overflow-hidden flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 border-b text-slate-600 font-semibold uppercase text-xs tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Log ID</th>
                      <th className="px-4 py-3">Invoice No</th>
                      <th className="px-4 py-3">Action Performed</th>
                      <th className="px-4 py-3">Modified By</th>
                      <th className="px-4 py-3">Timestamp</th>
                      <th className="px-4 py-3">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {mockLogData.map((log) => (
                      <tr key={log.logId} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-900">{log.logId}</td>
                        <td className="px-4 py-3 text-slate-600">{log.invoiceNo}</td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            "font-medium",
                            log.action === "Locked" && "text-green-600",
                            log.action === "Unlocked" && "text-amber-600",
                            log.action === "Cancelled" && "text-red-600"
                          )}>
                            {log.action}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600 font-mono">{log.modifiedBy}</td>
                        <td className="px-4 py-3 text-slate-600 text-xs">{log.timestamp}</td>
                        <td className="px-4 py-3 text-slate-500 max-w-xs truncate">{log.remarks}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <SearchModal 
        open={modalOpen} 
        onOpenChange={setModalOpen} 
        title={modalTitle} 
        onSelect={handleLookupSelect} 
      />
    </div>
  );
}
