/**
 * Maps between Finance UI form/list shapes and DB / RPC payloads (4G).
 */
import type {
  CustomerPaymentFields,
  ExpenseFields,
  ReceiptFields,
} from "@/lib/transactions/schemas/finance";
import type {
  CustomerPaymentRow,
  ExpenseEntryRow,
  ReceiptRow,
} from "@/lib/transactions/resources/finance";

export type LookupPair = { id?: string; code: string; name: string };

export type UiReceiptForm = {
  receiptNo: string;
  date: string;
  customer: LookupPair;
  serviceCenter: LookupPair;
  bankName: string;
  bankCode: string;
  amount: string;
  narration: string;
};

export type UiReceiptRow = {
  id: string;
  receiptNo: string;
  date: string;
  customerName: string;
  serviceCenter: string;
  bankName: string;
  amount: string;
  narration: string;
  status: string;
  rowVersion: number;
  form: UiReceiptForm;
};

export type UiExpenseForm = {
  entryNo: string;
  kind: "Expense" | "Income";
  date: string;
  expenseHead: string;
  cashBank: string;
  awbNo: string;
  description: string;
  amount: string;
  documentName: string;
};

export type UiExpenseRow = {
  id: string;
  entryNo: string;
  branchName: string;
  expenseDate: string;
  expenseName: string;
  bankCash: string;
  awbNo: string;
  description: string;
  debitCredit: "E" | "I";
  authorized: "Y" | "N" | "R";
  amount: string;
  documentName: string;
  status: string;
  rowVersion: number;
  form: UiExpenseForm;
};

export type UiAuthorizeExpenseRow = {
  id: string;
  srno: number;
  tranDate: string;
  name: string;
  bankCash: string;
  description: string;
  amount: string;
  documentUrl: string;
  status: "Authorized" | "Un-Authorized" | "Rejected";
  rowVersion: number;
};

export type UiPaymentForm = {
  date: string;
  paidDate: string;
  amount: string;
  remark: string;
  customer: LookupPair;
  fileName: string;
};

export type UiPaymentRow = {
  id: string;
  date: string;
  customerName: string;
  paidDate: string;
  amount: string;
  remark: string;
  approved: "Pending" | "Approved" | "Rejected";
  fileName: string;
  status: string;
  rowVersion: number;
  form: UiPaymentForm;
};

const formatDisplayDate = (iso: string) => {
  if (!iso) return "";
  if (iso.includes("/")) return iso;
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
};

function receiptMode(bankName: string, bankCode?: string): "CASH" | "BANK" {
  const code = (bankCode ?? "").trim().toUpperCase();
  const name = bankName.trim().toUpperCase();
  if (code === "CASH" || name === "CASH") return "CASH";
  return "BANK";
}

export function receiptFormToFields(form: UiReceiptForm): ReceiptFields {
  const mode = receiptMode(form.bankName, form.bankCode);
  return {
    receipt_date: form.date,
    customer_id: form.customer.id ?? null,
    customer_code: form.customer.code || null,
    branch_id: form.serviceCenter.id ?? null,
    branch_code: form.serviceCenter.code || null,
    bank_id: null,
    bank_code: mode === "BANK" ? form.bankCode || null : null,
    bank_name: mode === "BANK" ? form.bankName || null : null,
    mode,
    amount: form.amount,
    narration: form.narration || form.bankName || null,
  };
}

export function dbReceiptToUi(row: ReceiptRow): UiReceiptRow {
  const bankName = row.mode === "CASH" ? "Cash" : (row.banks?.name ?? row.banks?.code ?? "");
  const form: UiReceiptForm = {
    receiptNo: row.receipt_no,
    date: row.receipt_date,
    customer: {
      id: row.customer_id,
      code: row.customers?.code ?? "",
      name: row.customers?.name ?? "",
    },
    serviceCenter: {
      id: row.branch_id ?? undefined,
      code: row.branches?.code ?? "",
      name: row.branches?.name ?? "",
    },
    bankName,
    bankCode: row.banks?.code ?? (row.mode === "CASH" ? "CASH" : ""),
    amount: Number(row.amount).toFixed(2),
    narration: row.narration ?? "",
  };
  return {
    id: row.id,
    receiptNo: row.receipt_no,
    date: formatDisplayDate(row.receipt_date),
    customerName: row.customers?.name ?? row.customers?.code ?? "",
    serviceCenter: row.branches?.code ?? "",
    bankName,
    amount: form.amount,
    narration: form.narration,
    status: row.status,
    rowVersion: row.row_version,
    form,
  };
}

