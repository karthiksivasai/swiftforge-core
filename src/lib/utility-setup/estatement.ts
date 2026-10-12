/** eStatement column mapping and the date/time that releases the statement email. */

export const ESTATEMENT_COLUMNS = [
  "Actl_Weight",
  "Agent_AWBno",
  "Agent_AWBNo1",
  "AWBNo",
  "BookTime",
  "Chrg_Weight",
  "Consignee_Add1",
  "Consignee_Add2",
  "Consignee_Add3",
  "Consignee_Add4",
  "Consignee_Name",
  "Consignee_Pin",
  "Content",
  "Cust_invoice_no",
  "Customer_Code",
  "Customer_Name",
  "Delivery",
  "Delv_Date",
  "Delv_Remark",
  "Delv_Time",
  "Destination_Code",
  "Destination_Name",
  "Eawbno",
  "Excp_Code",
  "Excp_Name",
  "ExpDelv_Date",
  "FuelSurcharge",
  "Grand_Total",
  "Instruction",
  "KeyDate2",
  "Manifest_Date",
  "OrgCode",
  "Origin_Name",
  "Pcs",
  "Prod_Code",
  "Prod_Name",
  "Recver_Name",
  "Ref_No",
  "Serv_Name",
  "Shipment_Value",
  "Shipper_Name",
  "TaxAmount",
  "Total",
  "Vendor_Code",
  "Vendor_Name",
  "Vol_Weight",
  "Vol_WeightM",
] as const;

export type EstatementColumnName = (typeof ESTATEMENT_COLUMNS)[number];

export type EstatementColumnRow = {
  column: EstatementColumnName;
  code: string;
  orderNo: string;
};

const COLUMN_SET = new Set<string>(ESTATEMENT_COLUMNS);

export function defaultEstatementColumns(): EstatementColumnRow[] {
  return ESTATEMENT_COLUMNS.map((column, index) => ({
    column,
    code: column,
    orderNo: String(index + 1),
  }));
}

export function mergeEstatementColumns(saved: EstatementColumnRow[]): EstatementColumnRow[] {
  const byName = new Map(saved.map((row) => [row.column, row]));
  return ESTATEMENT_COLUMNS.map((column, index) => {
    const row = byName.get(column);
    return {
      column,
      code: row?.code ?? column,
      orderNo: row?.orderNo ?? String(index + 1),
    };
  });
}

export function isEstatementColumn(value: string): value is EstatementColumnName {
  return COLUMN_SET.has(value);
}

export function composeEstatementOutput(input: {
  columns: EstatementColumnRow[];
  variables: Record<string, unknown>;
  dear?: string | null;
  body?: string | null;
}): string {
  const lines: string[] = [];
  const dear = (input.dear ?? "").trim();
  const body = (input.body ?? "").trim();
  if (dear) lines.push(dear, "");
  if (body) lines.push(body, "");

  const visible = input.columns
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.code.trim() !== "")
    .sort((left, right) => {
      const leftOrder = orderRank(left.row.orderNo);
      const rightOrder = orderRank(right.row.orderNo);
      return leftOrder - rightOrder || left.index - right.index;
    });

  for (const { row } of visible) {
    const value = input.variables[row.column];
    if (value == null) continue;
    const text = String(value).trim();
    if (!text) continue;
    lines.push(`${row.code.trim()}: ${text}`);
  }
  return lines.join("\n").trim();
}

function orderRank(orderNo: string): number {
  return /^\d+$/.test(orderNo.trim()) ? Number(orderNo.trim()) : Number.MAX_SAFE_INTEGER;
}

export type EstatementCustomerRecipient = {
  email?: string | null;
  eStatement?: boolean | null;
  status?: string | null;
  deleted?: boolean;
};

/**
 * Customers who should receive the scheduled statement.
 * From Email stays the sender. A customer is included when they are active,
 * have an email address, and have not turned eStatement off.
 */
export function estatementRecipientAddresses(
  customers: EstatementCustomerRecipient[],
): string[] {
  const seen = new Set<string>();
  const recipients: string[] = [];
  for (const customer of customers) {
    if (customer.deleted) continue;
    if ((customer.status ?? "ACTIVE").trim().toUpperCase() !== "ACTIVE") continue;
    if (customer.eStatement === false) continue;
    const email = (customer.email ?? "").trim();
    if (!/^[^\s@]+@[^\s@]+$/.test(email)) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    recipients.push(email);
  }
  return recipients;
}

export function estatementScheduleKey(statementDate: string, sendingTime: string): string {
  return `${statementDate.trim()} ${sendingTime.trim()}`;
}

/** Office clock used by the eStatement schedule. */
export const ESTATEMENT_TIME_ZONE = "Asia/Kolkata";

export function estatementSendIsDue(input: {
  statementDate: string;
  sendingTime: string;
  now: Date;
  sentKey?: string | null;
}): boolean {
  const statementDate = input.statementDate.trim();
  const sendingTime = input.sendingTime.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(statementDate)) return false;
  if (!/^\d{2}:\d{2}$/.test(sendingTime)) return false;
  if ((input.sentKey ?? "") === estatementScheduleKey(statementDate, sendingTime)) return false;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ESTATEMENT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(input.now);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const today = `${pick("year")}-${pick("month")}-${pick("day")}`;
  const clock = `${pick("hour")}:${pick("minute")}`;
  return today === statementDate && clock >= sendingTime;
}
