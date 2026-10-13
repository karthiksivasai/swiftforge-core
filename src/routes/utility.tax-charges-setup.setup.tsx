import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ZodError } from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MasterBreadcrumb } from "@/components/master-table-kit";
import { useAuth } from "@/lib/auth";
import { useActiveBranch } from "@/lib/branch-context";
import { toErrorMessage } from "@/lib/masters/screen";
import { testEmailConfiguration } from "@/lib/notifications/delivery";
import { canDo, UTILITY_NOTIFICATION_PERMISSIONS } from "@/lib/permissions";
import {
  DEFAULT_FOOTER_ROWS,
  EMAIL_MODULE_OPTIONS,
  emptyEmailConfig,
  isSmtpModule,
  MODULE_EXTRA_FIELDS,
  type EmailModuleName,
} from "@/lib/utility-setup/email-modules";
import {
  defaultFormSetup,
  FORM_SETUP_MODULES,
  mergeFormSetup,
  type FormSetupModuleKey,
} from "@/lib/utility-setup/form-setup";
import { defaultEstatementColumns, mergeEstatementColumns } from "@/lib/utility-setup/estatement";
import type { EstatementColumnRow } from "@/lib/utility-setup/estatement";
import {
  getEmailFooter,
  getEstatementColumns,
  getFormSetup,
  getSetupEmailModule,
  getUtilityMiscellaneous,
  saveCreditLimitPercentage,
  saveEmailFooter,
  saveEntryLockDate,
  saveEstatementColumns,
  saveFormSetup,
  saveInvoiceLastNo,
  saveSetupEmailModule,
  saveSetupKyc,
} from "@/lib/utility-setup/resources";
import {
  creditLimitPercentageSchema,
  entryLockDateSchema,
  invoiceLastNoSchema,
  setupEmailConfigSchema,
  suggestedSslPort,
} from "@/lib/utility-setup/schemas";
import type { EmailFooterRow, FormFieldConfig, SetupEmailConfig } from "@/lib/utility-setup/types";

type TabKey = "miscellaneous" | "setup" | "form";
type SetupPanel =
  | { kind: "email"; module: EmailModuleName }
  | { kind: "footer" }
  | { kind: "kyc" }
  | { kind: "form"; module: FormSetupModuleKey }
  | null;

export const Route = createFileRoute("/utility/tax-charges-setup/setup")({
  head: () => ({
    meta: [
      { title: "Setup — Utility — Courier ERP" },
      {
        name: "description",
        content: "Configure branch invoice numbers, entry lock, credit alerts, and module email.",
      },
    ],
  }),
  component: SetupPage,
});

function errorMessage(error: unknown): string {
  if (error instanceof ZodError) return error.issues[0]?.message ?? "Invalid value";
  return toErrorMessage(error);
}

function isoToDmy(value: string): string {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : "";
}

