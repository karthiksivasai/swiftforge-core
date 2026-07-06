import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState, type ReactNode } from "react";
import { Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FieldWrapper, MasterBreadcrumb, downloadCsv } from "@/components/master-table-kit";
import { MasterLookupDialog } from "@/components/master-lookup-dialog";
import { type LookupKey, type LookupOption } from "@/lib/master-lookups";

type EntityType = "Customer" | "Shipper" | "Consignee" | "AWB";
type SearchBy = "Name/Code" | "Mobile";

type EntityDetails = {
  code: string;
  pin: string;
  name: string;
  telephone: string;
  person: string;
  fax: string;
  email: string;
  mobile: string;
  address: string;
};

type KycDocument = {
  id: number;
  fileName: string;
  entryDate: string;
  imageType: string;
  sentDate: string;
  sentTime: string;
};

const ENTITY_TYPES: EntityType[] = ["Customer", "Shipper", "Consignee", "AWB"];
const SEARCH_BY_OPTIONS: SearchBy[] = ["Name/Code", "Mobile"];

const KYC_DOC_TYPES = [
  "Aadhaar Number",
  "Driving License",
  "GSTIN (Normal)",
  "IEC CERTIFICATE",
  "PAN Number",
  "Passport Number",
  "TAN Number",
  "Voter Id",
  "Performa Invoice",
  "Document",
] as const;

const LOOKUP_BY_ENTITY: Record<EntityType, LookupKey | null> = {
  Customer: "customer",
  Shipper: "shipper",
  Consignee: null,
  AWB: null,
};

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const formatDisplayDate = (iso: string) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
};

const nowTime = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
};

const emptyDetails = (): EntityDetails => ({
  code: "",
  pin: "",
  name: "",
  telephone: "",
  person: "",
  fax: "",
  email: "",
  mobile: "",
  address: "",
});

const SEED_ENTITIES: Record<EntityType, EntityDetails[]> = {
  Customer: [
    {
      code: "C001",
      pin: "500032",
      name: "AIHAN ENTERPRISES",
      telephone: "040-2345678",
      person: "RAJESH KUMAR",
      fax: "",
      email: "info@aihan.com",
      mobile: "9848012345",
      address: "Plot 45, HITEC City\nHYDERABAD, TELANGANA — 500032",
    },
    {
      code: "C003",
      pin: "500001",
      name: "HYDERABAD EXPORTS",
      telephone: "040-2789012",
      person: "SRINIVAS REDDY",
      fax: "040-2789013",
      email: "exports@hydexports.com",
      mobile: "9876543210",
      address: "12 Export House, Abids\nHYDERABAD — 500001",
    },
    {
      code: "TPCADDA",
      pin: "523201",
      name: "TPC ADDANKI",
      telephone: "08659-234567",
      person: "ELURI RAJESH",
      fax: "",
      email: "tpc@addanki.com",
      mobile: "9123456789",
      address: "Main Road, Addanki\nANDHRA PRADESH — 523201",
    },
  ],
  Shipper: [
    {
      code: "S001",
      pin: "500032",
      name: "ABC SHIPPING CO",
      telephone: "040-1112233",
      person: "MOHAN LAL",
      fax: "",
      email: "ship@abc.com",
      mobile: "9012345678",
      address: "Warehouse 3, Sanath Nagar\nHYDERABAD — 500032",
    },
    {
      code: "S003",
      pin: "500018",
      name: "HYD PACKERS",
      telephone: "040-4455667",
      person: "RAMESH",
      fax: "",
      email: "packers@hyd.com",
      mobile: "9988776655",
      address: "Industrial Estate, Balanagar\nHYDERABAD — 500018",
    },
  ],
  Consignee: [
    {
      code: "CON001",
      pin: "3000",
      name: "ELURI SIVARAMAKRISHNA",
      telephone: "+61-3-98765432",
      person: "ELURI SIVARAMAKRISHNA",
      fax: "",
      email: "eluri@email.com",
      mobile: "+61412345678",
      address: "42 Collins Street\nMELBOURNE, AUSTRALIA — 3000",
    },
  ],
  AWB: [
    {
      code: "30403918",
      pin: "",
      name: "ELURI SIVARAMAKRISHNA",
      telephone: "",
      person: "TPC ADDANKI",
      fax: "",
      email: "",
      mobile: "",
      address: "AWB shipment to AUSTRALIA\nOrigin: HYD",
    },
    {
      code: "30403919",
      pin: "",
      name: "JOHN SMITH",
      telephone: "",
      person: "FEDEX INTERNATIONAL COURIER",
      fax: "",
      email: "",
      mobile: "",
      address: "AWB shipment to USA\nOrigin: HYD",
    },
  ],
};

