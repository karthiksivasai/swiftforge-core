/**
 * Internal AWB Label generator (CourierWala-style layout).
 * Not from vendor API — SYSTEM document saved into shipment_documents.
 */
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

import {
  ensureInvoiceDocument,
  type InvoiceFormSlice,
} from "@/lib/transactions/invoiceGenerator";
import {
  ensureVendorDocumentPlaceholders,
  listShipmentDocuments,
  saveShipmentDocument,
} from "@/lib/transactions/shipmentDocuments";

export type AwbLabelParty = {
  accountNo?: string;
  name?: string;
  companyName?: string;
  contactName?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
  phone?: string;
  mobileNo?: string;
};

export type AwbLabelPiece = {
  length?: string;
  breadth?: string;
  height?: string;
  pieces?: string;
  volWeight?: string;
  actualWeight?: string;
  chargeWeight?: string;
};

export type AwbLabelInput = {
  awbNo: string;
  bookDate: string; // yyyy-mm-dd or dd/mm/yyyy
  bookTime: string; // HHmm
  originName: string;
  destinationName: string;
  isDocument?: boolean;
  clientCode?: string;
  clientName?: string;
  shipper: AwbLabelParty;
  consignee: AwbLabelParty;
  pieces?: AwbLabelPiece[];
  packages?: string;
  volWeight?: string;
  actualWeight?: string;
  chargeWeight?: string;
  paymentType?: string;
  vendorName?: string;
  serviceName?: string;
  content?: string;
  instruction?: string;
  totalCharges?: string;
  brandName?: string;
  brandTagline?: string;
};

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(d: string): string {
  if (!d) return "";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(d)) return d;
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return d;
}

function fmtTime(t: string): string {
  const digits = String(t ?? "").replace(/\D/g, "").padStart(4, "0").slice(0, 4);
  if (digits.length < 4) return t || "";
  return `${digits.slice(0, 2)}${digits.slice(2)}`;
}

function mark(on: boolean): string {
  return on ? "✗" : "";
}

function safeFixed(v: unknown, digits: number): string {
  const n = Number.parseFloat(String(v ?? ""));
  return (Number.isFinite(n) ? n : 0).toFixed(digits);
}

function partyBlock(p: AwbLabelParty): string {
  const lines = [
    p.companyName || p.name || p.contactName,
    p.contactName && p.contactName !== p.companyName ? p.contactName : "",
    p.address1,
    p.address2,
    [p.city, p.state].filter(Boolean).join(", "),
    p.country,
  ]
    .map((x) => String(x ?? "").trim())
    .filter(Boolean);
  return lines.map(esc).join("<br/>");
}

function dimensionsLine(pieces: AwbLabelPiece[] | undefined, fallbackPkg: string): string {
  if (!pieces?.length) return fallbackPkg ? `${fallbackPkg}` : "";
  return pieces
    .map((p) => {
      const l = p.length || "0";
      const w = p.breadth || "0";
      const h = p.height || "0";
      const n = p.pieces || "1";
      const vol = p.volWeight || "";
      return `${l}*${w}*${h}/${n}${vol ? `=${vol}` : ""}`;
    })
    .join(", ");
}

function paymentFlags(paymentType?: string) {
  const p = (paymentType || "").toUpperCase();
  return {
    cash: p.includes("CASH") || p === "PAID",
    cod: p.includes("COD") || p.includes("TO PAY") || p.includes("TOPAY"),
    credit: p.includes("CREDIT"),
    bank: p.includes("BANK"),
  };
}