function SetupPage() {
  const { isAuthenticated: authed, permissions } = useAuth();
  const { activeBranchId } = useActiveBranch();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey>("miscellaneous");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceVersion, setInvoiceVersion] = useState<number | null>(null);
  const [entryLockDate, setEntryLockDate] = useState("");
  const [entryLockVersion, setEntryLockVersion] = useState<number | null>(null);
  const [creditLimitPercentage, setCreditLimitPercentage] = useState("");
  const [creditVersion, setCreditVersion] = useState<number | null>(null);
  const [moduleName, setModuleName] = useState<EmailModuleName>("EMAIL ON FORWARDING");
  const [formModuleName, setFormModuleName] = useState<FormSetupModuleKey>("AWB Entry");
  const [panel, setPanel] = useState<SetupPanel>(null);
  const [emailConfig, setEmailConfig] = useState<SetupEmailConfig>(emptyEmailConfig());
  const [emailSnapshot, setEmailSnapshot] = useState<SetupEmailConfig>(emptyEmailConfig());
  const [footerRows, setFooterRows] = useState<EmailFooterRow[]>(DEFAULT_FOOTER_ROWS);
  const [footerSnapshot, setFooterSnapshot] = useState<EmailFooterRow[]>(DEFAULT_FOOTER_ROWS);
  const [footerVersion, setFooterVersion] = useState<number | null>(null);
  const [formFields, setFormFields] = useState<FormFieldConfig[]>(defaultFormSetup("AWB Entry"));
  const [formSnapshot, setFormSnapshot] = useState<FormFieldConfig[]>(defaultFormSetup("AWB Entry"));
  const [formVersion, setFormVersion] = useState<number | null>(null);
  const [statementColumns, setStatementColumns] = useState<EstatementColumnRow[]>(
    defaultEstatementColumns(),
  );
  const [statementSnapshot, setStatementSnapshot] = useState<EstatementColumnRow[]>(
    defaultEstatementColumns(),
  );
  const [statementVersion, setStatementVersion] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const canModify =
    !authed ||
    canDo(permissions, UTILITY_NOTIFICATION_PERMISSIONS.notification, "modify") ||
    canDo(permissions, UTILITY_NOTIFICATION_PERMISSIONS.xpresionSetup, "modify") ||
    canDo(permissions, UTILITY_NOTIFICATION_PERMISSIONS.notification, "add") ||
    canDo(permissions, UTILITY_NOTIFICATION_PERMISSIONS.xpresionSetup, "add");

  const miscQuery = useQuery({
    queryKey: ["utility-setup-miscellaneous", activeBranchId],
    queryFn: () => getUtilityMiscellaneous(activeBranchId),
    enabled: authed,
  });

  useEffect(() => {
    const data = miscQuery.data;
    if (!data) return;
    setInvoiceNo(data.invoice_no);
    setInvoiceVersion(data.invoice_row_version);
    setEntryLockDate(data.entry_lock_date);
    setEntryLockVersion(data.entry_lock_row_version);
    setCreditLimitPercentage(data.credit_limit_percentage);
    setCreditVersion(data.credit_limit_row_version);
  }, [miscQuery.data]);

  const applyMisc = (data: Awaited<ReturnType<typeof getUtilityMiscellaneous>>) => {
    queryClient.setQueryData(["utility-setup-miscellaneous", activeBranchId], data);
  };

  const saveLastNo = async () => {
    if (!canModify) return toast.error("Permission denied");
    try {
      invoiceLastNoSchema.parse({ invoice_no: invoiceNo });
      if (!authed) return toast.success("LAST NO. SETUP saved");
      setBusy("invoice");
      const saved = await saveInvoiceLastNo({
        invoiceNo,
        branchId: activeBranchId,
        rowVersion: invoiceVersion,
      });
      applyMisc(saved);
      toast.success("LAST NO. SETUP saved for this branch");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const saveLockDate = async () => {
    if (!canModify) return toast.error("Permission denied");
    try {
      entryLockDateSchema.parse({ entry_lock_date: entryLockDate });
      if (!authed) return toast.success("MISCELLANEOUS saved");
      setBusy("lock");
      const saved = await saveEntryLockDate({
        entryLockDate,
        rowVersion: entryLockVersion,
      });
      applyMisc(saved);
      toast.success("Entry Lock Date saved");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const saveCredit = async () => {
    if (!canModify) return toast.error("Permission denied");
    try {
      creditLimitPercentageSchema.parse({ percentage: creditLimitPercentage });
      if (!authed) return toast.success("Credit Limit Email on % saved");
      setBusy("credit");
      const saved = await saveCreditLimitPercentage({
        percentage: creditLimitPercentage,
        rowVersion: creditVersion,
      });
      applyMisc(saved);
      toast.success("Credit Limit Email on % saved");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const searchModule = async () => {
    if (moduleName === "KYC XPRESION") {
      setPanel({ kind: "kyc" });
      return;
    }
    if (moduleName === "E-MAIL FOOTER") {
      if (!authed) {
        setFooterRows(DEFAULT_FOOTER_ROWS.map((row) => ({ ...row })));
        setFooterSnapshot(DEFAULT_FOOTER_ROWS.map((row) => ({ ...row })));
        setPanel({ kind: "footer" });
        return;
      }
      try {
        const saved = await getEmailFooter();
        const rows = saved.rows.length
          ? DEFAULT_FOOTER_ROWS.map((row) => ({
              ...row,
              code: saved.rows.find((item) => item.controlName === row.controlName)?.code ?? row.code,
            }))
          : DEFAULT_FOOTER_ROWS.map((row) => ({ ...row }));
        setFooterRows(rows);
        setFooterSnapshot(rows.map((row) => ({ ...row })));
        setFooterVersion(saved.row_version);
        setPanel({ kind: "footer" });
      } catch (error) {
        toast.error(errorMessage(error));
      }
      return;
    }
    if (!authed) {
      const blank = emptyEmailConfig();
      setEmailConfig(blank);
      setEmailSnapshot(blank);
      if (moduleName === "ESTATEMENT") {
        const rows = defaultEstatementColumns();
        setStatementColumns(rows);
        setStatementSnapshot(rows.map((row) => ({ ...row })));
        setStatementVersion(null);
      }
      setPanel({ kind: "email", module: moduleName });
      return;
    }
    try {
      const saved = await getSetupEmailModule(moduleName);
      const next = saved ?? emptyEmailConfig();
      setEmailConfig(next);
      setEmailSnapshot(next);
      if (moduleName === "ESTATEMENT") {
        const columns = await getEstatementColumns();
        const rows = mergeEstatementColumns(columns.rows);
        setStatementColumns(rows);
        setStatementSnapshot(rows.map((row) => ({ ...row })));
        setStatementVersion(columns.row_version);
      }
      setPanel({ kind: "email", module: moduleName });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const updateEmail = async () => {
    if (!panel || panel.kind !== "email") return;
    if (!canModify) return toast.error("Permission denied");
    if (!isSmtpModule(panel.module)) return;
    try {
      setupEmailConfigSchema(!emailConfig.has_password).parse(emailConfig);
      if (!authed) return toast.success(`${panel.module} updated`);
      setBusy("email");
      const saved = await saveSetupEmailModule({ moduleName: panel.module, config: emailConfig });
      setEmailConfig(saved);
      setEmailSnapshot(saved);
      toast.success(`${panel.module} updated`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const updateFooter = async () => {
    if (!canModify) return toast.error("Permission denied");
    try {
      if (!authed) return toast.success("E-MAIL FOOTER updated");
      setBusy("footer");
      const saved = await saveEmailFooter({ rows: footerRows, rowVersion: footerVersion });
      setFooterRows(saved.rows);
      setFooterSnapshot(saved.rows.map((row) => ({ ...row })));
      setFooterVersion(saved.row_version);
      toast.success("E-MAIL FOOTER updated");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const updateKyc = async () => {
    if (!canModify) return toast.error("Permission denied");
    try {
      if (!authed) return toast.success("KYC XPRESION updated");
      setBusy("kyc");
      await saveSetupKyc(null);
      toast.success("KYC XPRESION updated");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const searchForm = async () => {
    if (!authed) {
      const fields = defaultFormSetup(formModuleName);
      setFormFields(fields);
      setFormSnapshot(fields.map((row) => ({ ...row })));
      setFormVersion(null);
      setPanel({ kind: "form", module: formModuleName });
      return;
    }
    try {
      const saved = await getFormSetup(formModuleName);
      const fields = mergeFormSetup(formModuleName, saved.fields);
      setFormFields(fields);
      setFormSnapshot(fields.map((row) => ({ ...row })));
      setFormVersion(saved.row_version);
      setPanel({ kind: "form", module: formModuleName });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const updateForm = async () => {
    if (!panel || panel.kind !== "form") return;
    if (!canModify) return toast.error("Permission denied");
    try {
      if (!authed) return toast.success(`${panel.module} form setup saved`);
      setBusy("form");
      const saved = await saveFormSetup({
        moduleName: panel.module,
        fields: formFields,
        rowVersion: formVersion,
      });
      const fields = mergeFormSetup(panel.module, saved.fields);
      setFormFields(fields);
      setFormSnapshot(fields.map((row) => ({ ...row })));
      setFormVersion(saved.row_version);
      toast.success(`${panel.module} form setup saved`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const updateStatementColumns = async () => {
    if (!canModify) return toast.error("Permission denied");
    try {
      if (!authed) return toast.success("eStatement columns updated");
      setBusy("statement");
      const saved = await saveEstatementColumns({
        rows: statementColumns,
        rowVersion: statementVersion,
      });
      const rows = mergeEstatementColumns(saved.rows);
      setStatementColumns(rows);
      setStatementSnapshot(rows.map((row) => ({ ...row })));
      setStatementVersion(saved.row_version);
      toast.success("eStatement columns updated");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const cancelPanel = () => {
    if (panel?.kind === "email") {
      setEmailConfig(emailSnapshot);
      setStatementColumns(statementSnapshot.map((row) => ({ ...row })));
    }
    if (panel?.kind === "footer") setFooterRows(footerSnapshot.map((row) => ({ ...row })));
    if (panel?.kind === "form") setFormFields(formSnapshot.map((row) => ({ ...row })));
    setPanel(null);
  };

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <MasterBreadcrumb trail={["Utility", "Tax / Charges Setup", "Setup"]} />

      <div className="flex items-center gap-2">
        <TabButton active={tab === "miscellaneous"} onClick={() => setTab("miscellaneous")}>
          MISCELLANEOUS
        </TabButton>
        <TabButton active={tab === "setup"} onClick={() => setTab("setup")}>
          SETUP
        </TabButton>
        <TabButton active={tab === "form"} onClick={() => setTab("form")}>
          FORM SETUP
        </TabButton>
      </div>

      {tab === "miscellaneous" ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <MiniSaveCard
            title="LAST NO. SETUP"
            label="Invoice No."
            value={invoiceNo}
            inputMode="numeric"
            hint="Whole number, saved for the current branch. The next invoice is this number + 1."
            busy={busy === "invoice"}
            onChange={(value) => setInvoiceNo(value.replace(/\D/g, ""))}
            onSave={() => void saveLastNo()}
          />
          <MiniSaveCard
            title="MISCELLANEOUS"
            label="Entry Lock Date"
            type="date"
            value={entryLockDate}
            required={false}
            hint={
              entryLockDate
                ? `${isoToDmy(entryLockDate)} (dd/MM/yyyy). Entries before this date cannot be edited or deleted.`
                : "Optional. Leave blank to allow every edit and delete. Format dd/MM/yyyy."
            }
            busy={busy === "lock"}
            onChange={setEntryLockDate}
            onSave={() => void saveLockDate()}
          />
          <MiniSaveCard
            title="Credit Limit Email on %"
            label="Percentage"
            value={creditLimitPercentage}
            inputMode="decimal"
            hint="Number from 0 to 100. Sends the credit-limit alert when utilization reaches this percent."
            busy={busy === "credit"}
            onChange={(value) => setCreditLimitPercentage(value.replace(/[^\d.]/g, ""))}
            onSave={() => void saveCredit()}
          />
        </div>
      ) : null}

      {tab === "setup" ? (
        <div className="flex flex-col gap-4">
          <Card className="w-full max-w-3xl border p-4">
            <div className="flex flex-wrap items-end gap-8">
              <SelectField
                label="Module Name"
                value={moduleName}
                options={[...EMAIL_MODULE_OPTIONS]}
                onChange={(value) => setModuleName(value as EmailModuleName)}
              />
              <Button
                onClick={() => void searchModule()}
                className="h-9 rounded-full bg-slate-600 px-8 text-white hover:bg-slate-700"
              >
                Search
              </Button>
            </div>
          </Card>

          {panel?.kind === "email" ? (
            <Card className="w-full max-w-3xl border p-4">
              <EmailSetup
                moduleName={panel.module}
                config={emailConfig}
                busy={busy === "email"}
                patch={(updates) => setEmailConfig((current) => ({ ...current, ...updates }))}
                onCancel={cancelPanel}
                onUpdate={() => void updateEmail()}
              />
            </Card>
          ) : null}

          {panel?.kind === "email" && panel.module === "ESTATEMENT" ? (
            <Card className="w-full max-w-3xl border p-4">
              <EstatementColumnSetup
                rows={statementColumns}
                setRows={setStatementColumns}
                busy={busy === "statement"}
                onUpdate={() => void updateStatementColumns()}
              />
            </Card>
          ) : null}

          {panel?.kind === "footer" ? (
            <Card className="w-full max-w-3xl border p-4">
              <FooterSetup
                rows={footerRows}
                busy={busy === "footer"}
                setRows={setFooterRows}
                onCancel={cancelPanel}
                onUpdate={() => void updateFooter()}
              />
            </Card>
          ) : null}

          {panel?.kind === "kyc" ? (
            <Card className="w-full max-w-3xl border p-4">
              <div className="space-y-6">
                <HeaderRow />
                <p className="text-xs text-muted-foreground">No extra KYC Xpresion fields.</p>
                <ActionButtons
                  busy={busy === "kyc"}
                  onUpdate={() => void updateKyc()}
                  onCancel={cancelPanel}
                />
              </div>
            </Card>
          ) : null}

        </div>
      ) : null}

      {tab === "form" ? (
        <div className="flex flex-col gap-4">
          <Card className="w-full max-w-3xl border p-4">
            <div className="flex flex-wrap items-end gap-8">
              <SelectField
                label="Form Setup"
                value={formModuleName}
                options={[...FORM_SETUP_MODULES]}
                onChange={(value) => setFormModuleName(value as FormSetupModuleKey)}
              />
              <Button
                onClick={() => void searchForm()}
                className="h-9 rounded-full bg-slate-600 px-8 text-white hover:bg-slate-700"
              >
                Search
              </Button>
            </div>
          </Card>

          {panel?.kind === "form" ? (
            <FormFieldSetup
              moduleName={panel.module}
              fields={formFields}
              busy={busy === "form"}
              setFields={setFormFields}
              onSave={() => void updateForm()}
              onCancel={cancelPanel}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function MiniSaveCard({
  title,
  label,
  value,
  onChange,
  onSave,
  type = "text",
  hint,
  busy,
  inputMode,
  required = true,
}: {
  title: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  type?: string;
  hint?: string;
  busy?: boolean;
  inputMode?: "numeric" | "decimal" | "text";
  required?: boolean;
}) {
  return (
    <Card className="relative border p-4 pt-7">
      <span className="absolute -top-3 left-4 rounded-full bg-sidebar px-4 py-1 text-xs font-semibold text-sidebar-foreground shadow">
        {title}
      </span>
      <TextField
        label={label}
        value={value}
        onChange={onChange}
        type={type}
        required={required}
        inputMode={inputMode}
      />
      {hint ? <p className="mt-2 text-[11px] text-muted-foreground">{hint}</p> : null}
      <div className="mt-4 flex justify-center">
        <Button
          disabled={busy}
          onClick={onSave}
          className="h-8 rounded-full bg-green-500 px-10 text-white hover:bg-green-600"
        >
          Save
        </Button>
      </div>
    </Card>
  );
}

export function EmailSetup({
  moduleName,
  config,
  patch,
  onCancel,
  onUpdate,
  busy,
}: {
  moduleName: EmailModuleName;
  config: SetupEmailConfig;
  patch: (updates: Partial<SetupEmailConfig>) => void;
  onCancel: () => void;
  onUpdate: () => void;
  busy?: boolean;
}) {
  const extras = MODULE_EXTRA_FIELDS[moduleName] ?? [];
  return (
    <div className="space-y-3">
      <HeaderRow />
      <TextField
        label="SMTP Server"
        required
        value={config.smtpServer}
        onChange={(smtpServer) => patch({ smtpServer })}
      />
      <TextField
        label="SMTP Port"
        required
        value={config.smtpPort}
        inputMode="numeric"
        onChange={(smtpPort) => patch({ smtpPort: smtpPort.replace(/\D/g, "") })}
      />
      <TextField
        label="From Email"
        required
        value={config.fromEmail}
        onChange={(fromEmail) => patch({ fromEmail })}
      />
      <TextField
        label="Mail User ID"
        required
        value={config.mailUserId}
        onChange={(mailUserId) => patch({ mailUserId })}
      />
      <TextField
        label={config.has_password ? "Mail Password (leave blank to keep)" : "Mail Password"}
        required={!config.has_password}
        value={config.mailPassword}
        onChange={(mailPassword) => patch({ mailPassword })}
        type="password"
      />
      <TextField
        label="Message Dear"
        required
        value={config.messageDear}
        onChange={(messageDear) => patch({ messageDear })}
      />
      <TextField
        label="Message Subject"
        required
        value={config.messageSubject}
        onChange={(messageSubject) => patch({ messageSubject })}
      />
      <label className="grid grid-cols-[11rem_1fr] items-start gap-4 text-xs">
        <span>
          Message Body <span className="text-destructive">*</span>
        </span>
        <Textarea
          value={config.messageBody}
          onChange={(event) => patch({ messageBody: event.target.value })}
          className="min-h-24"
        />
      </label>
      <CheckRow
        label="SSL"
        checked={config.ssl}
        onChange={(ssl) => {
          const next: Partial<SetupEmailConfig> = { ssl };
          const suggested = suggestedSslPort(ssl, config.smtpPort);
          if (suggested) next.smtpPort = suggested;
          patch(next);
        }}
      />
      {extras.map((field) =>
        field.kind === "boolean" ? (
          <CheckRow
            key={field.key}
            label={field.label}
            checked={config.printFlags[field.key] === true}
            onChange={(checked) =>
              patch({ printFlags: { ...config.printFlags, [field.key]: checked } })
            }
          />
        ) : (
          <TextField
            key={field.key}
            label={field.label}
            type={field.kind === "text" ? "text" : field.kind}
            value={String(config.printFlags[field.key] ?? "")}
            onChange={(value) =>
              patch({ printFlags: { ...config.printFlags, [field.key]: value } })
            }
          />
        ),
      )}
      <ActionButtons
        onUpdate={onUpdate}
        onCancel={onCancel}
        busy={busy}
        onTest={() => {
          void (async () => {
            const to = window.prompt("Send test email to:", config.fromEmail || "");
            if (!to?.trim()) return;
            try {
              const result = await testEmailConfiguration({ to: to.trim() });
              toast.success(`Test email ${result.status} (${result.provider ?? "SANDBOX"})`);
            } catch (error) {
              toast.error(errorMessage(error));
            }
          })();
        }}
      />
    </div>
  );
}

function EstatementColumnSetup({
  rows,
  setRows,
  onUpdate,
  busy,
}: {
  rows: EstatementColumnRow[];
  setRows: React.Dispatch<React.SetStateAction<EstatementColumnRow[]>>;
  onUpdate: () => void;
  busy?: boolean;
}) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold">Column Mapping</h2>
      <p className="text-[11px] text-muted-foreground">
        A blank Code hides that column. Order No sets the sequence in the statement.
      </p>
      <div className="grid grid-cols-[minmax(9rem,1fr)_minmax(8rem,1fr)_6rem] gap-3 border-b pb-2 text-xs font-medium">
        <span>Column</span>
        <span>Code</span>
        <span>Order No</span>
      </div>
      <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
        {rows.map((row, index) => (
          <div
            key={row.column}
            className="grid grid-cols-[minmax(9rem,1fr)_minmax(8rem,1fr)_6rem] items-center gap-3 text-xs"
          >
            <span>{row.column}</span>
            <Input
              value={row.code}
              onChange={(event) =>
                setRows((current) =>
                  current.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, code: event.target.value } : item,
                  ),
                )
              }
              className="h-8"
            />
            <Input
              value={row.orderNo}
              inputMode="numeric"
              onChange={(event) =>
                setRows((current) =>
                  current.map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, orderNo: event.target.value.replace(/\D/g, "") }
                      : item,
                  ),
                )
              }
              className="h-8"
            />
          </div>
        ))}
      </div>
      <div className="flex justify-center pt-2">
        <Button
          disabled={busy}
          onClick={onUpdate}
          className="h-8 rounded-full bg-green-500 px-10 text-white hover:bg-green-600"
        >
          Update
        </Button>
      </div>
    </div>
  );
}

function FooterSetup({
  rows,
  setRows,
  onCancel,
  onUpdate,
  busy,
}: {
  rows: EmailFooterRow[];
  setRows: React.Dispatch<React.SetStateAction<EmailFooterRow[]>>;
  onCancel: () => void;
  onUpdate: () => void;
  busy?: boolean;
}) {
  return (
    <div className="space-y-3">
      <HeaderRow />
      {rows.map((row, index) => (
        <div key={row.controlName} className="grid grid-cols-[11rem_1fr] items-center gap-4 text-xs">
          <span>{row.controlName}</span>
          <Input
            value={row.code}
            onChange={(event) =>
              setRows((current) =>
                current.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, code: event.target.value } : item,
                ),
              )
            }
            className="h-9"
          />
        </div>
      ))}
      <ActionButtons onUpdate={onUpdate} onCancel={onCancel} busy={busy} />
    </div>
  );
}

function FormFieldSetup({
  moduleName,
  fields,
  setFields,
  onSave,
  onCancel,
  busy,
}: {
  moduleName: FormSetupModuleKey;
  fields: FormFieldConfig[];
  setFields: React.Dispatch<React.SetStateAction<FormFieldConfig[]>>;
  onSave: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  return (
    <Card className="w-full max-w-5xl border p-4">
      <h2 className="mb-4 text-sm font-semibold">{moduleName}</h2>
      <div className="mb-3 grid grid-cols-[minmax(16rem,1fr)_minmax(12rem,1fr)] gap-8 border-b pb-2 text-xs font-medium">
        <span>Code</span>
        <span>Description</span>
      </div>
      <div className="space-y-2 pr-2">
        {fields.map((field, index) => (
          <div
            key={field.name}
            className="grid grid-cols-[minmax(16rem,1fr)_minmax(12rem,1fr)] items-center gap-8 text-xs"
          >
            <span>{field.name}</span>
            {field.type === "checkbox" ? (
              <Checkbox
                checked={field.enabled}
                onCheckedChange={(checked) =>
                  setFields((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, enabled: Boolean(checked) } : item,
                    ),
                  )
                }
              />
            ) : (
              <Input
                value={field.value}
                onChange={(event) =>
                  setFields((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, value: event.target.value } : item,
                    ),
                  )
                }
                className="h-9"
              />
            )}
          </div>
        ))}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button
          disabled={busy}
          onClick={onSave}
          className="h-8 rounded-full bg-green-500 px-8 text-white hover:bg-green-600"
        >
          Update
        </Button>
        <Button
          onClick={onCancel}
          className="h-8 rounded-full bg-red-500 px-8 text-white hover:bg-red-600"
        >
          Cancel
        </Button>
      </div>
    </Card>
  );
}

function HeaderRow() {
  return (
    <div className="grid grid-cols-[11rem_1fr] border-b pb-2 text-xs font-medium">
      <span>Control Name</span>
      <span>Code</span>
    </div>
  );
}

function ActionButtons({
  onUpdate,
  onCancel,
  onTest,
  busy,
}: {
  onUpdate: () => void;
  onCancel: () => void;
  onTest?: () => void;
  busy?: boolean;
}) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      {onTest ? (
        <Button disabled={busy} variant="outline" onClick={onTest} className="h-8 rounded-full px-6">
          Test Email
        </Button>
      ) : null}
      <Button
        disabled={busy}
        onClick={onUpdate}
        className="h-8 rounded-full bg-green-500 px-8 text-white hover:bg-green-600"
      >
        Update
      </Button>
      <Button
        onClick={onCancel}
        className="h-8 rounded-full bg-red-500 px-8 text-white hover:bg-red-600"
      >
        Cancel
      </Button>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  required,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  inputMode?: "numeric" | "decimal" | "text";
}) {
  return (
    <label className="grid grid-cols-[11rem_1fr] items-center gap-4 text-xs">
      <span>
        {label}
        {required ? <span className="text-destructive"> *</span> : ""}
      </span>
      <Input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9"
        required={required}
      />
    </label>
  );
}

function CheckRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="grid grid-cols-[11rem_1fr] items-center gap-4 text-xs">
      <span>{label}</span>
      <Checkbox checked={checked} onCheckedChange={(value) => onChange(Boolean(value))} />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex w-72 flex-col gap-1 text-xs font-medium text-foreground">
      {label} *
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9">
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "default" : "ghost"}
      className={`h-8 rounded-full px-4 ${active ? "bg-sidebar text-sidebar-foreground hover:bg-sidebar/90" : "text-muted-foreground"}`}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