export const Route = createFileRoute("/transaction/tracking/kyc-tracking")({
  head: () => ({
    meta: [
      { title: "KYC Tracking — Transaction — Courier ERP" },
      { name: "description", content: "Track and upload KYC documents for customers, shippers, and consignees." },
    ],
  }),
  component: KycTrackingPage,
});

function KycTrackingPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [entityType, setEntityType] = useState<EntityType>("Customer");
  const [searchBy, setSearchBy] = useState<SearchBy>("Name/Code");
  const [searchName, setSearchName] = useState("");
  const [searchCode, setSearchCode] = useState("");
  const [details, setDetails] = useState<EntityDetails>(emptyDetails());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [docType, setDocType] = useState<string>(KYC_DOC_TYPES[0]);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [documents, setDocuments] = useState<Record<string, KycDocument[]>>({});
  const [nextDocId, setNextDocId] = useState(1);
  const [lookupOpen, setLookupOpen] = useState(false);

  const entityKey = selectedKey ? `${entityType}:${selectedKey}` : null;
  const entityDocuments = entityKey ? (documents[entityKey] ?? []) : [];

  const patchDetails = (patch: Partial<EntityDetails>) => setDetails((d) => ({ ...d, ...patch }));

  const findEntity = (): EntityDetails | null => {
    const pool = SEED_ENTITIES[entityType];
    const nameQ = searchName.trim().toLowerCase();
    const codeQ = searchCode.trim().toLowerCase();

    if (searchBy === "Mobile") {
      const mobileQ = searchName.trim();
      return pool.find((e) => e.mobile.includes(mobileQ)) ?? null;
    }

    if (codeQ) {
      const byCode = pool.find((e) => e.code.toLowerCase() === codeQ);
      if (byCode) return byCode;
    }
    if (nameQ) {
      return pool.find((e) => e.name.toLowerCase().includes(nameQ)) ?? null;
    }
    return null;
  };

  const applyEntity = (entity: EntityDetails) => {
    setDetails({ ...entity });
    setSelectedKey(entity.code);
    setSearchName(entity.name);
    setSearchCode(entity.code);
  };

  const handleSearch = () => {
    const match = findEntity();
    if (!match) return toast.error("No matching record found");
    applyEntity(match);
    toast.success(`Loaded ${entityType} ${match.code}`);
  };

  const handleRefresh = () => {
    setSearchName("");
    setSearchCode("");
    setDetails(emptyDetails());
    setSelectedKey(null);
    setSelectedFileName("");
    toast.success("Form refreshed");
  };

  const handleReport = () => {
    if (!entityKey || entityDocuments.length === 0) {
      return toast.error("Search and upload documents before generating report");
    }
    downloadCsv(
      `kyc-tracking-${selectedKey}.csv`,
      ["Id", "File Name", "Entry Date", "Image Type", "Sent Date", "Sent Time"],
      entityDocuments.map((doc) => [
        String(doc.id),
        doc.fileName,
        doc.entryDate,
        doc.imageType,
        doc.sentDate,
        doc.sentTime,
      ]),
    );
    toast.success("KYC report exported");
  };

  const handleLookupSelect = (_v: string, option: LookupOption) => {
    setSearchName(option.name);
    setSearchCode(option.code);
    const pool = SEED_ENTITIES[entityType];
    const match = pool.find((e) => e.code === option.code);
    if (match) applyEntity(match);
    else {
      patchDetails({ code: option.code, name: option.name });
      setSelectedKey(option.code);
    }
  };

  const handleChooseFile = () => fileInputRef.current?.click();

  const handleFileChange = (fileList: FileList | null) => {
    const file = fileList?.[0];
    setSelectedFileName(file?.name ?? "");
  };

  const handleUpload = () => {
    if (!selectedKey) return toast.error("Search and select an entity first");
    if (!selectedFileName) return toast.error("Choose a file to upload");

    const doc: KycDocument = {
      id: nextDocId,
      fileName: selectedFileName,
      entryDate: formatDisplayDate(todayIso()),
      imageType: docType,
      sentDate: "",
      sentTime: "",
    };
    setNextDocId((id) => id + 1);
    setDocuments((prev) => ({
      ...prev,
      [entityKey!]: [doc, ...(prev[entityKey!] ?? [])],
    }));
    setSelectedFileName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    toast.success("KYC document uploaded");
  };

  const removeDocument = (docId: number) => {
    if (!entityKey) return;
    setDocuments((prev) => ({
      ...prev,
      [entityKey]: (prev[entityKey] ?? []).filter((d) => d.id !== docId),
    }));
    toast.success("Document removed");
  };

  const lookupKey = LOOKUP_BY_ENTITY[entityType];

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <MasterBreadcrumb trail={["Transaction", "Tracking / Delivery", "KYC Tracking"]} />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">KYC Tracking</h1>
        <p className="text-sm text-muted-foreground">
          Search entities and manage KYC document uploads and tracking.
        </p>
      </div>

      <Card className="min-w-0 overflow-hidden border p-4 md:p-6">
        <FormSection title="Type">
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[auto_auto_1fr_auto] lg:items-end">
              <FieldWrapper label="Type">
                <Select value={entityType} onValueChange={(v) => setEntityType(v as EntityType)}>
                  <SelectTrigger className="min-w-[9rem]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ENTITY_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldWrapper>

              <FieldWrapper label="Search By">
                <Select value={searchBy} onValueChange={(v) => setSearchBy(v as SearchBy)}>
                  <SelectTrigger className="min-w-[9rem]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SEARCH_BY_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldWrapper>

              <FieldWrapper label={searchBy === "Mobile" ? "Mobile" : "Name"}>
                <div className="flex gap-1">
                  <Input
                    value={searchName}
                    onChange={(e) => setSearchName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleSearch();
                      }
                    }}
                    className="min-w-0 flex-1"
                    placeholder={searchBy === "Mobile" ? "Mobile number" : "Name"}
                  />
                  {searchBy === "Name/Code" ? (
                    <Input
                      value={searchCode}
                      onChange={(e) => setSearchCode(e.target.value)}
                      className="w-24"
                      placeholder="Code"
                    />
                  ) : null}
                  {lookupKey ? (
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-9 w-9 shrink-0 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
                      aria-label="Lookup"
                      onClick={() => setLookupOpen(true)}
                    >
                      <Search className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              </FieldWrapper>

              <div className="flex flex-wrap gap-2 lg:justify-end">
                <Button onClick={handleSearch} className="bg-sidebar text-sidebar-foreground hover:bg-sidebar/90">
                  Search
                </Button>
                <Button variant="destructive" onClick={handleRefresh}>
                  Refresh
                </Button>
                <Button onClick={handleReport} className="bg-emerald-600 text-white hover:bg-emerald-600/90">
                  Report
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <FieldWrapper label="Code">
                <Input value={details.code} onChange={(e) => patchDetails({ code: e.target.value })} />
              </FieldWrapper>
              <FieldWrapper label="Pin">
                <Input value={details.pin} onChange={(e) => patchDetails({ pin: e.target.value })} />
              </FieldWrapper>
              <FieldWrapper label="Name">
                <Input value={details.name} onChange={(e) => patchDetails({ name: e.target.value })} />
              </FieldWrapper>
              <FieldWrapper label="Telephone">
                <Input value={details.telephone} onChange={(e) => patchDetails({ telephone: e.target.value })} />
              </FieldWrapper>
              <FieldWrapper label="Person">
                <Input value={details.person} onChange={(e) => patchDetails({ person: e.target.value })} />
              </FieldWrapper>
              <FieldWrapper label="Fax">
                <Input value={details.fax} onChange={(e) => patchDetails({ fax: e.target.value })} />
              </FieldWrapper>
              <FieldWrapper label="Email">
                <Input value={details.email} onChange={(e) => patchDetails({ email: e.target.value })} />
              </FieldWrapper>
              <FieldWrapper label="Mobile">
                <Input value={details.mobile} onChange={(e) => patchDetails({ mobile: e.target.value })} />
              </FieldWrapper>
              <FieldWrapper label="Address" className="md:col-span-2 xl:col-span-2">
                <Textarea
                  value={details.address}
                  onChange={(e) => patchDetails({ address: e.target.value })}
                  rows={3}
                  className="min-h-[5.5rem] resize-y"
                />
              </FieldWrapper>
            </div>
          </div>
        </FormSection>

        <div className="mt-6 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <FieldWrapper label="Document Type" className="min-w-[12rem] sm:w-56">
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KYC_DOC_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldWrapper>

            <div className="flex flex-wrap items-end gap-2">
              <Button variant="secondary" onClick={handleChooseFile}>
                Choose
              </Button>
              <span className="pb-2 text-sm text-muted-foreground">
                {selectedFileName || "No file selected"}
              </span>
              <Button
                onClick={handleUpload}
                className="bg-amber-500 text-white hover:bg-amber-500/90"
              >
                Upload
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf,.jpg,.jpeg,.png"
                className="hidden"
                onChange={(e) => handleFileChange(e.target.files)}
              />
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[800px] caption-bottom text-sm">
              <TableHeader>
                <TableRow className="bg-sidebar hover:bg-sidebar">
                  {["Id", "File Name", "Entry Date", "Image Type", "Sent Date", "Sent Time", "Action"].map(
                    (head) => (
                      <TableHead key={head} className="whitespace-nowrap text-sidebar-foreground">
                        {head}
                      </TableHead>
                    ),
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {entityDocuments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      {selectedKey ? "No KYC documents uploaded" : "Search an entity to view documents"}
                    </TableCell>
                  </TableRow>
                ) : (
                  entityDocuments.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell>{doc.id}</TableCell>
                      <TableCell>{doc.fileName}</TableCell>
                      <TableCell>{doc.entryDate}</TableCell>
                      <TableCell>{doc.imageType}</TableCell>
                      <TableCell>{doc.sentDate || "—"}</TableCell>
                      <TableCell>{doc.sentTime || "—"}</TableCell>
                      <TableCell className="text-center">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive"
                          aria-label="Delete document"
                          onClick={() => removeDocument(doc.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </table>
          </div>
        </div>
      </Card>

      {lookupKey ? (
        <MasterLookupDialog
          open={lookupOpen}
          onOpenChange={setLookupOpen}
          lookup={lookupKey}
          returnField="code"
          onSelect={handleLookupSelect}
        />
      ) : null}
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="relative rounded-md border p-4 pt-6">
      <span className="absolute -top-2.5 left-3 rounded-full bg-sidebar px-3 py-0.5 text-sm font-medium text-sidebar-foreground">
        {title}
      </span>
      {children}
    </div>
  );
}
