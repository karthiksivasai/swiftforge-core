/** Utility → Tax/Charges Setup → Setup. */

export type MiscellaneousBlock = "LAST_NO" | "ENTRY_LOCK" | "CREDIT_PCT";

export type MiscellaneousSetup = {
  branch_id: string | null;
  invoice_no: string;
  invoice_row_version: number | null;
  entry_lock_date: string;
  entry_lock_row_version: number | null;
  credit_limit_percentage: string;
  credit_limit_row_version: number | null;
};

export type SetupEmailConfig = {
  id: string | null;
  row_version: number | null;
  has_password: boolean;
  smtpServer: string;
  smtpPort: string;
  fromEmail: string;
  mailUserId: string;
  mailPassword: string;
  messageDear: string;
  messageSubject: string;
  messageBody: string;
  ssl: boolean;
  printFlags: Record<string, boolean | string>;
};

export type EmailFooterRow = { controlName: string; code: string };

export type FormFieldConfig = {
  name: string;
  enabled: boolean;
  value: string;
  type: "checkbox" | "text";
};

export type FormSetupRecord = {
  module: string;
  fields: FormFieldConfig[];
  row_version: number | null;
};