export function expenseFormToFields(form: UiExpenseForm): ExpenseFields {
  const mode = form.cashBank.trim().toUpperCase() === "BANK" ? "BANK" : "CASH";
  const head = form.expenseHead.trim();
  const codeGuess = head.includes(" ") ? head.split(/\s+/)[0] : head;
  return {
    kind: form.kind === "Income" ? "INCOME" : "EXPENSE",
    entry_date: form.date,
    expense_head_id: null,
    expense_head_code: codeGuess || null,
    expense_head_name: head || null,
    mode,
    bank_id: null,
    branch_id: null,
    shipment_id: null,
    awb_no: form.awbNo || null,
    description: form.description || null,
    amount: form.amount,
    document_file_id: null,
  };
}

export function dbExpenseToUi(row: ExpenseEntryRow): UiExpenseRow {
  const authorized =
    row.authorization_status === "AUTHORIZED"
      ? "Y"
      : row.authorization_status === "REJECTED"
        ? "R"
        : "N";
  const form: UiExpenseForm = {
    entryNo: row.entry_no,
    kind: row.kind === "INCOME" ? "Income" : "Expense",
    date: row.entry_date,
    expenseHead: row.expense_head_name ?? row.expense_head_code ?? "",
    cashBank: row.mode === "BANK" ? "Bank" : "Cash",
    awbNo: row.awb_no ?? "",
    description: row.description ?? "",
    amount: Number(row.amount).toFixed(2),
    documentName: row.document_file_id ? "document" : "",
  };
  return {
    id: row.id,
    entryNo: row.entry_no,
    branchName: row.branches?.code ?? "",
    expenseDate: formatDisplayDate(row.entry_date),
    expenseName: form.expenseHead,
    bankCash: form.cashBank,
    awbNo: form.awbNo,
    description: form.description,
    debitCredit: row.kind === "INCOME" ? "I" : "E",
    authorized,
    amount: form.amount,
    documentName: form.documentName,
    status: row.authorization_status,
    rowVersion: row.row_version,
    form,
  };
}

export function dbExpenseToAuthorizeUi(row: ExpenseEntryRow): UiAuthorizeExpenseRow {
  const status =
    row.authorization_status === "AUTHORIZED"
      ? "Authorized"
      : row.authorization_status === "REJECTED"
        ? "Rejected"
        : "Un-Authorized";
  const srno = Number.parseInt(row.entry_no.replace(/\D/g, ""), 10);
  return {
    id: row.id,
    srno: Number.isFinite(srno) ? srno : 0,
    tranDate: formatDisplayDate(row.entry_date),
    name: row.expense_head_name ?? row.expense_head_code ?? "",
    bankCash: row.mode === "BANK" ? "Bank" : "Cash",
    description: row.description ?? "",
    amount: Number(row.amount).toFixed(2),
    documentUrl: row.document_file_id ? "view" : "",
    status,
    rowVersion: row.row_version,
  };
}

export function paymentFormToFields(form: UiPaymentForm): CustomerPaymentFields {
  return {
    declared_date: form.date,
    paid_date: form.paidDate || null,
    customer_id: form.customer.id ?? null,
    customer_code: form.customer.code || null,
    amount: form.amount,
    remark: form.remark || null,
    file_id: null,
  };
}

export function dbPaymentToUi(row: CustomerPaymentRow): UiPaymentRow {
  const approved =
    row.status === "APPROVED" ? "Approved" : row.status === "REJECTED" ? "Rejected" : "Pending";
  const form: UiPaymentForm = {
    date: row.declared_date,
    paidDate: row.paid_date ?? "",
    amount: Number(row.amount).toFixed(2),
    remark: row.remark ?? "",
    customer: {
      id: row.customer_id,
      code: row.customers?.code ?? "",
      name: row.customers?.name ?? "",
    },
    fileName: row.file_id ? "attachment" : "",
  };
  return {
    id: row.id,
    date: formatDisplayDate(row.declared_date),
    customerName: row.customers?.name ?? row.customers?.code ?? "",
    paidDate: formatDisplayDate(row.paid_date ?? ""),
    amount: form.amount,
    remark: form.remark,
    approved,
    fileName: form.fileName,
    status: row.status,
    rowVersion: row.row_version,
    form,
  };
}
