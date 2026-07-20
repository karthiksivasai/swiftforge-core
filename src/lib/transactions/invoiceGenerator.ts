/**
 * Internal commercial Invoice generator (CourierWala-style layout).
 * Not from vendor API — SYSTEM document saved into shipment_documents.
 */
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

import {
  listShipmentDocuments,
  saveShipmentDocument,
} from "@/lib/transactions/shipmentDocuments";

export type InvoiceParty = {
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
  email?: string;
  documentType?: string;
  documentNo?: string;
  iecNo?: string;
};

export type InvoiceLine = {
  boxNo?: string;
  description?: string;
  hsCode?: string;
  quantity?: string;
  unit?: string;
  rate?: string;
  amount?: string;
  weight?: string;
};

export type InvoicePiece = {
  length?: string;
  breadth?: string;
  height?: string;
  pieces?: string;
  volWeight?: string;
  actualWeight?: string;
};

export type InvoiceInput = {
  awbNo: string;
  invoiceNo: string;
  invoiceDate: string;
  exportersRef?: string;
  trackingNo?: string;
  deliveryAwb?: string;
  pcs?: string;
  pcsUnit?: string;
  shipper: InvoiceParty;
  consignee: InvoiceParty;
  piecesCount?: string;
  actualWeight?: string;
  volWeight?: string;
  chargeWeight?: string;
  gstNo?: string;
  adNo?: string;
  iecNo?: string;
  lutNo?: string;
  placeOfLoading?: string;
  countryOfOrigin?: string;
  countryOfDestination?: string;
  portOfDischarge?: string;
  finalDestination?: string;
  termsOfDelivery?: string;
  otherReference?: string;
  currency?: string;
  lines: InvoiceLine[];
  pieces?: InvoicePiece[];
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

function num(v: unknown, digits = 2): string {
  const n = Number.parseFloat(String(v ?? ""));
  if (!Number.isFinite(n)) return (0).toFixed(digits);
  return n.toFixed(digits);
}

const ONES = [
  "",
  "ONE",
  "TWO",
  "THREE",
  "FOUR",
  "FIVE",
  "SIX",
  "SEVEN",
  "EIGHT",
  "NINE",
  "TEN",
  "ELEVEN",
  "TWELVE",
  "THIRTEEN",
  "FOURTEEN",
  "FIFTEEN",
  "SIXTEEN",
  "SEVENTEEN",
  "EIGHTEEN",
  "NINETEEN",
];
const TENS = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];

function underThousand(n: number): string {
  if (n < 20) return ONES[n] ?? "";
  if (n < 100) {
    const t = TENS[Math.floor(n / 10)] ?? "";
    const o = ONES[n % 10] ?? "";
    return [t, o].filter(Boolean).join(" ");
  }
  const h = ONES[Math.floor(n / 100)] ?? "";
  const rest = underThousand(n % 100);
  return [h, "HUNDRED", rest].filter(Boolean).join(" ");
}

/** Simple amount-in-words for invoice footer (USD/INR style). */
export function amountInWords(amount: number, currency = "USD"): string {
  const cur = (currency || "USD").toUpperCase();
  const whole = Math.floor(Math.abs(amount));
  const cents = Math.round((Math.abs(amount) - whole) * 100);
  const major =
    cur === "INR" || cur === "RS" || cur === "₹"
      ? "RUPEES"
      : cur === "EUR"
        ? "EURO"
        : cur === "GBP"
          ? "POUNDS"
          : `${cur}`;
  const minor =
    cur === "INR" || cur === "RS" || cur === "₹"
      ? "PAISE"
      : cur === "EUR"
        ? "CENTS"
        : cur === "GBP"
          ? "PENCE"
          : "CENT";

  if (whole === 0 && cents === 0) return `${major} ZERO ONLY`;

  const parts: string[] = [];
  const millions = Math.floor(whole / 1_000_000);
  const thousands = Math.floor((whole % 1_000_000) / 1000);
  const rem = whole % 1000;
  if (millions) parts.push(`${underThousand(millions)} MILLION`);
  if (thousands) parts.push(`${underThousand(thousands)} THOUSAND`);
  if (rem) parts.push(underThousand(rem));
  const wholeWords = parts.join(" ") || "ZERO";

  if (cents <= 0) return `${major} ${wholeWords} ONLY`;
  const centWords = underThousand(cents) || "ZERO";
  const minorLabel = cents === 1 ? minor.replace(/S$/, "") : minor;
  return `${major} ${wholeWords} AND ${centWords} ${minorLabel} ONLY`;
}

