import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PcsDetailsDialog, type PiecesLine } from "@/components/pcs-details-dialog";
import { DataIoToolbar } from "@/components/data-io-toolbar";
import { FieldWrapper, MasterBreadcrumb } from "@/components/master-table-kit";
import { MasterLookupDialog } from "@/components/master-lookup-dialog";
import { type LookupKey, type LookupOption } from "@/lib/master-lookups";

type LookupPair = { code: string; name: string };
type CompareMode = "international" | "domestic";

type InternationalForm = {
  origin: LookupPair;
  vendor: LookupPair;
  product: LookupPair;
  service: LookupPair;
  destinationPinCode: string;
  destination: LookupPair;
  weight: string;
  volWeight: string;
};

type DomesticForm = {
  fromPinCode: string;
  toPinCode: string;
  product: LookupPair;
  origin: LookupPair;
  destination: LookupPair;
  destinationPinCode: string;
  serviceableFrom: string;
  serviceableTo: string;
  weight: string;
  odaFrom: string;
  odaTo: string;
  volWeight: string;
};

type RateResult = {
  id: string;
  vendor: string;
  product: string;
  service: string;
  baseRate: string;
  fuel: string;
  other: string;
  total: string;
};

const SERVICE_OPTIONS = [
  { code: "DOX", name: "DOX" },
  { code: "SPX", name: "SPX" },
  { code: "NDOX", name: "NDOX" },
] as const;

const DEMO_RATES: Omit<RateResult, "id">[] = [
  { vendor: "DTDC AUSTRALIA", product: "SPX", service: "SPX", baseRate: "1250.00", fuel: "187.50", other: "50.00", total: "1487.50" },
  { vendor: "DHL EXPRESS", product: "SPX", service: "SPX", baseRate: "1380.00", fuel: "207.00", other: "75.00", total: "1662.00" },
  { vendor: "UPS", product: "SPX", service: "SPX", baseRate: "1195.00", fuel: "179.25", other: "40.00", total: "1414.25" },
  { vendor: "FEDEX", product: "DOX", service: "DOX", baseRate: "980.00", fuel: "147.00", other: "35.00", total: "1162.00" },
];

const emptyPair = (): LookupPair => ({ code: "", name: "" });

const emptyInternational = (): InternationalForm => ({
  origin: { code: "HYD", name: "HYDERABAD" },
  vendor: emptyPair(),
  product: emptyPair(),
  service: emptyPair(),
  destinationPinCode: "",
  destination: emptyPair(),
  weight: "",
  volWeight: "",
});

const emptyDomestic = (): DomesticForm => ({
  fromPinCode: "",
  toPinCode: "",
  product: emptyPair(),
  origin: emptyPair(),
  destination: emptyPair(),
  destinationPinCode: "",
  serviceableFrom: "",
  serviceableTo: "",
  weight: "",
  odaFrom: "",
  odaTo: "",
  volWeight: "",
});

const parseNum = (value: string) => {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
};

export const Route = createFileRoute("/transaction/rate-compare/vendor-rate-compare")({
  head: () => ({
    meta: [
      { title: "Vendor Rate Compare — Transaction — Courier ERP" },
      { name: "description", content: "Compare vendor freight rates for international and domestic shipments." },
    ],
  }),
  component: VendorRateComparePage,
});

