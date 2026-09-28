import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Search, ChevronLeft, ChevronRight, Loader2, Calendar as CalendarIcon } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

// ----------------------------------------------------------------------------
// Main Page Component
// ----------------------------------------------------------------------------

export const Route = createFileRoute("/documents/invoice-print")({
  component: InvoicePrintPage,
  head: () => ({
    meta: [{ title: "Invoice Print — Courier ERP" }],
  }),
});

const today = new Date().toISOString().split("T")[0];

const initialFormData = {
  fromDate: today,
  toDate: today,
  fromNo: "",
  toNo: "",
  branchCode: "",
  branchName: "",
  serviceCenterCode: "",
  serviceCenterName: "",
  productType: "",
  invoiceFormat: "",
  customerCode: "",
  customerName: "",
  year: "2025-2026",
  invoiceMessage: "",

  // E-Invoice specific
  smtpSender: "",
  smtpPort: "587",
  smtpUserId: "",
  smtpPassword: "",
  smtpEmailId: "",
  smtpCc: "",
  smtpInvalidEmailTo: "",
  sendInvoiceEmail: false,
  sendInvoiceAckEmail: false,
  smtpSsl: false,
  emailDocument: "",
  invoiceStatus: "",

  // IRN specific
  irnStatus: "",
};

function InvoicePrintPage() {
  // Navigation State
  const [activeMainTab, setActiveMainTab] = useState("invoice-print");
  const [activeSecondaryTab, setActiveSecondaryTab] = useState("invoice-date");
  const [eInvoiceFilter, setEInvoiceFilter] = useState("invoice-date");
  const [irnFilter, setIrnFilter] = useState("invoice-date");

  // Lookup Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [activeLookup, setActiveLookup] = useState<string | null>(null);

  // Form & Action State
  const [formData, setFormData] = useState(initialFormData);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(false);

  const handleLookupClick = (field: string, title: string) => {
    setActiveLookup(field);
    setModalTitle(title);
    setModalOpen(true);
  };

  const handleLookupSelect = (item: { code: string; name: string }) => {
    if (activeLookup === "branch") {
      setFormData(prev => ({ 
        ...prev, 
        branchCode: item.code,
        branchName: item.name
      }));
      setErrors(prev => ({ ...prev, branchCode: false }));
    } else if (activeLookup === "serviceCenter") {
      setFormData(prev => ({ 
        ...prev, 
        serviceCenterCode: item.code, 
        serviceCenterName: item.name 
      }));
      setErrors(prev => ({ ...prev, serviceCenterCode: false }));
    } else if (activeLookup === "customer") {
      setFormData(prev => ({ 
        ...prev, 
        customerCode: item.code, 
        customerName: item.name 
      }));
      setErrors(prev => ({ ...prev, customerCode: false }));
    }
  };

  const handleReset = () => {
    setFormData(initialFormData);
    setErrors({});
    setActiveSecondaryTab("invoice-date");
    setEInvoiceFilter("invoice-date");
    setIrnFilter("invoice-date");
    toast.info("Form reset successfully");
  };

  const validateForm = (filterState: string) => {
    const newErrors: Record<string, boolean> = {};
    if (filterState === "invoice-date") {
      if (!formData.fromDate) newErrors.fromDate = true;
      if (!formData.toDate) newErrors.toDate = true;
    } else {
      if (!formData.fromNo) newErrors.fromNo = true;
      if (!formData.toNo) newErrors.toNo = true;
    }
    if (!formData.branchCode) newErrors.branchCode = true;
    if (!formData.serviceCenterCode) newErrors.serviceCenterCode = true;
    if (!formData.customerCode) newErrors.customerCode = true;
    if (!formData.year) newErrors.year = true;

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleView = (filterState: string) => {
    if (!validateForm(filterState)) {
      toast.error("Please enter/select mandatory search criteria.");
      return;
    }

    setIsLoading(true);
    toast.info("Fetching records...");
    
    setTimeout(() => {
      setIsLoading(false);
      toast.success("No records found (Simulation complete)");
    }, 1000);
  };

  const renderDateOrNoInputs = (
    filterState: string,
    onFromDateChange: (val: string) => void,
    onToDateChange: (val: string) => void,
    onFromNoChange: (val: string) => void,
    onToNoChange: (val: string) => void
  ) => {
    if (filterState === "invoice-date") {
      return (
        <>
          <div className="flex flex-col space-y-1.5">
            <Label className={cn("text-xs uppercase font-semibold tracking-wider", errors.fromDate ? "text-red-500" : "text-muted-foreground")}>From Date</Label>
            <DatePicker date={formData.fromDate} setDate={onFromDateChange} error={errors.fromDate} />
          </div>
          <div className="flex flex-col space-y-1.5">
            <Label className={cn("text-xs uppercase font-semibold tracking-wider", errors.toDate ? "text-red-500" : "text-muted-foreground")}>To Date</Label>
            <DatePicker date={formData.toDate} setDate={onToDateChange} error={errors.toDate} />
          </div>
        </>
      );
    }
    return (
      <>
        <div className="flex flex-col space-y-1.5">
          <Label className={cn("text-xs uppercase font-semibold tracking-wider", errors.fromNo ? "text-red-500" : "text-muted-foreground")}>From No.</Label>
          <Input 
            value={formData.fromNo}
            onChange={(e) => onFromNoChange(e.target.value)}
            placeholder="Enter From Invoice No"
            className={cn("h-9 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500", errors.fromNo ? "border-red-500" : "")}
          />
        </div>
        <div className="flex flex-col space-y-1.5">
          <Label className={cn("text-xs uppercase font-semibold tracking-wider", errors.toNo ? "text-red-500" : "text-muted-foreground")}>To No.</Label>
          <Input 
            value={formData.toNo}
            onChange={(e) => onToNoChange(e.target.value)}
            placeholder="Enter To Invoice No"
            className={cn("h-9 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500", errors.toNo ? "border-red-500" : "")}
          />
        </div>
      </>
    );
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 w-full max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Invoice Print</h1>
        <p className="text-sm text-muted-foreground">
          Print invoices, generate IRN, or manage e-invoices.
        </p>
      </div>

      <Tabs value={activeMainTab} onValueChange={(val) => { setActiveMainTab(val); setErrors({}); }} className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-6 bg-slate-200/50 p-1">
          <TabsTrigger value="invoice-print" className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Invoice Print</TabsTrigger>
          <TabsTrigger value="e-invoice" className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">E-Invoice</TabsTrigger>
          <TabsTrigger value="generate-irn" className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Generate IRN</TabsTrigger>
        </TabsList>

        {/* -------------------------------------------------------------------------
            TAB 1: INVOICE PRINT
        -------------------------------------------------------------------------- */}
        <TabsContent value="invoice-print" className="focus:outline-none">
          <div className="bg-card border rounded-xl shadow-sm overflow-hidden flex flex-col">
            
            <div className="p-4 border-b bg-muted/20">
              <Tabs value={activeSecondaryTab} onValueChange={(val) => { setActiveSecondaryTab(val); setErrors({}); }}>
                <TabsList className="inline-flex h-9 items-center justify-center rounded-lg bg-slate-200 p-1 text-slate-700">
                  <TabsTrigger value="invoice-date" className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 text-xs uppercase tracking-wider font-semibold px-4">Invoice Date</TabsTrigger>
                  <TabsTrigger value="invoice-no" className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 text-xs uppercase tracking-wider font-semibold px-4">Invoice No</TabsTrigger>
                </TabsList>
                <TabsContent value="invoice-date" className="hidden" />
                <TabsContent value="invoice-no" className="hidden" />
              </Tabs>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                
                {renderDateOrNoInputs(
                  activeSecondaryTab,
                  (val) => { setFormData(p => ({ ...p, fromDate: val })); setErrors(p => ({ ...p, fromDate: false })); },
                  (val) => { setFormData(p => ({ ...p, toDate: val })); setErrors(p => ({ ...p, toDate: false })); },
                  (val) => { setFormData(p => ({ ...p, fromNo: val })); setErrors(p => ({ ...p, fromNo: false })); },
                  (val) => { setFormData(p => ({ ...p, toNo: val })); setErrors(p => ({ ...p, toNo: false })); }
                )}

                <LookupInput
                  label="Branch"
                  value={formData.branchCode}
                  onChange={(val) => { setFormData(p => ({ ...p, branchCode: val })); setErrors(p => ({ ...p, branchCode: false })); }}
                  placeholder="Code"
                  secondaryValue={formData.branchName}
                  onSecondaryChange={(val) => setFormData(p => ({ ...p, branchName: val }))}
                  secondaryPlaceholder="Name"
                  onSearchClick={() => handleLookupClick('branch', 'Search Branch')}
                  error={errors.branchCode}
                />

                <LookupInput
                  label="Service Center"
                  value={formData.serviceCenterCode}
                  onChange={(val) => { setFormData(p => ({ ...p, serviceCenterCode: val })); setErrors(p => ({ ...p, serviceCenterCode: false })); }}
                  placeholder="Code"
                  secondaryValue={formData.serviceCenterName}
                  onSecondaryChange={(val) => setFormData(p => ({ ...p, serviceCenterName: val }))}
                  secondaryPlaceholder="Name"
                  onSearchClick={() => handleLookupClick('serviceCenter', 'Search Service Center')}
                  error={errors.serviceCenterCode}
                />

                <div className="flex flex-col space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Product Type</Label>
                  <Select value={formData.productType} onValueChange={(val) => setFormData(p => ({ ...p, productType: val }))}>
                    <SelectTrigger className="h-9 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                      <SelectValue placeholder="Select Product Type" />
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
                  <Label className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Invoice Format</Label>
                  <Input 
                    value={formData.invoiceFormat}
                    onChange={(e) => setFormData(p => ({ ...p, invoiceFormat: e.target.value }))}
                    placeholder="Enter format..."
                    className="h-9 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <LookupInput
                  label="Customer"
                  value={formData.customerCode}
                  onChange={(val) => { setFormData(p => ({ ...p, customerCode: val })); setErrors(p => ({ ...p, customerCode: false })); }}
                  placeholder="Code"
                  secondaryValue={formData.customerName}
                  onSecondaryChange={(val) => setFormData(p => ({ ...p, customerName: val }))}
                  secondaryPlaceholder="Name"
                  onSearchClick={() => handleLookupClick('customer', 'Search Customer')}
                  error={errors.customerCode}
                />

                <div className="flex flex-col space-y-1.5">
                  <Label className={cn("text-xs uppercase font-semibold tracking-wider", errors.year ? "text-red-500" : "text-muted-foreground")}>Year</Label>
                  <Select value={formData.year} onValueChange={(val) => { setFormData(p => ({ ...p, year: val })); setErrors(p => ({ ...p, year: false })); }}>
                    <SelectTrigger className={cn("h-9 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500", errors.year ? "border-red-500" : "")}>
                      <SelectValue placeholder="Select Year" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2023-2024">2023-2024</SelectItem>
                      <SelectItem value="2024-2025">2024-2025</SelectItem>
                      <SelectItem value="2025-2026">2025-2026</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="col-span-1 md:col-span-2 lg:col-span-3 flex flex-col space-y-1.5 pt-2">
                  <Label className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Invoice Message</Label>
                  <Textarea 
                    value={formData.invoiceMessage}
                    onChange={(e) => setFormData(p => ({ ...p, invoiceMessage: e.target.value }))}
                    placeholder="Enter any additional invoice message here..."
                    className="min-h-[80px] bg-white resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 border-t bg-muted/30 flex items-center justify-end gap-4">
              <Button 
                onClick={() => handleView(activeSecondaryTab)} 
                className="bg-slate-700 hover:bg-slate-800 text-white font-medium min-w-[100px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:ring-offset-1"
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
                variant="destructive" 
                className="font-medium focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 focus:ring-offset-1"
                disabled={isLoading}
              >
                Reset
              </Button>
            </div>
          </div>
        </TabsContent>
        
        {/* -------------------------------------------------------------------------
            TAB 2: E-INVOICE
        -------------------------------------------------------------------------- */}
        <TabsContent value="e-invoice" className="focus:outline-none space-y-6">
          {/* Top Card: SMTP Config */}
          <div className="bg-card border rounded-xl shadow-sm overflow-hidden flex flex-col p-6">
            <h2 className="text-lg font-semibold mb-6 text-slate-800">SMTP Config</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              
              <div className="flex flex-col space-y-1.5">
                <Label className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">Sender SMTP</Label>
                <Input value={formData.smtpSender} onChange={(e) => setFormData(p => ({ ...p, smtpSender: e.target.value }))} className="h-9 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div className="flex flex-col space-y-1.5">
                <Label className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">SMTP Port</Label>
                <Input value={formData.smtpPort} onChange={(e) => setFormData(p => ({ ...p, smtpPort: e.target.value }))} className="h-9 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div className="flex flex-col space-y-1.5">
                <Label className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">Sender User ID</Label>
                <Input value={formData.smtpUserId} onChange={(e) => setFormData(p => ({ ...p, smtpUserId: e.target.value }))} className="h-9 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div className="flex flex-col space-y-1.5">
                <Label className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">Password</Label>
                <Input type="password" value={formData.smtpPassword} onChange={(e) => setFormData(p => ({ ...p, smtpPassword: e.target.value }))} className="h-9 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div className="flex flex-col space-y-1.5">
                <Label className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">Sender Email ID</Label>
                <Input value={formData.smtpEmailId} onChange={(e) => setFormData(p => ({ ...p, smtpEmailId: e.target.value }))} className="h-9 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div className="flex flex-col space-y-1.5">
                <Label className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">Additional CC</Label>
                <Input value={formData.smtpCc} onChange={(e) => setFormData(p => ({ ...p, smtpCc: e.target.value }))} className="h-9 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div className="flex flex-col space-y-1.5 col-span-1 md:col-span-2 lg:col-span-2">
                <Label className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">Incase Of Invalid Email Id Send Mail To</Label>
                <Input value={formData.smtpInvalidEmailTo} onChange={(e) => setFormData(p => ({ ...p, smtpInvalidEmailTo: e.target.value }))} className="h-9 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>

              <div className="col-span-1 md:col-span-2 lg:col-span-3 flex flex-wrap items-center gap-6 pt-2">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="send-email" 
                    checked={formData.sendInvoiceEmail} 
                    onCheckedChange={(checked) => setFormData(p => ({ ...p, sendInvoiceEmail: !!checked }))} 
                    className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" 
                  />
                  <Label htmlFor="send-email" className="text-sm font-medium cursor-pointer">Send Invoice Email</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="send-ack" 
                    checked={formData.sendInvoiceAckEmail} 
                    onCheckedChange={(checked) => setFormData(p => ({ ...p, sendInvoiceAckEmail: !!checked }))} 
                    className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" 
                  />
                  <Label htmlFor="send-ack" className="text-sm font-medium cursor-pointer">Send Invoice ACK Email</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="ssl" 
                    checked={formData.smtpSsl} 
                    onCheckedChange={(checked) => setFormData(p => ({ ...p, smtpSsl: !!checked }))} 
                    className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" 
                  />
                  <Label htmlFor="ssl" className="text-sm font-medium cursor-pointer">SSL</Label>
                </div>
              </div>
            </div>
            
            <div className="flex justify-end mt-6">
              <Button className="bg-blue-600 hover:bg-blue-700 text-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:ring-offset-1">
                Update
              </Button>
            </div>
          </div>

          {/* Bottom Card: Email / Invoice Search & Filter */}
          <div className="bg-card border rounded-xl shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b bg-muted/20 flex flex-col md:flex-row gap-4 items-center justify-between">
              
              <div className="flex items-center space-x-4 w-full md:w-auto">
                <Label className="text-xs text-muted-foreground uppercase font-semibold tracking-wider whitespace-nowrap">Email Document</Label>
                <Select value={formData.emailDocument} onValueChange={(val) => setFormData(p => ({ ...p, emailDocument: val }))}>
                  <SelectTrigger className="h-9 w-full md:w-[250px] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                    <SelectValue placeholder="Select Email Document" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="debit-note">Debit Note</SelectItem>
                    <SelectItem value="credit-note">Credit Note</SelectItem>
                    <SelectItem value="whatsapp-invoice">WhatsApp Invoice</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Tabs value={eInvoiceFilter} onValueChange={(val) => { setEInvoiceFilter(val); setErrors({}); }}>
                <TabsList className="inline-flex h-9 items-center justify-center rounded-lg bg-slate-200 p-1 text-slate-700">
                  <TabsTrigger value="invoice-date" className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 text-xs uppercase tracking-wider font-semibold px-4">Invoice Date</TabsTrigger>
                  <TabsTrigger value="invoice-no" className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 text-xs uppercase tracking-wider font-semibold px-4">Invoice No</TabsTrigger>
                </TabsList>
                <TabsContent value="invoice-date" className="hidden" />
                <TabsContent value="invoice-no" className="hidden" />
              </Tabs>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                
                {renderDateOrNoInputs(
                  eInvoiceFilter,
                  (val) => { setFormData(p => ({ ...p, fromDate: val })); setErrors(p => ({ ...p, fromDate: false })); },
                  (val) => { setFormData(p => ({ ...p, toDate: val })); setErrors(p => ({ ...p, toDate: false })); },
                  (val) => { setFormData(p => ({ ...p, fromNo: val })); setErrors(p => ({ ...p, fromNo: false })); },
                  (val) => { setFormData(p => ({ ...p, toNo: val })); setErrors(p => ({ ...p, toNo: false })); }
                )}

                <LookupInput
                  label="Branch"
                  value={formData.branchCode}
                  onChange={(val) => { setFormData(p => ({ ...p, branchCode: val })); setErrors(p => ({ ...p, branchCode: false })); }}
                  placeholder="Code"
                  secondaryValue={formData.branchName}
                  onSecondaryChange={(val) => setFormData(p => ({ ...p, branchName: val }))}
                  secondaryPlaceholder="Name"
                  onSearchClick={() => handleLookupClick('branch', 'Search Branch')}
                  error={errors.branchCode}
                />

                <LookupInput
                  label="Service Center"
                  value={formData.serviceCenterCode}
                  onChange={(val) => { setFormData(p => ({ ...p, serviceCenterCode: val })); setErrors(p => ({ ...p, serviceCenterCode: false })); }}
                  placeholder="Code"
                  secondaryValue={formData.serviceCenterName}
                  onSecondaryChange={(val) => setFormData(p => ({ ...p, serviceCenterName: val }))}
                  secondaryPlaceholder="Name"
                  onSearchClick={() => handleLookupClick('serviceCenter', 'Search Service Center')}
                  error={errors.serviceCenterCode}
                />

                <div className="flex flex-col space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Product Type</Label>
                  <Select value={formData.productType} onValueChange={(val) => setFormData(p => ({ ...p, productType: val }))}>
                    <SelectTrigger className="h-9 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                      <SelectValue placeholder="Select Product Type" />
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
                  <Label className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Invoice Format</Label>
                  <Input 
                    value={formData.invoiceFormat}
                    onChange={(e) => setFormData(p => ({ ...p, invoiceFormat: e.target.value }))}
                    placeholder="Enter format..."
                    className="h-9 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <LookupInput
                  label="Customer"
                  value={formData.customerCode}
                  onChange={(val) => { setFormData(p => ({ ...p, customerCode: val })); setErrors(p => ({ ...p, customerCode: false })); }}
                  placeholder="Code"
                  secondaryValue={formData.customerName}
                  onSecondaryChange={(val) => setFormData(p => ({ ...p, customerName: val }))}
                  secondaryPlaceholder="Name"
                  onSearchClick={() => handleLookupClick('customer', 'Search Customer')}
                  error={errors.customerCode}
                />

                <div className="flex flex-col space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Invoice Status</Label>
                  <Select value={formData.invoiceStatus} onValueChange={(val) => setFormData(p => ({ ...p, invoiceStatus: val }))}>
                    <SelectTrigger className="h-9 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                      <SelectValue placeholder="Select Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending Email Invoice</SelectItem>
                      <SelectItem value="sent">Send Email Invoice</SelectItem>
                      <SelectItem value="all">All Invoice</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col space-y-1.5">
                  <Label className={cn("text-xs uppercase font-semibold tracking-wider", errors.year ? "text-red-500" : "text-muted-foreground")}>Year</Label>
                  <Select value={formData.year} onValueChange={(val) => { setFormData(p => ({ ...p, year: val })); setErrors(p => ({ ...p, year: false })); }}>
                    <SelectTrigger className={cn("h-9 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500", errors.year ? "border-red-500" : "")}>
                      <SelectValue placeholder="Select Year" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2023-2024">2023-2024</SelectItem>
                      <SelectItem value="2024-2025">2024-2025</SelectItem>
                      <SelectItem value="2025-2026">2025-2026</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="col-span-1 md:col-span-2 lg:col-span-3 flex flex-col space-y-1.5 pt-2">
                  <Label className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Invoice Message</Label>
                  <Textarea 
                    value={formData.invoiceMessage}
                    onChange={(e) => setFormData(p => ({ ...p, invoiceMessage: e.target.value }))}
                    placeholder="Enter any additional invoice message here..."
                    className="min-h-[80px] bg-white resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 border-t bg-muted/30 flex items-center justify-end gap-4">
              <Button 
                onClick={() => handleView(eInvoiceFilter)} 
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium min-w-[100px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:ring-offset-1"
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
                variant="destructive" 
                className="font-medium focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 focus:ring-offset-1"
                disabled={isLoading}
              >
                Reset
              </Button>
            </div>
          </div>
        </TabsContent>
        
        {/* -------------------------------------------------------------------------
            TAB 3: GENERATE IRN
        -------------------------------------------------------------------------- */}
        <TabsContent value="generate-irn" className="focus:outline-none">
          <div className="bg-card border rounded-xl shadow-sm overflow-hidden flex flex-col">
            
            <div className="p-4 border-b bg-muted/20">
              <Tabs value={irnFilter} onValueChange={(val) => { setIrnFilter(val); setErrors({}); }}>
                <TabsList className="inline-flex h-9 items-center justify-center rounded-lg bg-slate-200 p-1 text-slate-700">
                  <TabsTrigger value="invoice-date" className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 text-xs uppercase tracking-wider font-semibold px-4">Invoice Date</TabsTrigger>
                  <TabsTrigger value="invoice-no" className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 text-xs uppercase tracking-wider font-semibold px-4">Invoice No</TabsTrigger>
                </TabsList>
                <TabsContent value="invoice-date" className="hidden" />
                <TabsContent value="invoice-no" className="hidden" />
              </Tabs>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                
                {renderDateOrNoInputs(
                  irnFilter,
                  (val) => { setFormData(p => ({ ...p, fromDate: val })); setErrors(p => ({ ...p, fromDate: false })); },
                  (val) => { setFormData(p => ({ ...p, toDate: val })); setErrors(p => ({ ...p, toDate: false })); },
                  (val) => { setFormData(p => ({ ...p, fromNo: val })); setErrors(p => ({ ...p, fromNo: false })); },
                  (val) => { setFormData(p => ({ ...p, toNo: val })); setErrors(p => ({ ...p, toNo: false })); }
                )}

                <LookupInput
                  label="Branch"
                  value={formData.branchCode}
                  onChange={(val) => { setFormData(p => ({ ...p, branchCode: val })); setErrors(p => ({ ...p, branchCode: false })); }}
                  placeholder="Code"
                  secondaryValue={formData.branchName}
                  onSecondaryChange={(val) => setFormData(p => ({ ...p, branchName: val }))}
                  secondaryPlaceholder="Name"
                  onSearchClick={() => handleLookupClick('branch', 'Search Branch')}
                  error={errors.branchCode}
                />

                <LookupInput
                  label="Service Center"
                  value={formData.serviceCenterCode}
                  onChange={(val) => { setFormData(p => ({ ...p, serviceCenterCode: val })); setErrors(p => ({ ...p, serviceCenterCode: false })); }}
                  placeholder="Code"
                  secondaryValue={formData.serviceCenterName}
                  onSecondaryChange={(val) => setFormData(p => ({ ...p, serviceCenterName: val }))}
                  secondaryPlaceholder="Name"
                  onSearchClick={() => handleLookupClick('serviceCenter', 'Search Service Center')}
                  error={errors.serviceCenterCode}
                />

                <div className="flex flex-col space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Product Type</Label>
                  <Select value={formData.productType} onValueChange={(val) => setFormData(p => ({ ...p, productType: val }))}>
                    <SelectTrigger className="h-9 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                      <SelectValue placeholder="Select Product Type" />
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
                  <Label className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Invoice Format</Label>
                  <Input 
                    value={formData.invoiceFormat}
                    onChange={(e) => setFormData(p => ({ ...p, invoiceFormat: e.target.value }))}
                    placeholder="Enter format..."
                    className="h-9 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <LookupInput
                  label="Customer"
                  value={formData.customerCode}
                  onChange={(val) => { setFormData(p => ({ ...p, customerCode: val })); setErrors(p => ({ ...p, customerCode: false })); }}
                  placeholder="Code"
                  secondaryValue={formData.customerName}
                  onSecondaryChange={(val) => setFormData(p => ({ ...p, customerName: val }))}
                  secondaryPlaceholder="Name"
                  onSearchClick={() => handleLookupClick('customer', 'Search Customer')}
                  error={errors.customerCode}
                />

                <div className="flex flex-col space-y-1.5">
                  <Label className={cn("text-xs uppercase font-semibold tracking-wider", errors.year ? "text-red-500" : "text-muted-foreground")}>Year</Label>
                  <Select value={formData.year} onValueChange={(val) => { setFormData(p => ({ ...p, year: val })); setErrors(p => ({ ...p, year: false })); }}>
                    <SelectTrigger className={cn("h-9 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500", errors.year ? "border-red-500" : "")}>
                      <SelectValue placeholder="Select Year" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2023-2024">2023-2024</SelectItem>
                      <SelectItem value="2024-2025">2024-2025</SelectItem>
                      <SelectItem value="2025-2026">2025-2026</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Status</Label>
                  <Select value={formData.irnStatus} onValueChange={(val) => setFormData(p => ({ ...p, irnStatus: val }))}>
                    <SelectTrigger className="h-9 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                      <SelectValue placeholder="Select Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="col-span-1 md:col-span-2 lg:col-span-3 flex flex-col space-y-1.5 pt-2">
                  <Label className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Invoice Message</Label>
                  <Textarea 
                    value={formData.invoiceMessage}
                    onChange={(e) => setFormData(p => ({ ...p, invoiceMessage: e.target.value }))}
                    placeholder="Enter any additional invoice message here..."
                    className="min-h-[80px] bg-white resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 border-t bg-muted/30 flex items-center justify-end gap-4">
              <Button 
                onClick={() => handleView(irnFilter)} 
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium min-w-[100px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:ring-offset-1"
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
                variant="destructive" 
                className="font-medium focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 focus:ring-offset-1"
                disabled={isLoading}
              >
                Reset
              </Button>
            </div>
          </div>
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
