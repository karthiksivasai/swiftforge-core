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
  shipmentValue?: string;
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
  return on ? "*" : "";
}

function fmtAmount(v: unknown): string {
  const n = Number.parseFloat(String(v ?? "").replace(/,/g, ""));
  if (!Number.isFinite(n) || n === 0) return String(v ?? "").trim();
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function packageCount(input: AwbLabelInput): string {
  if (input.pieces?.length) {
    const n = input.pieces.reduce((sum, p) => sum + (Number.parseFloat(p.pieces || "1") || 0), 0);
    return n.toFixed(2);
  }
  return safeFixed(input.packages, 2);
}

const AWB_GREEN = "#16803a";

function hdrBar(label: string): string {
  return `<div class="hdr"><svg class="hdr-bg" aria-hidden="true" preserveAspectRatio="none"><rect width="100%" height="100%" fill="${AWB_GREEN}"/></svg><span class="hdr-txt">${label}</span></div>`;
}

function logoMark(): string {
  return `<svg class="logo-mark" viewBox="0 0 64 48" width="58" height="44" aria-hidden="true">
    <circle cx="22" cy="24" r="20" fill="${AWB_GREEN}"/>
    <path d="M12 18 L19.5 32 L22 25 L24.5 32 L32 18" fill="none" stroke="#fff" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M44 16 L51 24 L44 32" fill="none" stroke="${AWB_GREEN}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M50 16 L57 24 L50 32" fill="none" stroke="${AWB_GREEN}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M56 16 L63 24 L56 32" fill="none" stroke="${AWB_GREEN}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}

function dateTimeBox(date: string, time: string): string {
  return `<div class="dt-box"><div>Date: <b>${esc(date)}</b></div><div>Time: <b>${esc(time)}</b></div></div>`;
}

function cell(label: string, value: string, extra = ""): string {
  return `<td class="box ${extra}"><div class="lbl">${label}</div><div class="val">${value}</div></td>`;
}

function safeFixed(v: unknown, digits: number): string {
  const n = Number.parseFloat(String(v ?? ""));
  return (Number.isFinite(n) ? n : 0).toFixed(digits);
}

function partyBlock(p: AwbLabelParty): string {
  const name = p.contactName || p.companyName || p.name || "";
  const city = String(p.city ?? "").trim();
  const lines = [name, p.address1, p.address2, city, city, p.state]
    .map((x) => String(x ?? "").trim().toUpperCase())
    .filter(Boolean);
  return lines.map(esc).join("<br/>");
}

function dimensionsLine(pieces: AwbLabelPiece[] | undefined, fallbackPkg: string): string {
  if (!pieces?.length) return fallbackPkg ? String(fallbackPkg) : "";
  return pieces
    .map((p) => {
      const l = p.length || "0";
      const w = p.breadth || "0";
      const h = p.height || "0";
      const n = p.pieces || "1";
      const vol = p.volWeight || "";
      return `${l}*${w}*${h}*${n}${vol ? `=${vol}` : ""}`;
    })
    .join("; ");
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

/** Build print-ready HTML for the AWB label (CourierWala two-column layout). */
export function buildAwbLabelHtml(input: AwbLabelInput): string {
  const awb = input.awbNo || "";
  const date = fmtDate(input.bookDate);
  const time = fmtTime(input.bookTime);
  const pay = paymentFlags(input.paymentType);
  const isDoc = Boolean(input.isDocument);
  const brand = input.brandName || "courierwala express";
  const tagline = input.brandTagline || "We bring India to your home.";
  const pkgs = packageCount(input);
  const vol = input.volWeight || input.pieces?.[0]?.volWeight || "0.00";
  const act = input.actualWeight || "0.000";
  const chg = input.chargeWeight || act;
  const dims = dimensionsLine(input.pieces, pkgs);
  const shipperPhone = input.shipper.mobileNo || input.shipper.phone || "";
  const consigneePhone = input.consignee.mobileNo || input.consignee.phone || "";
  const content = String(input.content ?? "").toUpperCase();
  const totalCharges = fmtAmount(input.totalCharges || "0.00") || "0.00";
  const totalValue = fmtAmount(input.shipmentValue);
  const origin = String(input.originName || "").toUpperCase();
  const destination = String(input.destinationName || "").toUpperCase();
  const vendor = String(input.vendorName || "").toUpperCase();
  const service = String(input.serviceName || "").toUpperCase();
  const clientCode = String(input.clientCode || input.shipper.accountNo || "").toUpperCase();
  const clientName = String(
    input.clientName || input.shipper.name || input.shipper.companyName || "",
  ).toUpperCase();
  const consigneeName = String(
    input.consignee.name || input.consignee.companyName || input.consignee.contactName || "",
  ).toUpperCase();
  const brandWord = brand.replace(/\s+express$/i, "").trim() || "courierwala";
  const brandRest = /express/i.test(brand) ? "express" : "";

  const partyBlockHtml = (party: AwbLabelParty, account: string, name: string, phone: string, title: string) => `
    ${hdrBar(title)}
    <table class="grid">
      <tr>
        ${cell("Account No.", esc(account))}
        ${cell("Name", esc(name))}
      </tr>
      <tr>
        <td class="box" colspan="2">
          <div class="lbl">Individual/ Company Name &amp; Address</div>
          <div class="addr">${partyBlock(party)}</div>
        </td>
      </tr>
      <tr>
        <td class="box"><div class="lbl">Postal code</div><div class="val">${esc(party.pincode || "")}</div></td>
        <td class="box phone-cell"><div class="phone-box">PHONE &nbsp;<b>${esc(phone)}</b></div></td>
      </tr>
    </table>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<link href="https://fonts.googleapis.com/css2?family=Libre+Barcode+128&family=Libre+Barcode+39&display=swap" rel="stylesheet" />
<style>
  * { box-sizing: border-box; }
  html, body, .hdr, .brand-a, .chg {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    color-adjust: exact;
  }
  body {
    margin: 0;
    padding: 8px;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10.5px;
    color: #111;
    background: #fff;
  }
  table.sheet {
    width: 780px;
    border: 1.5px solid #111;
    border-collapse: collapse;
    table-layout: fixed;
    margin: 0 auto;
    background: #fff;
  }
  table.sheet td { padding: 0; vertical-align: top; }
  table.grid { width: 100%; border-collapse: collapse; table-layout: fixed; height: 100%; }
  td.box {
    border: 1px solid #111;
    padding: 3px 5px;
    vertical-align: top;
  }
  .lbl { font-size: 9px; color: #222; line-height: 1.2; }
  .val { font-size: 11px; font-weight: 700; padding-top: 1px; text-transform: uppercase; }
  .addr { font-size: 11px; font-weight: 700; line-height: 1.32; text-transform: uppercase; min-height: 68px; padding-top: 2px; }
  .hdr {
    position: relative;
    background-color: ${AWB_GREEN};
    background-image: linear-gradient(${AWB_GREEN}, ${AWB_GREEN});
    color: #fff;
    font-weight: 700;
    font-size: 11px;
    padding: 2px 6px;
    letter-spacing: 0.02em;
    border: 1px solid #111;
    border-bottom: 0;
  }
  .hdr-bg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; z-index: 0; }
  .hdr-txt { position: relative; z-index: 1; color: #fff; }
  .logo-wrap { display: flex; align-items: center; gap: 6px; padding: 6px 8px; min-height: 84px; }
  .brand-a { font-size: 15px; font-weight: 800; color: ${AWB_GREEN}; line-height: 1.05; }
  .brand-b { font-size: 15px; font-weight: 800; color: #333; }
  .logo-tag { font-size: 8px; color: #444; margin-top: 2px; }
  .barcode {
    font-family: "Libre Barcode 128", "Libre Barcode 39", monospace;
    font-size: 48px;
    line-height: 0.8;
    text-align: center;
  }
  .barcode-num { text-align: center; font-size: 11px; font-weight: 700; letter-spacing: 0.22em; margin-top: 2px; }
  .od { padding: 8px 8px; font-size: 11px; }
  .od .k { color: #333; }
  .od .v { font-weight: 700; }
  .awb-no { font-size: 22px; font-weight: 800; padding: 6px 8px 0; }
  .docs { padding: 8px; font-size: 10px; }
  .check {
    display: inline-block;
    width: 11px;
    height: 11px;
    border: 1px solid #111;
    text-align: center;
    line-height: 10px;
    font-size: 10px;
    font-weight: 700;
    margin-right: 4px;
  }
  .phone-cell { text-align: right; vertical-align: bottom; }
  .phone-box { display: inline-block; border: 1px solid #111; padding: 2px 8px; font-size: 10px; min-width: 132px; text-align: left; }
  .meta { width: 100%; border-collapse: collapse; }
  .meta th, .meta td { border: 1px solid #111; padding: 3px 3px; text-align: center; font-size: 9.5px; }
  .meta th { font-weight: 600; }
  .chg { color: #1557c0; font-weight: 800; }
  .tiny { font-size: 8px; line-height: 1.28; }
  .dt-box { border: 1px solid #111; padding: 2px 7px; font-size: 10px; display: inline-block; min-width: 118px; text-align: left; }
  .dt-wrap { text-align: right; padding: 6px 5px 4px; }
  .sig-pad { padding: 5px 6px 4px; min-height: 112px; }
  .content { font-size: 10.5px; font-weight: 700; text-transform: uppercase; line-height: 1.28; min-height: 52px; }
  .pay { font-size: 10px; padding-top: 4px; }
  .col-l { width: 48%; }
  .col-r { width: 52%; }
  .side { width: 32%; }
  .main { width: 68%; }
  @page { size: A4 portrait; margin: 7mm; }
  @media print {
    html, body, .hdr, .brand-a, .chg {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    body { padding: 0; }
    table.sheet { width: 100%; max-width: 780px; }
    .hdr { background-color: ${AWB_GREEN} !important; color: #fff !important; }
    .hdr-txt { color: #fff !important; }
    .brand-a { color: ${AWB_GREEN} !important; }
    .chg { color: #1557c0 !important; }
  }
</style>
</head>
<body>
<table class="sheet" id="awb-label-root">
  <tr>
    <td class="box" style="width:26%;">
      <div class="logo-wrap">
        ${logoMark()}
        <div>
          <div><span class="brand-a">${esc(brandWord)}</span> <span class="brand-b">${esc(brandRest)}</span></div>
          <div class="logo-tag">${esc(tagline)}</div>
        </div>
      </div>
    </td>
    <td class="box" style="width:30%;vertical-align:middle;">
      <div class="barcode">*${esc(awb)}*</div>
      <div class="barcode-num">${esc(awb.split("").join(" "))}</div>
    </td>
    <td class="box" style="width:22%;">
      <div class="od">
        <div><span class="k">Origin:</span> <span class="v">${esc(origin)}</span></div>
        <div style="margin-top:10px;"><span class="k">Destination:</span><br/><span class="v">${esc(destination)}</span></div>
      </div>
    </td>
    <td class="box" style="width:22%;">
      <div class="awb-no">${esc(awb)}</div>
      <div class="docs">
        <div><span class="check">${mark(isDoc)}</span> DOCUMENTS</div>
        <div style="margin-top:5px;"><span class="check">${mark(!isDoc)}</span> NON DOC</div>
      </div>
    </td>
  </tr>
  <tr>
    <td class="col-l" colspan="2" style="border-right:1px solid #111;">
      <table class="grid">
        <tr><td>${partyBlockHtml(input.shipper, clientCode, clientName, shipperPhone, "1. FROM (SENDER)")}</td></tr>
        <tr><td>${partyBlockHtml(input.consignee, String(input.consignee.accountNo || "").toUpperCase(), consigneeName, consigneePhone, "2. TO (RECEIVER)")}</td></tr>
        <tr>
          <td>
            ${hdrBar("8. SHIPPER'S SIGNATURE &amp; AUTHORIZATION")}
            <div class="box sig-pad" style="border-top:0;">
              <div class="tiny">I/We agree that courierwala express standard Terms &amp; Conditions apply to this shipment and that this shipment does not contain any unauthorized or illegal goods. I authorize courierwala express as my agent for export / customs purposes.</div>
              <div style="margin-top:8px;font-size:10px;"><b>DECLARED VALUE :</b> ${esc(totalValue)}</div>
              <div style="margin-top:10px;font-size:10px;">Signature X ________________</div>
              <div class="dt-wrap">${dateTimeBox(date, time)}</div>
            </div>
          </td>
        </tr>
      </table>
    </td>
    <td class="col-r" colspan="2">
      <table class="grid">
        <tr>
          <td class="main">
            ${hdrBar("3. SHIPMENT INFORMATION")}
            <table class="grid">
              <tr>
                <td class="box" colspan="4">
                  <div class="lbl">Dimensions( in cm) L*W*H</div>
                  <div class="val">${esc(dims)}</div>
                </td>
              </tr>
              <tr>
                <th class="box" style="font-weight:600;font-size:9px;text-align:center;">No. of package</th>
                <th class="box" style="font-weight:600;font-size:9px;text-align:center;">Total vol. Weight (kg)</th>
                <th class="box" style="font-weight:600;font-size:9px;text-align:center;">Total Value</th>
                <th class="box" style="font-weight:600;font-size:9px;text-align:center;">Total Weight</th>
              </tr>
              <tr>
                <td class="box" style="text-align:center;font-weight:700;">${esc(pkgs)}</td>
                <td class="box" style="text-align:center;font-weight:700;">${esc(safeFixed(vol, 2))}</td>
                <td class="box" style="text-align:center;font-weight:700;">${esc(totalValue)}</td>
                <td class="box" style="text-align:center;font-weight:700;">${esc(safeFixed(act, 3))}</td>
              </tr>
              <tr>
                <td class="box" colspan="2"><div class="lbl">Return Service</div></td>
                <td class="box"><div class="lbl">Insurance</div></td>
                <td class="box" style="text-align:right;">
                  <div class="lbl">Chargeable weight</div>
                  <div class="chg">${esc(safeFixed(chg, 3))}</div>
                </td>
              </tr>
              <tr>
                <td class="box" colspan="4">
                  <div class="pay">
                    Charges
                    &nbsp; <span class="check">${mark(pay.cash)}</span> Cash
                    &nbsp; <span class="check">${mark(pay.cod)}</span> COD
                    &nbsp; <span class="check">${mark(pay.credit)}</span> Credit
                    &nbsp; <span class="check">${mark(pay.bank)}</span> Bank
                  </div>
                </td>
              </tr>
            </table>
          </td>
          <td class="side">
            ${hdrBar("4. SERVICE DETAILS")}
            <table class="grid">
              <tr>${cell("Vendor Name", esc(vendor))}</tr>
              <tr>${cell("Service", esc(service))}</tr>
            </table>
          </td>
        </tr>
        <tr>
          <td class="main">
            ${hdrBar(`5. Description of Content ${isDoc ? "(Document)" : "(Non-Document)"}`)}
            <div class="box content" style="border-top:0;">${esc(content)}</div>
            ${hdrBar("6. SPECIAL INSTRUCTIONS")}
            <div class="box" style="border-top:0;min-height:28px;">${esc(input.instruction || "")}</div>
          </td>
          <td class="side">
            <table class="grid">
              <tr>${cell("Third Party A/c", "&nbsp;")}</tr>
              <tr>${cell("Total charges", esc(totalCharges))}</tr>
              <tr>
                <td>
                  ${hdrBar("7. PICK UP")}
                  <table class="grid">
                    <tr>${cell("Courier Code", "&nbsp;")}</tr>
                    <tr>${cell("Date / Time", "&nbsp;")}</tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td colspan="2">
            ${hdrBar("9. RECEIVER")}
            <div class="box sig-pad" style="border-top:0;">
              <div class="tiny">I/we agree and adhere to the Terms &amp; Conditions of courierwala express mentioned overleaf. Received in good order &amp; condition.</div>
              <div style="margin-top:12px;font-size:10px;">Name &amp; Signature / Deal</div>
              <div style="margin-top:16px;">________________________</div>
              <div class="dt-wrap">${dateTimeBox(date, time)}</div>
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
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
  shipmentValue?: string;
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
    shipmentValue: form.shipmentValue || "",
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