function VendorRateComparePage() {
  const [mode, setMode] = useState<CompareMode>("international");
  const [intlForm, setIntlForm] = useState<InternationalForm>(emptyInternational);
  const [domForm, setDomForm] = useState<DomesticForm>(emptyDomestic);
  const [results, setResults] = useState<RateResult[]>([]);
  const [pcsOpen, setPcsOpen] = useState(false);
  const [pcsLines, setPcsLines] = useState<PiecesLine[]>([]);

  const patchIntl = (patch: Partial<InternationalForm>) => setIntlForm((f) => ({ ...f, ...patch }));
  const patchDom = (patch: Partial<DomesticForm>) => setDomForm((f) => ({ ...f, ...patch }));

  const activeWeight = mode === "international" ? intlForm.weight : domForm.weight;
  const activeDestination =
    mode === "international" ? intlForm.destination.name || intlForm.destination.code : domForm.destination.name || domForm.destination.code;

  const resultRows = useMemo(() => {
    if (results.length === 0) return [];
    const weight = parseNum(activeWeight) || 1;
    return results.map((row) => {
      const total = parseNum(row.total) * (weight > 1 ? 1 + (weight - 1) * 0.08 : 1);
      return { ...row, total: total.toFixed(2) };
    });
  }, [results, activeWeight]);

  const validate = (): boolean => {
    if (mode === "international") {
      if (!intlForm.destination.code.trim() && !intlForm.destination.name.trim()) {
        toast.error("Destination is required");
        return false;
      }
      if (!intlForm.weight.trim()) {
        toast.error("Weight is required");
        return false;
      }
    } else if (!domForm.weight.trim()) {
      toast.error("Weight is required");
      return false;
    }
    return true;
  };

  const handleView = () => {
    if (!validate()) return;
    setResults(
      DEMO_RATES.map((row) => ({
        id: crypto.randomUUID(),
        ...row,
        product: intlForm.product.name || domForm.product.name || row.product,
        service: intlForm.service.name || row.service,
      })),
    );
    toast.success(`Rate comparison loaded for ${activeDestination || "selected route"}`);
  };

  const handleReset = () => {
    setIntlForm(emptyInternational());
    setDomForm(emptyDomestic());
    setResults([]);
    setPcsLines([]);
    toast.success("Form reset");
  };

  const applyPcsDetails = (volWeight: string, lines: PiecesLine[]) => {
    setPcsLines(lines);
    if (lines.length === 0) return;
    if (mode === "international") {
      patchIntl({ volWeight });
    } else {
      patchDom({ volWeight });
    }
    toast.success(`Volumetric weight: ${volWeight}`);
  };

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <MasterBreadcrumb trail={["Transaction", "Rate Compare", "Vendor Rate Compare"]} />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Vendor Rate Compare</h1>
        <p className="text-sm text-muted-foreground">
          Compare vendor freight rates for international and domestic lanes.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["international", "domestic"] as const).map((key) => (
          <Button
            key={key}
            type="button"
            size="sm"
            variant={mode === key ? "default" : "outline"}
            className={
              mode === key
                ? "rounded-full bg-emerald-600 px-6 text-white hover:bg-emerald-600/90"
                : "rounded-full px-6 capitalize"
            }
            onClick={() => {
              setMode(key);
              setResults([]);
            }}
          >
            {key}
          </Button>
        ))}
      </div>

      <Card className="min-w-0 overflow-hidden border p-4 md:p-6">
        {mode === "international" ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <FieldWrapper label="Origin">
              <LookupPairInput lookup="destination" value={intlForm.origin} onChange={(origin) => patchIntl({ origin })} />
            </FieldWrapper>
            <FieldWrapper label="Vendor">
              <LookupPairInput lookup="vendor" value={intlForm.vendor} onChange={(vendor) => patchIntl({ vendor })} />
            </FieldWrapper>
            <FieldWrapper label="Product">
              <LookupPairInput lookup="product" value={intlForm.product} onChange={(product) => patchIntl({ product })} />
            </FieldWrapper>
            <FieldWrapper label="Service">
              <ServiceLookupInput value={intlForm.service} onChange={(service) => patchIntl({ service })} />
            </FieldWrapper>
            <FieldWrapper label="Destination PinCode">
              <Input
                value={intlForm.destinationPinCode}
                onChange={(e) => patchIntl({ destinationPinCode: e.target.value })}
              />
            </FieldWrapper>
            <FieldWrapper label="Destination" required>
              <LookupPairInput
                lookup="destination"
                value={intlForm.destination}
                onChange={(destination) => patchIntl({ destination })}
              />
            </FieldWrapper>
            <FieldWrapper label="Weight" required>
              <Input
                value={intlForm.weight}
                onChange={(e) => patchIntl({ weight: e.target.value })}
                inputMode="decimal"
              />
            </FieldWrapper>
            <FieldWrapper label="Vol Weight">
              <Input
                value={intlForm.volWeight}
                onChange={(e) => patchIntl({ volWeight: e.target.value })}
                inputMode="decimal"
              />
            </FieldWrapper>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <FieldWrapper label="From PinCode">
              <Input value={domForm.fromPinCode} onChange={(e) => patchDom({ fromPinCode: e.target.value })} />
            </FieldWrapper>
            <FieldWrapper label="To PinCode">
              <Input value={domForm.toPinCode} onChange={(e) => patchDom({ toPinCode: e.target.value })} />
            </FieldWrapper>
            <FieldWrapper label="Product">
              <LookupPairInput lookup="product" value={domForm.product} onChange={(product) => patchDom({ product })} />
            </FieldWrapper>
            <FieldWrapper label="Origin">
              <LookupPairInput lookup="destination" value={domForm.origin} onChange={(origin) => patchDom({ origin })} />
            </FieldWrapper>
            <FieldWrapper label="Destination">
              <LookupPairInput
                lookup="destination"
                value={domForm.destination}
                onChange={(destination) => patchDom({ destination })}
              />
            </FieldWrapper>
            <FieldWrapper label="Destination PinCode">
              <Input
                value={domForm.destinationPinCode}
                onChange={(e) => patchDom({ destinationPinCode: e.target.value })}
              />
            </FieldWrapper>
            <FieldWrapper label="Serviceable">
              <Input
                value={domForm.serviceableFrom}
                onChange={(e) => patchDom({ serviceableFrom: e.target.value })}
              />
            </FieldWrapper>
            <FieldWrapper label="Serviceable">
              <Input value={domForm.serviceableTo} onChange={(e) => patchDom({ serviceableTo: e.target.value })} />
            </FieldWrapper>
            <FieldWrapper label="Weight" required>
              <Input
                value={domForm.weight}
                onChange={(e) => patchDom({ weight: e.target.value })}
                inputMode="decimal"
              />
            </FieldWrapper>
            <FieldWrapper label="ODA">
              <Input value={domForm.odaFrom} onChange={(e) => patchDom({ odaFrom: e.target.value })} />
            </FieldWrapper>
            <FieldWrapper label="ODA">
              <Input value={domForm.odaTo} onChange={(e) => patchDom({ odaTo: e.target.value })} />
            </FieldWrapper>
            <FieldWrapper label="Vol Weight">
              <Input
                value={domForm.volWeight}
                onChange={(e) => patchDom({ volWeight: e.target.value })}
                inputMode="decimal"
              />
            </FieldWrapper>
          </div>
        )}

        <div className="mt-4">
          <Button
            type="button"
            size="sm"
            className="bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
            onClick={() => setPcsOpen(true)}
          >
            <Plus className="mr-1 h-4 w-4" />
            Volumetric
          </Button>
        </div>

        {resultRows.length > 0 ? (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[880px] caption-bottom text-sm">
              <TableHeader>
                <TableRow className="bg-sidebar hover:bg-sidebar">
                  <TableHead className="text-sidebar-foreground">Vendor</TableHead>
                  <TableHead className="text-sidebar-foreground">Product</TableHead>
                  <TableHead className="text-sidebar-foreground">Service</TableHead>
                  <TableHead className="text-sidebar-foreground">Base Rate</TableHead>
                  <TableHead className="text-sidebar-foreground">Fuel</TableHead>
                  <TableHead className="text-sidebar-foreground">Other</TableHead>
                  <TableHead className="text-sidebar-foreground">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resultRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.vendor}</TableCell>
                    <TableCell>{row.product}</TableCell>
                    <TableCell>{row.service}</TableCell>
                    <TableCell className="text-right">{row.baseRate}</TableCell>
                    <TableCell className="text-right">{row.fuel}</TableCell>
                    <TableCell className="text-right">{row.other}</TableCell>
                    <TableCell className="text-right font-medium">{row.total}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </table>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button onClick={handleView} className="min-w-24 bg-emerald-600 text-white hover:bg-emerald-600/90">
            View
          </Button>
          <DataIoToolbar
            export={{
              filename: "vendor-rate-compare",
              title: "Vendor Rate Compare",
              columns: [
                { key: "vendor", header: "Vendor" },
                { key: "product", header: "Product" },
                { key: "service", header: "Service" },
                { key: "baseRate", header: "Base Rate" },
                { key: "fuel", header: "Fuel" },
                { key: "other", header: "Other" },
                { key: "total", header: "Total" },
              ],
              getRows: () => {
                const source = results.length > 0 ? results : DEMO_RATES;
                return source.map((row) => ({
                  vendor: row.vendor,
                  product: row.product,
                  service: row.service,
                  baseRate: row.baseRate,
                  fuel: row.fuel,
                  other: row.other,
                  total: row.total,
                }));
              },
            }}
            disabled={results.length === 0}
          />
          <Button variant="destructive" onClick={handleReset} className="min-w-24">
            Reset
          </Button>
        </div>
      </Card>

      <PcsDetailsDialog
        open={pcsOpen}
        onOpenChange={setPcsOpen}
        initialLines={pcsLines}
        onApply={applyPcsDetails}
      />
    </div>
  );
}

