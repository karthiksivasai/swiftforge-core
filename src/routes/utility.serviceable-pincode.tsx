import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

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
import { MasterBreadcrumb } from "@/components/master-table-kit";
import { useAuth } from "@/lib/auth";
import { toErrorMessage } from "@/lib/masters/screen";
import { canDo, UTILITY_SERVICEABLE_PINCODE_PERMISSION } from "@/lib/permissions";
import {
  checkServiceablePincode,
  searchServiceablePincode,
} from "@/lib/serviceable-pincode/resources";
import { serviceableCheckSchema, serviceableSearchSchema } from "@/lib/serviceable-pincode/schemas";
import type {
  ServiceableCheckResult,
  ServiceablePincodeRow,
} from "@/lib/serviceable-pincode/types";

type SearchMode = "pincode" | "name";

const DEMO_ROWS: ServiceablePincodeRow[] = [
  {
    id: "1",
    pin_code: "560001",
    pin_name: "Bangalore MG",
    is_serviceable: true,
    is_oda: true,
    pickup_available: false,
    destination_id: null,
    destination_code: "BLR",
    destination_name: "Bangalore",
    destination_status: "ACTIVE",
    zone_id: null,
    zone_code: "Z1",
    zone_name: "Zone 1",
    branch_id: null,
    service_center_code: "HO",
    service_center_name: "Head Office",
    vendor_id: null,
    vendor_code: "VND1",
    vendor_name: "Vendor One",
    state_code: "KA",
    state_name: "Karnataka",
  },
  {
    id: "2",
    pin_code: "500001",
    pin_name: "Hyderabad HO",
    is_serviceable: true,
    is_oda: false,
    pickup_available: true,
    destination_id: null,
    destination_code: "HYD",
    destination_name: "Hyderabad",
    destination_status: "ACTIVE",
    zone_id: null,
    zone_code: "Z2",
    zone_name: "Zone 2",
    branch_id: null,
    service_center_code: "HO",
    service_center_name: "Head Office",
    vendor_id: null,
    vendor_code: null,
    vendor_name: null,
    state_code: "TS",
    state_name: "Telangana",
  },
];

export const Route = createFileRoute("/utility/serviceable-pincode")({
  head: () => ({
    meta: [
      { title: "Serviceable Pincode — Utility — Courier ERP" },
      { name: "description", content: "Search serviceable pincodes by pincode or name." },
    ],
  }),
  component: ServiceablePincodePage,
});