function partyHtml(p: InvoiceParty, opts?: { showDoc?: boolean }): string {
  const name = p.companyName || p.name || p.contactName || "";
  const contact =
    p.contactName && p.contactName !== name && p.contactName !== p.companyName
      ? p.contactName
      : "";
  const lines = [
    name,
    contact,
    p.address1,
    p.address2,
    [p.city, p.state, p.pincode].filter(Boolean).join(", "),
    p.country,
  ]
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .map(esc);

  const phone = p.mobileNo || p.phone || "";
  if (opts?.showDoc && p.documentNo) {
    const label = (p.documentType || "AADHAAR").toUpperCase().includes("AADHAAR")
      ? "Aadhaar Number"
      : p.documentType || "Document No";
    lines.push(`${esc(label)}: ${esc(p.documentNo)}`);
  }
  if (phone) lines.push(`Phone: ${esc(phone)}`);
  if (p.email) lines.push(`Email: ${esc(p.email)}`);
  return lines.join("<br/>");
}

function groupLinesByBox(lines: InvoiceLine[]) {
  const map = new Map<string, InvoiceLine[]>();
  for (const line of lines) {
    const key = String(line.boxNo || "1").trim() || "1";
    const arr = map.get(key) ?? [];
    arr.push(line);
    map.set(key, arr);
  }
  return map;
}

function boxDims(pieces: InvoicePiece[] | undefined, boxNo: string, lineWeight?: string) {
  const idx = Math.max(0, (Number.parseInt(boxNo, 10) || 1) - 1);
  const p = pieces?.[idx] ?? pieces?.[0];
  if (!p) {
    return { dims: "", weight: lineWeight || "" };
  }
  const l = num(p.length, 3);
  const w = num(p.breadth, 3);
  const h = num(p.height, 3);
  const wt = p.volWeight || p.actualWeight || lineWeight || "";
  return { dims: `${l} X ${w} X ${h}`, weight: wt ? num(wt, 2) : "" };
}