/** Build print-ready HTML for the AWB label (CourierWala-style). */
export function buildAwbLabelHtml(input: AwbLabelInput): string {
  const awb = input.awbNo || "";
  const date = fmtDate(input.bookDate);
  const time = fmtTime(input.bookTime);
  const pay = paymentFlags(input.paymentType);
  const isDoc = Boolean(input.isDocument);
  const brand = input.brandName || "courierwala express";
  const tagline = input.brandTagline || "We bring India to your home.";
  const pkgs = input.packages || input.pieces?.[0]?.pieces || "1";
  const vol = input.volWeight || input.pieces?.[0]?.volWeight || "0.00";
  const act = input.actualWeight || "0.000";
  const chg = input.chargeWeight || act;
  const dims = dimensionsLine(input.pieces, pkgs);
  const shipperPhone = input.shipper.mobileNo || input.shipper.phone || "";
  const consigneePhone = input.consignee.mobileNo || input.consignee.phone || "";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<link href="https://fonts.googleapis.com/css2?family=Libre+Barcode+128&family=Libre+Barcode+39&display=swap" rel="stylesheet" />
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 12px;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 11px;
    color: #111;
    background: #fff;
  }
  .sheet {
    width: 780px;
    border: 1.5px solid #111;
    margin: 0 auto;
  }
  .row { display: flex; width: 100%; }
  .cell { border-right: 1px solid #111; border-bottom: 1px solid #111; padding: 4px 6px; }
  .cell:last-child { border-right: 0; }
  .hdr {
    background: #0b5c2e;
    color: #fff;
    font-weight: 700;
    font-size: 11px;
    padding: 3px 6px;
    letter-spacing: 0.02em;
  }
  .muted { color: #333; font-size: 10px; }
  .tiny { font-size: 9px; line-height: 1.25; }
  .bold { font-weight: 700; }
  .grow { flex: 1; }
  .barcode {
    font-family: "Libre Barcode 128", "Libre Barcode 39", monospace;
    font-size: 42px;
    line-height: 1;
    text-align: center;
    letter-spacing: 0;
  }
  .barcode-num { text-align: center; font-size: 12px; font-weight: 700; letter-spacing: 0.2em; margin-top: 2px; }
  .check { display: inline-block; width: 12px; height: 12px; border: 1px solid #111; text-align: center; line-height: 11px; font-size: 11px; margin-right: 4px; }
  table.wt { width: 100%; border-collapse: collapse; font-size: 10px; }
  table.wt th, table.wt td { border: 1px solid #111; padding: 3px 4px; text-align: center; }
  table.wt th { background: #f3f3f3; font-weight: 600; }
  .logo-title { font-size: 18px; font-weight: 800; color: #0b5c2e; line-height: 1.1; }
  .logo-tag { font-size: 9px; color: #444; }
  .box-nested { border: 1px solid #111; padding: 2px 4px; margin-top: 4px; display: inline-block; min-width: 140px; }
</style>
</head>
<body>
<div class="sheet" id="awb-label-root">
  <div class="row" style="min-height: 88px;">
    <div class="cell" style="width: 34%; border-bottom: 1px solid #111;">
      <div class="logo-title">${esc(brand)}</div>
      <div class="logo-tag">${esc(tagline)}</div>
    </div>
    <div class="cell" style="width: 36%; border-bottom: 1px solid #111;">
      <div class="barcode">*${esc(awb)}*</div>
      <div class="barcode-num">${esc(awb.split("").join(" "))}</div>
    </div>
    <div class="cell" style="width: 30%; border-bottom: 1px solid #111;">
      <div class="bold" style="font-size: 16px;">${esc(awb)}</div>
      <div style="margin-top: 6px;"><span class="muted">Origin:</span> <b>${esc(input.originName)}</b></div>
      <div><span class="muted">Destination:</span> <b>${esc(input.destinationName)}</b></div>
      <div style="margin-top: 8px;">
        <span class="check">${mark(isDoc)}</span> DOCUMENTS
        &nbsp;&nbsp;
        <span class="check">${mark(!isDoc)}</span> NON DOC.
      </div>
    </div>
  </div>

  <div class="row">
    <div class="cell" style="width: 50%; padding: 0;">
      <div class="hdr">1. FROM (SENDER)</div>
      <div style="padding: 6px;">
        <div><span class="muted">Account No.</span> <b>${esc(input.clientCode || input.shipper.accountNo)}</b></div>
        <div><span class="muted">Name</span> <b>${esc(input.clientName || input.shipper.name || input.shipper.companyName)}</b></div>
        <div class="muted" style="margin-top: 4px;">Individual/ Company Name &amp; Address</div>
        <div class="tiny" style="min-height: 54px;">${partyBlock(input.shipper)}</div>
        <div style="margin-top: 4px;"><span class="muted">Postal code</span> <b>${esc(input.shipper.pincode)}</b></div>
        <div class="box-nested"><span class="muted">PHONE</span> <b>${esc(shipperPhone)}</b></div>
      </div>
    </div>
    <div class="cell" style="width: 50%; padding: 0;">
      <div class="hdr">2. TO (RECEIVER)</div>
      <div style="padding: 6px;">
        <div><span class="muted">Account No.</span> <b>${esc(input.consignee.accountNo)}</b></div>
        <div><span class="muted">Name</span> <b>${esc(input.consignee.name || input.consignee.companyName || input.consignee.contactName)}</b></div>
        <div class="muted" style="margin-top: 4px;">Individual/ Company Name &amp; Address</div>
        <div class="tiny" style="min-height: 54px;">${partyBlock(input.consignee)}</div>
        <div style="margin-top: 4px;"><span class="muted">Postal code</span> <b>${esc(input.consignee.pincode)}</b></div>
        <div class="box-nested"><span class="muted">PHONE</span> <b>${esc(consigneePhone)}</b></div>
      </div>
    </div>
  </div>

  <div class="hdr">3. SHIPMENT INFORMATION</div>
  <div class="row">
    <div class="cell grow">
      <div class="muted">Dimensions (in cm) L*W*H</div>
      <div class="bold">${esc(dims)}</div>
      <table class="wt" style="margin-top: 6px;">
        <thead>
          <tr>
            <th>No. of package</th>
            <th>Total vol. Weight (kg)</th>
            <th>Total Weight</th>
            <th>Chargeable weight</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${esc(safeFixed(pkgs, 2))}</td>
            <td>${esc(safeFixed(vol, 2))}</td>
            <td>${esc(safeFixed(act, 3))}</td>
            <td>${esc(safeFixed(chg, 3))}</td>
          </tr>
        </tbody>
      </table>
      <div style="margin-top: 6px;" class="tiny">
        Return Service ______________ &nbsp;&nbsp; Insurance ______________
      </div>
      <div style="margin-top: 6px;">
        <span class="check">${mark(pay.cash)}</span> Cash
        &nbsp; <span class="check">${mark(pay.cod)}</span> COD
        &nbsp; <span class="check">${mark(pay.credit)}</span> Credit
        &nbsp; <span class="check">${mark(pay.bank)}</span> Bank
      </div>
    </div>
  </div>

  <div class="hdr">4. SERVICE DETAILS</div>
  <div class="row">
    <div class="cell" style="width: 50%;">
      <span class="muted">Vendor Name</span><br/><b>${esc(input.vendorName)}</b>
    </div>
    <div class="cell" style="width: 50%;">
      <span class="muted">Service</span><br/><b>${esc(input.serviceName)}</b>
    </div>
  </div>

  <div class="row">
    <div class="cell" style="width: 70%; padding: 0;">
      <div class="hdr">5. Description of Content ${isDoc ? "(Document)" : "(Non-Document)"}</div>
      <div style="padding: 6px; min-height: 48px;">${esc(input.content)}</div>
    </div>
    <div class="cell" style="width: 30%;">
      <div class="muted">Third Party A/c</div>
      <div style="min-height: 18px;"></div>
      <div class="muted" style="margin-top: 8px;">Total charges</div>
      <div class="bold">${esc(input.totalCharges || "0.00")}</div>
    </div>
  </div>

  <div class="hdr">6. SPECIAL INSTRUCTIONS</div>
  <div class="row">
    <div class="cell grow" style="min-height: 36px;">${esc(input.instruction)}</div>
  </div>

  <div class="hdr">7. PICK UP</div>
  <div class="row">
    <div class="cell" style="width: 50%;"><span class="muted">Courier Code</span></div>
    <div class="cell" style="width: 50%;"><span class="muted">Date / Time</span></div>
  </div>

  <div class="row">
    <div class="cell" style="width: 60%; padding: 0;">
      <div class="hdr">8. SHIPPER'S SIGNATURE &amp; AUTHORIZATION</div>
      <div class="tiny" style="padding: 6px;">
        I/We agree that courierwala express standard terms apply to this shipment and that this shipment does not contain any unauthorized or illegal goods. I authorize courierwala express as my agent for export/customs purposes.
        <div style="margin-top: 8px;"><b>DECLARED VALUE FOR CUSTOMS</b> ________________</div>
        <div style="margin-top: 10px;">Signature X ________________</div>
        <div style="margin-top: 6px;">Date <b>${esc(date)}</b> &nbsp;&nbsp; Time <b>${esc(time)}</b></div>
      </div>
    </div>
    <div class="cell" style="width: 40%; padding: 0;">
      <div class="hdr">9. RECEIVER</div>
      <div class="tiny" style="padding: 6px;">
        Received in good order &amp; condition. I agree to terms &amp; conditions of carriage.
        <div style="margin-top: 14px;">Name &amp; Signature / Stamp</div>
        <div style="margin-top: 28px;">________________________</div>
        <div style="margin-top: 8px;">Date <b>${esc(date)}</b> &nbsp;&nbsp; Time <b>${esc(time)}</b></div>
      </div>
    </div>
  </div>
</div>
</body>
</html>`;
}

function waitForFonts(): Promise<void> {
  if (typeof document !== "undefined" && document.fonts?.ready) {
    return document.fonts.ready.then(() => undefined);
  }
  return Promise.resolve();
}

/** Render AWB label HTML to PDF base64 (no data: prefix). */
export async function renderAwbLabelPdfBase64(input: AwbLabelInput): Promise<string> {
  const html = buildAwbLabelHtml(input);
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const styleHtml = parsed.querySelector("style")?.outerHTML ?? "";
  const rootHtml = parsed.querySelector("#awb-label-root")?.outerHTML ?? "";
  if (!rootHtml) throw new Error("AWB label root missing");

  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "0";
  host.style.width = "820px";
  host.style.background = "#fff";
  host.innerHTML = `${styleHtml}${rootHtml}`;
  document.body.appendChild(host);

  try {
    await waitForFonts();
    await new Promise((r) => setTimeout(r, 200));
    const root = host.querySelector("#awb-label-root") as HTMLElement | null;
    if (!root) throw new Error("AWB label root missing");

    const canvas = await html2canvas(root, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
    });
    const img = canvas.toDataURL("image/jpeg", 0.95);
    const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 18;
    const maxW = pageW - margin * 2;
    const maxH = pageH - margin * 2;
    const ratio = Math.min(maxW / canvas.width, maxH / canvas.height);
    const w = canvas.width * ratio;
    const h = canvas.height * ratio;
    const x = (pageW - w) / 2;
    const y = margin;
    pdf.addImage(img, "JPEG", x, y, w, h);
    const dataUri = pdf.output("datauristring") as string;
    const b64 = dataUri.includes(",") ? dataUri.split(",")[1]! : dataUri;
    return b64;
  } finally {
    host.remove();
  }
}

export type AwbLabelFormSlice = {
  awbNo: string;
  bookDate: string;
  bookTime: string;
  clientName: { code: string; name: string };
  shipper: {
    origin: { code: string; name: string };
    companyName: { code: string; name: string };
    contactName: string;
    address1: string;
    address2: string;
    city: string;
    state: string;
    pincode: string;
    country: string;
    telephone: string;
    mobileNo: string;
    email?: string;
    iecNo?: string;
    documentType?: string;
    documentNo?: string;
  };
  consignee: {
    origin: { code: string; name: string };
    companyName: { code: string; name: string };
    contactName: string;
    address1: string;
    address2: string;
    city: string;
    state: string;
    pincode: string;
    country: string;
    telephone: string;
    mobileNo: string;
    email?: string;
  };
  product: { code: string; name: string };
  vendor: { code: string; name: string };
  service: { code: string; name: string };
  pieces: string;
  piecesUnit: string;
  actualWeight: string;
  volWeight: string;
  chargeWeight: string;
  paymentType: string;
  content: string;
  instruction: string;
  piecesLines?: Array<{
    length: string;
    breadth: string;
    height: string;
    pieces: string;
    volWeight: string;
    actualWeightPerPc: string;
    chargeWeight: string;
  }>;
  chargeLines?: Array<{ total: string }>;
  invoiceNo?: string;
  forwardingNo?: string;
  flightNo?: string;
  shipmentCurrency?: string;
  proforma?: InvoiceFormSlice["proforma"];
  forwarding?: InvoiceFormSlice["forwarding"];
};

export function formToAwbLabelInput(form: AwbLabelFormSlice): AwbLabelInput {
  const unit = (form.piecesUnit || "").toUpperCase();
  const isDocument = unit === "DOX" || unit === "DOC" || unit === "DOCUMENT";
  const totals = (form.chargeLines ?? []).reduce(
    (sum, l) => sum + (Number.parseFloat(l.total) || 0),
    0,
  );
  const shipper = form.shipper ?? ({} as AwbLabelFormSlice["shipper"]);
  const consignee = form.consignee ?? ({} as AwbLabelFormSlice["consignee"]);
  const shipOrigin = shipper.origin ?? { code: "", name: "" };
  const consOrigin = consignee.origin ?? { code: "", name: "" };
  return {
    awbNo: form.awbNo || "",
    bookDate: form.bookDate || "",
    bookTime: form.bookTime || "",
    originName: shipOrigin.name || shipOrigin.code || shipper.city || "",
    destinationName: consOrigin.name || consignee.country || consOrigin.code || "",
    isDocument,
    clientCode: form.clientName?.code || "",
    clientName: form.clientName?.name || "",
    shipper: {
      accountNo: form.clientName?.code || "",
      name: form.clientName?.name || "",
      companyName: shipper.companyName?.name || "",
      contactName: shipper.contactName || "",
      address1: shipper.address1 || "",
      address2: shipper.address2 || "",
      city: shipper.city || "",
      state: shipper.state || "",
      pincode: shipper.pincode || "",
      country: shipper.country || "",
      phone: shipper.telephone || "",
      mobileNo: shipper.mobileNo || "",
    },
    consignee: {
      name: consignee.companyName?.name || consignee.contactName || "",
      companyName: consignee.companyName?.name || "",
      contactName: consignee.contactName || "",
      address1: consignee.address1 || "",
      address2: consignee.address2 || "",
      city: consignee.city || "",
      state: consignee.state || "",
      pincode: consignee.pincode || "",
      country: consignee.country || "",
      phone: consignee.telephone || "",
      mobileNo: consignee.mobileNo || "",
    },
    pieces: (form.piecesLines ?? []).map((p) => ({
      length: p.length,
      breadth: p.breadth,
      height: p.height,
      pieces: p.pieces,
      volWeight: p.volWeight,
      actualWeight: p.actualWeightPerPc,
      chargeWeight: p.chargeWeight,
    })),
    packages: form.pieces || "1",
    volWeight: form.volWeight || "0",
    actualWeight: form.actualWeight || "0",
    chargeWeight: form.chargeWeight || "0",
    paymentType: form.paymentType || "",
    vendorName: form.vendor?.name || form.vendor?.code || "",
    serviceName: form.service?.name || form.service?.code || "",
    content: form.content || "",
    instruction: form.instruction || "",
    totalCharges: totals > 0 ? totals.toFixed(2) : "0.00",
  };
}

export type EnsuredSystemDoc = {
  created: boolean;
  available: boolean;
  contentB64?: string | null;
  htmlPreview?: string | null;
  fileName?: string;
};

/** Build AWB label preview immediately; PDF persist runs in the background. */
export async function ensureAwbLabelDocument(args: {
  shipmentId: string;
  form: AwbLabelFormSlice;
  force?: boolean;
}): Promise<EnsuredSystemDoc> {
  const input = formToAwbLabelInput(args.form);
  if (!input.awbNo.trim()) {
    return { created: false, available: false };
  }

  const fileName = `AWB-${input.awbNo}.pdf`;
  const htmlPreview = buildAwbLabelHtml(input);

  // Never block the UI on html2canvas / RPC — preview must open instantly.
  void (async () => {
    try {
      if (!args.force) {
        const existing = await listShipmentDocuments(args.shipmentId);
        if (existing.find((d) => d.type === "AWB_LABEL")?.available) return;
      }
      const b64 = await renderAwbLabelPdfBase64(input);
      await saveShipmentDocument({
        shipmentId: args.shipmentId,
        documentType: "AWB_LABEL",
        source: "SYSTEM",
        fileName,
        contentB64: b64,
        mimeType: "application/pdf",
        status: "AVAILABLE",
        rawMeta: { generator: "internal-awb-label", version: 1 },
      });
    } catch {
      /* persist optional */
    }
  })();

  return {
    created: false,
    available: true,
    htmlPreview,
    fileName,
  };
}

function toInvoiceFormSlice(form: AwbLabelFormSlice): InvoiceFormSlice {
  return {
    awbNo: form.awbNo,
    bookDate: form.bookDate,
    invoiceNo: form.invoiceNo ?? "",
    forwardingNo: form.forwardingNo ?? "",
    flightNo: form.flightNo ?? "",
    shipmentCurrency: form.shipmentCurrency ?? "USD",
    pieces: form.pieces,
    piecesUnit: form.piecesUnit,
    actualWeight: form.actualWeight,
    volWeight: form.volWeight,
    chargeWeight: form.chargeWeight,
    shipper: {
      origin: form.shipper.origin,
      companyName: form.shipper.companyName,
      contactName: form.shipper.contactName,
      address1: form.shipper.address1,
      address2: form.shipper.address2,
      city: form.shipper.city,
      state: form.shipper.state,
      pincode: form.shipper.pincode,
      country: form.shipper.country,
      telephone: form.shipper.telephone,
      mobileNo: form.shipper.mobileNo,
      email: form.shipper.email ?? "",
      iecNo: form.shipper.iecNo ?? "",
      documentType: form.shipper.documentType ?? "",
      documentNo: form.shipper.documentNo ?? "",
    },
    consignee: {
      origin: form.consignee.origin,
      companyName: form.consignee.companyName,
      contactName: form.consignee.contactName,
      address1: form.consignee.address1,
      address2: form.consignee.address2,
      city: form.consignee.city,
      state: form.consignee.state,
      pincode: form.consignee.pincode,
      country: form.consignee.country,
      telephone: form.consignee.telephone,
      mobileNo: form.consignee.mobileNo,
      email: form.consignee.email ?? "",
    },
    vendor: form.vendor,
    piecesLines: form.piecesLines?.map((p) => ({
      length: p.length,
      breadth: p.breadth,
      height: p.height,
      pieces: p.pieces,
      volWeight: p.volWeight,
      actualWeightPerPc: p.actualWeightPerPc,
    })),
    proforma: form.proforma ?? {
      invoiceNo: "",
      invoiceDate: "",
      exportReason: "",
      termOfInvoice: "",
      currency: form.shipmentCurrency ?? "USD",
      lines: [],
    },
    forwarding: form.forwarding ?? {
      deliveryAwb: "",
      forwardingAwb: "",
    },
  };
}

/** Statuses that should have internal AWB Label + Invoice (not DRAFT/CANCELLED/VOID). */
export function shipmentNeedsSystemDocuments(status?: string | null): boolean {
  const s = String(status ?? "").toUpperCase();
  return Boolean(s) && s !== "DRAFT" && s !== "CANCELLED" && s !== "VOID";
}

/**
 * Vendor placeholders + internal AWB label + Invoice.
 * Authority Letter comes from vendor API only (not generated here).
 */
export async function ensureBookedShipmentDocuments(args: {
  shipmentId: string;
  form: AwbLabelFormSlice;
  vendor?: string | null;
}): Promise<{ awb: boolean; invoice: boolean }> {
  try {
    await ensureVendorDocumentPlaceholders({
      shipmentId: args.shipmentId,
      vendor: args.vendor ?? null,
    });
  } catch {
    /* vendor placeholders optional */
  }

  let awb = false;
  let invoice = false;
  const errors: string[] = [];

  try {
    const r = await ensureAwbLabelDocument({
      shipmentId: args.shipmentId,
      form: args.form,
    });
    awb = r.available;
  } catch (e) {
    errors.push(e instanceof Error ? e.message : "AWB Label failed");
  }

  try {
    const r = await ensureInvoiceDocument({
      shipmentId: args.shipmentId,
      form: toInvoiceFormSlice(args.form),
    });
    invoice = r.available;
  } catch (e) {
    errors.push(e instanceof Error ? e.message : "Invoice failed");
  }

  if (errors.length) {
    throw new Error(errors.join("; "));
  }
  return { awb, invoice };
}
