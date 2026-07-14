import { describe, expect, it } from "vitest";
import {
  canApproveCustomerPayment,
  canAuthorizeExpense,
  canPostReceipt,
  canRejectCustomerPayment,
  canRejectExpense,
  canUpdateExpense,
  canUpdateReceipt,
  customerPaymentFieldsSchema,
  expenseFieldsSchema,
  receiptFieldsSchema,
} from "@/lib/transactions/schemas/finance";
import {
  expenseFormToFields,
  paymentFormToFields,
  receiptFormToFields,
} from "@/lib/transactions/financeUiMap";

describe("finance schemas", () => {
  it("parses receipt fields", () => {
    const ok = receiptFieldsSchema.parse({
      receipt_date: "2026-07-14",
      customer_code: "CUST1",
      mode: "CASH",
      amount: "100.50",
    });
    expect(ok.amount).toBe("100.50");
    expect(ok.mode).toBe("CASH");
  });

  it("parses expense and payment fields", () => {
    expect(
      expenseFieldsSchema.parse({
        entry_date: "2026-07-14",
        expense_head_name: "FOOD",
        amount: 40,
      }).kind,
    ).toBe("EXPENSE");
    expect(
      customerPaymentFieldsSchema.parse({
        declared_date: "2026-07-14",
        customer_code: "CUST1",
        amount: "10",
      }).amount,
    ).toBe("10");
  });

  it("gates status transitions", () => {
    expect(canUpdateReceipt("DRAFT")).toBe(true);
    expect(canPostReceipt("DRAFT")).toBe(true);
    expect(canPostReceipt("POSTED")).toBe(false);
    expect(canUpdateExpense("UNAUTHORIZED")).toBe(true);
    expect(canAuthorizeExpense("UNAUTHORIZED")).toBe(true);
    expect(canRejectExpense("AUTHORIZED")).toBe(false);
    expect(canApproveCustomerPayment("PENDING")).toBe(true);
    expect(canRejectCustomerPayment("APPROVED")).toBe(false);
  });
});

describe("financeUiMap", () => {
  it("maps receipt cash/bank mode from UI bank name", () => {
    expect(
      receiptFormToFields({
        receiptNo: "",
        date: "2026-07-14",
        customer: { code: "C1", name: "Client" },
        serviceCenter: { code: "HYD", name: "HYD" },
        bankName: "Cash",
        bankCode: "CASH",
        amount: "10",
        narration: "",
      }).mode,
    ).toBe("CASH");
    expect(
      receiptFormToFields({
        receiptNo: "",
        date: "2026-07-14",
        customer: { code: "C1", name: "Client" },
        serviceCenter: { code: "HYD", name: "HYD" },
        bankName: "HDFC BANK",
        bankCode: "HDFC",
        amount: "10",
        narration: "",
      }).mode,
    ).toBe("BANK");
  });

  it("maps expense kind and payment fields", () => {
    expect(
      expenseFormToFields({
        entryNo: "",
        kind: "Income",
        date: "2026-07-14",
        expenseHead: "FREIGHT INCOME",
        cashBank: "Cash",
        awbNo: "",
        description: "x",
        amount: "1",
        documentName: "a.pdf",
      }).kind,
    ).toBe("INCOME");
    expect(
      paymentFormToFields({
        date: "2026-07-14",
        paidDate: "2026-07-15",
        amount: "5",
        remark: "ok",
        customer: { code: "C1", name: "Client" },
        fileName: "",
      }).paid_date,
    ).toBe("2026-07-15");
  });
});