/** Build print-ready HTML for the commercial invoice. */
export function buildInvoiceHtml(input: InvoiceInput): string {
  const awb = input.awbNo || "";
  const invNo = input.invoiceNo || "01";
  const invDate = fmtDate(input.invoiceDate);
  const currency = (input.currency || "USD").toUpperCase();
  const pcsLabel = `${input.pcs || input.piecesCount || "1"} ${input.pcsUnit || "PKT"}`;
  const grouped = groupLinesByBox(input.lines.length ? input.lines : []);
  const total = input.lines.reduce(
    (sum, l) => sum + (Number.parseFloat(String(l.amount)) || 0),
    0,
  );
  const words = amountInWords(total, currency);

  let sr = 0;
  const bodyRows: string[] = [];
  if (grouped.size === 0) {
    bodyRows.push(`
      <tr>
        <td colspan="7" style="text-align:center;padding:16px;color:#666;">No proforma lines</td>
      </tr>`);
  } else {
    for (const [boxNo, lines] of grouped) {
      const { dims, weight } = boxDims(input.pieces, boxNo, lines[0]?.weight);
      bodyRows.push(`
        <tr class="box-hdr">
          <td colspan="6" class="left">BOX NO.: ${esc(boxNo)}${dims ? ` = ${esc(dims)}` : ""}</td>
          <td class="right">${esc(weight)}</td>
        </tr>`);
      for (const line of lines) {
        sr += 1;
        bodyRows.push(`
          <tr>
            <td class="center">${sr}</td>
            <td class="center">${esc(boxNo)}</td>
            <td class="left">${esc(line.description)}</td>
            <td class="center">${esc(line.hsCode)}</td>
            <td class="center">${esc(line.quantity)} ${esc(line.unit || "PCS")}</td>
            <td class="right">${esc(num(line.rate, 2))}</td>
            <td class="right">${esc(num(line.amount, 2))}</td>
          </tr>`);
      }
    }
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 10px;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10px;
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
  .title {
    text-align: center;
    font-size: 18px;
    font-weight: 800;
    letter-spacing: 0.08em;
    padding: 6px 8px;
    border-bottom: 1px solid #111;
    position: relative;
  }
  .title .awb-side {
    position: absolute;
    left: 8px;
    top: 8px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0;
  }
  .label { font-size: 9px; font-weight: 700; text-transform: uppercase; color: #222; }
  .val { font-size: 10px; font-weight: 600; text-transform: uppercase; }
  .tiny { font-size: 9px; line-height: 1.35; text-transform: uppercase; }
  table.meta, table.wt, table.goods {
    width: 100%;
    border-collapse: collapse;
    font-size: 10px;
  }
  table.meta td {
    border: 1px solid #111;
    padding: 3px 5px;
    vertical-align: top;
  }
  table.meta td.k { width: 42%; font-weight: 700; font-size: 9px; }
  table.wt th, table.wt td, table.goods th, table.goods td {
    border: 1px solid #111;
    padding: 3px 4px;
  }
  table.wt th, table.goods th {
    background: #f2f2f2;
    font-weight: 700;
    font-size: 9px;
    text-align: center;
  }
  .center { text-align: center; }
  .right { text-align: right; }
  .left { text-align: left; }
  tr.box-hdr td { background: #f7f7f7; font-weight: 700; }
  .grow { flex: 1; }
  .no-bottom { border-bottom: 0; }
</style>
</head>
<body>
<div class="sheet" id="invoice-root">
  <div class="title">
    <span class="awb-side">${esc(awb)}</span>
    INVOICE
  </div>

  <div class="row">
    <div class="cell" style="width: 55%; min-height: 110px;">
      <div class="label">Shipper:</div>
      <div class="tiny" style="margin-top: 4px;">${partyHtml(input.shipper, { showDoc: true })}</div>
    </div>
    <div class="cell" style="width: 45%; padding: 0;">
      <table class="meta">
        <tr><td class="k">Invoice No</td><td>${esc(invNo)}</td></tr>
        <tr><td class="k">Date</td><td>${esc(invDate)}</td></tr>
        <tr><td class="k">Exporter's Ref</td><td>${esc(input.exportersRef)}</td></tr>
        <tr><td class="k">Tracking No</td><td>${esc(input.trackingNo)}</td></tr>
        <tr><td class="k">AWB No</td><td>${esc(awb)}</td></tr>
        <tr><td class="k">PCS</td><td>${esc(pcsLabel)}</td></tr>
        <tr><td class="k">Delivery AWB</td><td>${esc(input.deliveryAwb)}</td></tr>
      </table>
    </div>
  </div>

  <div class="row">
    <div class="cell" style="width: 55%; min-height: 100px;">
      <div class="label">Consignee:</div>
      <div class="tiny" style="margin-top: 4px;">${partyHtml(input.consignee)}</div>
    </div>
    <div class="cell" style="width: 45%;">
      <table class="wt">
        <thead>
          <tr>
            <th>Pieces</th>
            <th>Actual Weight</th>
            <th>Vol. Weight</th>
            <th>Charge Weight</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="center">${esc(input.piecesCount || input.pcs || "1")}</td>
            <td class="center">${esc(num(input.actualWeight, 3))}</td>
            <td class="center">${esc(num(input.volWeight, 3))}</td>
            <td class="center">${esc(num(input.chargeWeight, 3))}</td>
          </tr>
        </tbody>
      </table>
      <div class="tiny" style="margin-top: 6px;">
        <div><span class="label">GST No</span> ${esc(input.gstNo)}</div>
        <div><span class="label">AD No</span> ${esc(input.adNo)}</div>
        <div><span class="label">IEC No</span> ${esc(input.iecNo || input.shipper.iecNo)}</div>
        <div><span class="label">LUT No</span> ${esc(input.lutNo)}</div>
      </div>
    </div>
  </div>

  <div class="row">
    <div class="cell" style="width: 25%;">
      <div class="label">Pre-Carriage By</div>
      <div style="min-height: 14px;"></div>
    </div>
    <div class="cell" style="width: 25%;">
      <div class="label">Port of Receipt by Pre Car</div>
      <div style="min-height: 14px;"></div>
    </div>
    <div class="cell" style="width: 50%;">
      <div class="label">Other Reference (S)</div>
      <div class="val">${esc(input.otherReference)}</div>
    </div>
  </div>

  <div class="row">
    <div class="cell" style="width: 25%;">
      <div class="label">Vessel / Flight No</div>
      <div style="min-height: 14px;"></div>
    </div>
    <div class="cell" style="width: 25%;">
      <div class="label">Place of Loading</div>
      <div class="val">${esc(input.placeOfLoading)}</div>
    </div>
    <div class="cell" style="width: 25%;">
      <div class="label">Country of Origin</div>
      <div class="val">${esc(input.countryOfOrigin || "INDIA")}</div>
    </div>
    <div class="cell" style="width: 25%;">
      <div class="label">Country of Destination</div>
      <div class="val">${esc(input.countryOfDestination)}</div>
    </div>
  </div>

  <div class="row">
    <div class="cell" style="width: 33%;">
      <div class="label">Port of Discharge</div>
      <div class="val">${esc(input.portOfDischarge || input.countryOfDestination)}</div>
    </div>
    <div class="cell" style="width: 33%;">
      <div class="label">Final Destination</div>
      <div class="val">${esc(input.finalDestination || input.countryOfDestination)}</div>
    </div>
    <div class="cell" style="width: 34%;">
      <div class="label">Term of Delivery and Payments</div>
      <div class="val">${esc(input.termsOfDelivery || "DAP")}</div>
    </div>
  </div>

  <table class="goods">
    <thead>
      <tr>
        <th style="width:6%">SR NO</th>
        <th style="width:7%">BOX</th>
        <th>DESCRIPTION OF GOODS</th>
        <th style="width:14%">HS CODE</th>
        <th style="width:10%">QTY</th>
        <th style="width:11%">RATE (${esc(currency)})</th>
        <th style="width:11%">AMT (${esc(currency)})</th>
      </tr>
    </thead>
    <tbody>
      ${bodyRows.join("")}
      <tr>
        <td colspan="6" class="right" style="font-weight:700;">TOTAL =</td>
        <td class="right" style="font-weight:700;">${esc(num(total, 2))}</td>
      </tr>
    </tbody>
  </table>

  <div class="row">
    <div class="cell grow">
      <span class="label">Amount Chargeable (in words)</span>
      <div class="val" style="margin-top: 4px;">${esc(words)}</div>
    </div>
  </div>

  <div class="row" style="min-height: 90px;">
    <div class="cell" style="width: 65%;">
      <div class="label">Declaration:</div>
      <div class="tiny" style="margin-top: 8px;">
        THIS IS TO CERTIFY THAT THE RATE AND QUANTITY MENTIONED IN THIS INVOICE IS TRUE AND CORRECT.
      </div>
    </div>
    <div class="cell" style="width: 35%; text-align: center;">
      <div class="label">FOR,</div>
      <div style="height: 48px;"></div>
      <div class="label">AUTHORIZED SIGNATORY</div>
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

/** Render invoice HTML to PDF base64 (no data: prefix). */
export async function renderInvoicePdfBase64(input: InvoiceInput): Promise<string> {
  const html = buildInvoiceHtml(input);
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const styleHtml = parsed.querySelector("style")?.outerHTML ?? "";
  const rootHtml = parsed.querySelector("#invoice-root")?.outerHTML ?? "";
  if (!rootHtml) throw new Error("Invoice root missing");

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
    const root = host.querySelector("#invoice-root") as HTMLElement | null;
    if (!root) throw new Error("Invoice root missing");

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
    const margin = 16;
    const maxW = pageW - margin * 2;
    const maxH = pageH - margin * 2;
    const ratio = Math.min(maxW / canvas.width, maxH / canvas.height);
    const w = canvas.width * ratio;
    const h = canvas.height * ratio;
    const x = (pageW - w) / 2;
    const y = margin;
    pdf.addImage(img, "JPEG", x, y, w, h);
    const dataUri = pdf.output("datauristring") as string;
    return dataUri.includes(",") ? dataUri.split(",")[1]! : dataUri;
  } finally {
    host.remove();
  }
}

export type InvoiceFormSlice = {
  awbNo: string;
  bookDate: string;
  invoiceNo: string;
  forwardingNo: string;
  flightNo: string;
  shipmentCurrency: string;
  pieces: string;
  piecesUnit: string;
  actualWeight: string;
  volWeight: string;
  chargeWeight: string;
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
    email: string;
    iecNo: string;
    documentType: string;
    documentNo: string;
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
    email: string;
  };
  vendor: { code: string; name: string };
  piecesLines?: Array<{
    length: string;
    breadth: string;
    height: string;
    pieces: string;
    volWeight: string;
    actualWeightPerPc: string;
  }>;
  proforma: {
    invoiceNo: string;
    invoiceDate: string;
    exportReason: string;
    termOfInvoice: string;
    currency: string;
    lines: Array<{
      boxNo: string;
      description: string;
      hsCode: string;
      quantity: string;
      weight: string;
      unit: string;
      rate: string;
      amount: string;
    }>;
  };
  forwarding: {
    deliveryAwb: string;
    forwardingAwb: string;
  };
};

function giftReference(reason: string): string {
  const r = (reason || "").toUpperCase();
  if (r.includes("GIFT")) return "Bonafide Gift";
  return reason || "";
}

export function formToInvoiceInput(form: InvoiceFormSlice): InvoiceInput {
  const invNo = form.proforma.invoiceNo || form.invoiceNo || "01";
  const invDate = form.proforma.invoiceDate || form.bookDate;
  const currency = form.proforma.currency || form.shipmentCurrency || "USD";
  const pcsUnit = (form.piecesUnit || "").toUpperCase().includes("DOX") ? "PKT" : "PKT";

  return {
    awbNo: form.awbNo,
    invoiceNo: invNo,
    invoiceDate: invDate,
    exportersRef: form.vendor.code || form.vendor.name || "",
    trackingNo: form.forwardingNo || form.forwarding.forwardingAwb || "",
    deliveryAwb: form.forwarding.deliveryAwb || "",
    pcs: form.pieces || "1",
    pcsUnit,
    shipper: {
      name: form.shipper.companyName.name || form.shipper.contactName,
      companyName: form.shipper.companyName.name,
      contactName: form.shipper.contactName,
      address1: form.shipper.address1,
      address2: form.shipper.address2,
      city: form.shipper.city,
      state: form.shipper.state,
      pincode: form.shipper.pincode,
      country: form.shipper.country || "INDIA",
      phone: form.shipper.telephone,
      mobileNo: form.shipper.mobileNo,
      email: form.shipper.email,
      documentType: form.shipper.documentType,
      documentNo: form.shipper.documentNo,
      iecNo: form.shipper.iecNo,
    },
    consignee: {
      name: form.consignee.companyName.name || form.consignee.contactName,
      companyName: form.consignee.companyName.name,
      contactName: form.consignee.contactName,
      address1: form.consignee.address1,
      address2: form.consignee.address2,
      city: form.consignee.city,
      state: form.consignee.state,
      pincode: form.consignee.pincode,
      country: form.consignee.country,
      phone: form.consignee.telephone,
      mobileNo: form.consignee.mobileNo,
      email: form.consignee.email,
    },
    piecesCount: form.pieces || "1",
    actualWeight: form.actualWeight,
    volWeight: form.volWeight,
    chargeWeight: form.chargeWeight,
    iecNo: form.shipper.iecNo,
    placeOfLoading:
      form.shipper.origin.name || form.shipper.origin.code || form.shipper.city || "HYDERABAD",
    countryOfOrigin: form.shipper.country || "INDIA",
    countryOfDestination:
      form.consignee.country || form.consignee.origin.name || form.consignee.origin.code,
    portOfDischarge: form.consignee.country || form.consignee.origin.name,
    finalDestination: form.consignee.country || form.consignee.origin.name,
    termsOfDelivery: form.proforma.termOfInvoice || "DAP",
    otherReference: giftReference(form.proforma.exportReason),
    currency,
    lines: (form.proforma.lines ?? []).map((l) => ({
      boxNo: l.boxNo,
      description: l.description,
      hsCode: l.hsCode,
      quantity: l.quantity,
      unit: l.unit,
      rate: l.rate,
      amount: l.amount,
      weight: l.weight,
    })),
    pieces: (form.piecesLines ?? []).map((p) => ({
      length: p.length,
      breadth: p.breadth,
      height: p.height,
      pieces: p.pieces,
      volWeight: p.volWeight,
      actualWeight: p.actualWeightPerPc,
    })),
  };
}

export type EnsuredInvoiceDoc = {
  created: boolean;
  available: boolean;
  contentB64?: string | null;
  htmlPreview?: string | null;
  fileName?: string;
};

/** Build invoice preview immediately; PDF persist runs in the background. */
export async function ensureInvoiceDocument(args: {
  shipmentId: string;
  form: InvoiceFormSlice;
  force?: boolean;
}): Promise<EnsuredInvoiceDoc> {
  const input = formToInvoiceInput(args.form);
  if (!input.awbNo.trim()) {
    return { created: false, available: false };
  }

  const fileName = `Invoice-${input.awbNo}.pdf`;
  const htmlPreview = buildInvoiceHtml(input);

  // Never block the UI on html2canvas / RPC — preview must open instantly.
  void (async () => {
    try {
      if (!args.force) {
        const existing = await listShipmentDocuments(args.shipmentId);
        if (existing.find((d) => d.type === "INVOICE")?.available) return;
      }
      const b64 = await renderInvoicePdfBase64(input);
      await saveShipmentDocument({
        shipmentId: args.shipmentId,
        documentType: "INVOICE",
        source: "SYSTEM",
        fileName,
        contentB64: b64,
        mimeType: "application/pdf",
        status: "AVAILABLE",
        rawMeta: { generator: "internal-invoice", version: 1 },
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
