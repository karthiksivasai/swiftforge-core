import { z } from "zod";

const HOSTNAME =
  /^(localhost|((\d{1,3}\.){3}\d{1,3})|([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+)$/;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isRealIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export const invoiceLastNoSchema = z.object({
  invoice_no: z
    .string()
    .trim()
    .min(1, "Invoice No. is required")
    .regex(/^\d+$/, "Invoice No. must be a whole number (0 or greater)"),
});

export const entryLockDateSchema = z.object({
  entry_lock_date: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || isRealIsoDate(value),
      "Entry Lock Date must be a valid date (dd/MM/yyyy)",
    ),
});

export const creditLimitPercentageSchema = z.object({
  percentage: z
    .string()
    .trim()
    .min(1, "Percentage is required")
    .regex(/^\d+(\.\d+)?$/, "Percentage must be a number")
    .refine((value) => {
      const number = Number(value);
      return number >= 0 && number <= 100;
    }, "Percentage must be between 0 and 100"),
});

/** Suggest 465 only when SSL is first turned on and the port box is still empty. */
export function suggestedSslPort(ssl: boolean, currentPort: string): string | null {
  if (ssl && currentPort.trim() === "") return "465";
  return null;
}

export function setupEmailConfigSchema(passwordRequired: boolean) {
  return z
    .object({
      smtpServer: z
        .string()
        .trim()
        .min(1, "SMTP Server is required")
        .regex(HOSTNAME, "SMTP Server must be a valid hostname"),
      smtpPort: z
        .string()
        .trim()
        .min(1, "SMTP Port is required")
        .regex(/^\d+$/, "SMTP Port must be a whole number")
        .refine((value) => {
          const port = Number(value);
          return port >= 1 && port <= 65535;
        }, "SMTP Port must be between 1 and 65535"),
      fromEmail: z
        .string()
        .trim()
        .min(1, "From Email is required")
        .regex(EMAIL, "From Email must be a valid email"),
      mailUserId: z.string().trim().min(1, "Mail User ID is required"),
      mailPassword: z.string(),
      messageDear: z.string().trim().min(1, "Message Dear is required"),
      messageSubject: z.string().trim().min(1, "Message Subject is required"),
      messageBody: z.string().trim().min(1, "Message Body is required"),
      ssl: z.boolean({
        required_error: "SSL is required",
        invalid_type_error: "SSL is required",
      }),
    })
    .superRefine((value, ctx) => {
      if (passwordRequired && value.mailPassword.trim() === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["mailPassword"],
          message: "Mail Password is required",
        });
      }
    });
}

export const SETUP_EMAIL_MODULE_NAMES = [
  "EMAIL ON FORWARDING",
  "EMAIL ON PROGRESS",
  "ESTATEMENT",
  "ESTATEMENT WEIGHT ALERT",
] as const;

export const FORM_SETUP_MODULE_NAMES = [
  "AWB Entry",
  "Manifest",
  "Scan",
  "PickUp Inscan",
  "AWB Query",
  "DRS Scan",
  "PickUp",
  "RCP Entry",
] as const;