function LookupPairInput({
  value,
  onChange,
  lookup,
}: {
  value: LookupPair;
  onChange: (v: LookupPair) => void;
  lookup: LookupKey;
}) {
  const [lookupOpen, setLookupOpen] = useState(false);

  return (
    <>
      <div className="flex gap-1">
        <Input
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          className="min-w-0 flex-1"
          placeholder="Name"
        />
        <Input
          value={value.code}
          onChange={(e) => onChange({ ...value, code: e.target.value })}
          className="w-20"
          placeholder="Code"
        />
        <Button
          size="icon"
          variant="outline"
          className="h-9 w-9 shrink-0 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
          aria-label="Search"
          onClick={() => setLookupOpen(true)}
        >
          <Search className="h-4 w-4" />
        </Button>
      </div>
      <MasterLookupDialog
        open={lookupOpen}
        onOpenChange={setLookupOpen}
        lookup={lookup}
        returnField="code"
        onSelect={(_v, option: LookupOption) => onChange({ code: option.code, name: option.name })}
      />
    </>
  );
}

function ServiceLookupInput({
  value,
  onChange,
}: {
  value: LookupPair;
  onChange: (v: LookupPair) => void;
}) {
  const [lookupOpen, setLookupOpen] = useState(false);

  return (
    <>
      <div className="flex gap-1">
        <Input
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          className="min-w-0 flex-1"
          placeholder="Name"
        />
        <Input
          value={value.code}
          onChange={(e) => onChange({ ...value, code: e.target.value })}
          className="w-20"
          placeholder="Code"
        />
        <Button
          size="icon"
          variant="outline"
          className="h-9 w-9 shrink-0 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
          aria-label="Search service"
          onClick={() => setLookupOpen(true)}
        >
          <Search className="h-4 w-4" />
        </Button>
      </div>
      {lookupOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-md border bg-card p-4 shadow-lg">
            <p className="mb-3 text-sm font-medium">Select Service</p>
            <div className="space-y-1">
              {SERVICE_OPTIONS.map((service) => (
                <button
                  key={service.code}
                  type="button"
                  className="flex w-full rounded px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    onChange({ code: service.code, name: service.name });
                    setLookupOpen(false);
                  }}
                >
                  {service.name}
                </button>
              ))}
            </div>
            <Button variant="ghost" className="mt-3 w-full" onClick={() => setLookupOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