function ServiceablePincodePage() {
  const { isAuthenticated: authed, permissions } = useAuth();
  const [mode, setMode] = useState<SearchMode>("pincode");
  const [query, setQuery] = useState("");
  const [originPin, setOriginPin] = useState("");
  const [destPin, setDestPin] = useState("");
  const [productCode, setProductCode] = useState("");
  const [shipmentType, setShipmentType] = useState("");
  const [rows, setRows] = useState<ServiceablePincodeRow[]>([]);
  const [checkResult, setCheckResult] = useState<ServiceableCheckResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);

  const canSearch = !authed || canDo(permissions, UTILITY_SERVICEABLE_PINCODE_PERMISSION, "search");

  const handleSearch = async () => {
    if (!canSearch) return toast.error("Permission denied");
    try {
      const parsed = serviceableSearchSchema.parse({ query, mode });
      setBusy(true);
      setCheckResult(null);
      if (!authed) {
        const q = parsed.query.toLowerCase();
        const filtered = DEMO_ROWS.filter((row) =>
          mode === "pincode"
            ? row.pin_code.toLowerCase().includes(q)
            : [row.pin_name, row.destination_name, row.destination_code]
                .filter(Boolean)
                .some((v) => String(v).toLowerCase().includes(q)),
        );
        setRows(filtered);
        setSearched(true);
        toast.success(`Found ${filtered.length} result(s) (demo)`);
        return;
      }
      const result = await searchServiceablePincode({
        query: parsed.query,
        mode: parsed.mode,
      });
      setRows(result.rows);
      setSearched(true);
      toast.success(`Found ${result.total} result(s)`);
    } catch (error) {
      toast.error(toErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const handleCheck = async () => {
    if (!canSearch) return toast.error("Permission denied");
    try {
      const parsed = serviceableCheckSchema.parse({
        origin_pincode: originPin || query,
        destination_pincode: destPin || query,
        product_code: productCode || null,
        shipment_type: shipmentType === "DOX" || shipmentType === "NDOX" ? shipmentType : null,
      });
      setBusy(true);
      if (!authed) {
        const demo: ServiceableCheckResult = {
          serviceable: true,
          failure_reason: null,
          origin_pincode: parsed.origin_pincode,
          destination_pincode: parsed.destination_pincode,
          origin_zone: { id: "z2", code: "Z2", name: "Zone 2" },
          destination_zone: { id: "z1", code: "Z1", name: "Zone 1" },
          destination_master: {
            id: "d1",
            code: "BLR",
            name: "Bangalore",
            status: "ACTIVE",
          },
          service_center: { id: "b1", code: "HO", name: "Head Office" },
          product: parsed.product_code
            ? {
                id: "p1",
                code: parsed.product_code,
                name: parsed.product_code,
                shipment_type: parsed.shipment_type ?? "NDOX",
                status: "ACTIVE",
              }
            : null,
          shipment_type: parsed.shipment_type ?? null,
          service: null,
          routing: [{ service: "EXPRESS", vendor_code: "VND1" }],
          is_oda: true,
          pickup_available: true,
        };
        setCheckResult(demo);
        toast.success("Serviceable (demo)");
        return;
      }
      const result = await checkServiceablePincode({
        originPincode: parsed.origin_pincode,
        destinationPincode: parsed.destination_pincode,
        productCode: parsed.product_code,
        shipmentType: parsed.shipment_type,
      });
      setCheckResult(result);
      toast.success(result.serviceable ? "Serviceable" : "Not serviceable");
    } catch (error) {
      toast.error(toErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const handleReset = () => {
    setMode("pincode");
    setQuery("");
    setOriginPin("");
    setDestPin("");
    setProductCode("");
    setShipmentType("");
    setRows([]);
    setCheckResult(null);
    setSearched(false);
    toast.success("Form reset");
  };

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <MasterBreadcrumb trail={["Utility", "Serviceable Pincode"]} />

      <Card className="min-w-0 overflow-hidden border p-4 md:p-6">
        <div className="mb-4">
          <span className="inline-flex rounded-full bg-sidebar px-3 py-0.5 text-sm font-medium text-sidebar-foreground">
            Serviceable Pincode
          </span>
        </div>

        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <div className="flex shrink-0 gap-1">
            <Button
              type="button"
              size="sm"
              variant={mode === "pincode" ? "default" : "outline"}
              className={
                mode === "pincode" ? "bg-emerald-600 text-white hover:bg-emerald-600/90" : ""
              }
              onClick={() => setMode("pincode")}
            >
              By Pincode
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "name" ? "default" : "outline"}
              className={mode === "name" ? "bg-emerald-600 text-white hover:bg-emerald-600/90" : ""}
              onClick={() => setMode("name")}
            >
              By Name
            </Button>
          </div>

          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="md:max-w-sm"
            placeholder={mode === "pincode" ? "Enter pincode" : "Enter name"}
          />

          <div className="flex gap-3">
            <Button
              disabled={busy || !canSearch}
              onClick={() => void handleSearch()}
              className="min-w-24 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
            >
              Search
            </Button>
            <Button variant="destructive" onClick={handleReset} className="min-w-24">
              Reset
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 border-t pt-4 md:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs">
            Origin pincode
            <Input
              value={originPin}
              onChange={(e) => setOriginPin(e.target.value)}
              className="h-9"
              placeholder="Optional for check"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Destination pincode
            <Input
              value={destPin}
              onChange={(e) => setDestPin(e.target.value)}
              className="h-9"
              placeholder="Optional for check"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Product code
            <Input
              value={productCode}
              onChange={(e) => setProductCode(e.target.value)}
              className="h-9"
              placeholder="Optional"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Shipment type
            <Input
              value={shipmentType}
              onChange={(e) => setShipmentType(e.target.value.toUpperCase())}
              className="h-9"
              placeholder="DOX / NDOX"
            />
          </label>
        </div>
        <div className="mt-3 flex justify-end">
          <Button
            disabled={busy || !canSearch}
            onClick={() => void handleCheck()}
            className="h-8 rounded-full bg-emerald-600 px-6 text-white hover:bg-emerald-700"
          >
            Check Serviceability
          </Button>
        </div>
      </Card>

      {checkResult ? (
        <Card className="min-w-0 border p-4 md:p-6">
          <h2 className="mb-2 text-lg font-semibold">
            {checkResult.serviceable ? "Serviceable" : "Not serviceable"}
          </h2>
          {checkResult.failure_reason ? (
            <p className="mb-3 text-sm text-destructive">{checkResult.failure_reason}</p>
          ) : null}
          <div className="grid gap-2 text-sm md:grid-cols-2">
            <div>Origin zone: {checkResult.origin_zone?.code ?? "—"}</div>
            <div>Destination zone: {checkResult.destination_zone?.code ?? "—"}</div>
            <div>
              Destination:{" "}
              {checkResult.destination_master
                ? `${checkResult.destination_master.code} — ${checkResult.destination_master.name}`
                : "—"}
            </div>
            <div>
              Service center:{" "}
              {checkResult.service_center
                ? `${checkResult.service_center.code} — ${checkResult.service_center.name}`
                : "—"}
            </div>
            <div>ODA: {checkResult.is_oda ? "Yes" : "No"}</div>
            <div>Routing rows: {checkResult.routing.length}</div>
          </div>
        </Card>
      ) : null}

      {searched ? (
        <Card className="min-w-0 overflow-hidden border p-4 md:p-6">
          <Table>
            <TableHeader>
              <TableRow className="bg-sidebar hover:bg-sidebar">
                {[
                  "Pincode",
                  "Name",
                  "Destination",
                  "Zone",
                  "Service Center",
                  "Serviceable",
                  "ODA",
                ].map((h) => (
                  <TableHead key={h} className="text-sidebar-foreground">
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground">
                    No results
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id} className="odd:bg-muted/50">
                    <TableCell>{row.pin_code}</TableCell>
                    <TableCell>{row.pin_name ?? "—"}</TableCell>
                    <TableCell>
                      {row.destination_code
                        ? `${row.destination_code} — ${row.destination_name ?? ""}`
                        : "—"}
                    </TableCell>
                    <TableCell>{row.zone_code ?? "—"}</TableCell>
                    <TableCell>
                      {row.service_center_code
                        ? `${row.service_center_code} — ${row.service_center_name ?? ""}`
                        : "—"}
                    </TableCell>
                    <TableCell>{row.is_serviceable ? "Yes" : "No"}</TableCell>
                    <TableCell>{row.is_oda ? "Yes" : "No"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      ) : null}
    </div>
  );
}
