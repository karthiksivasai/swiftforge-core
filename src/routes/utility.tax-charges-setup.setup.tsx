import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import { MasterBreadcrumb } from "@/components/master-table-kit";
import { useAuth } from "@/lib/auth";
import { toErrorMessage } from "@/lib/masters/screen";
import { listEmailConfigurations, saveEmailConfiguration } from "@/lib/notifications/resources";
import { testEmailConfiguration } from "@/lib/notifications/delivery";
import { emailConfigurationSchema } from "@/lib/notifications/schemas";
import { EMAIL_MODULE_CODES } from "@/lib/notifications/types";
import { canDo, UTILITY_NOTIFICATION_PERMISSIONS } from "@/lib/permissions";

type TabKey = "miscellaneous" | "setup" | "formSetup";

type ModuleKey =
  | "EMAIL ON FORWARDING"
  | "EMAIL ON PROGRESS"
  | "ESTATEMENT"
  | "ESTATEMENT WEIGHT ALERT"
  | "KYC XPRESION"
  | "E-MAIL FOOTER";

type EmailConfig = {
  smtpServer: string;
  smtpPort: string;
  fromEmail: string;
  mailUserId: string;
  mailPassword: string;
  messageDear: string;
  messageSubject: string;
  messageBody: string;
  ssl: boolean;
  date?: string;
  sendingTime?: string;
  printDoxSpx?: boolean;
  printPcs?: boolean;
  printWeight?: boolean;
  printVendorName?: boolean;
  printSender?: boolean;
  origin?: boolean;
  consignee?: boolean;
  printVendorAwbNo?: boolean;
  id?: string;
  row_version?: number;
  has_password?: boolean;
};

type FormFieldConfig = {
  name: string;
  enabled: boolean;
  value: string;
  type: "checkbox" | "text";
};

type FormSetupModuleKey =
  | "AWB Entry"
  | "ManifestsScan"
  | "PickUp Inscan"
  | "AWB Query"
  | "DRS Scan"
  | "PickUp"
  | "RCP Entry";

const moduleOptions: ModuleKey[] = [
  "EMAIL ON FORWARDING",
  "EMAIL ON PROGRESS",
  "ESTATEMENT",
  "ESTATEMENT WEIGHT ALERT",
  "KYC XPRESION",
  "E-MAIL FOOTER",
];

const formSetupModuleOptions: FormSetupModuleKey[] = [
  "AWB Entry",
  "ManifestsScan",
  "PickUp Inscan",
  "AWB Query",
  "DRS Scan",
  "PickUp",
  "RCP Entry",
];

const emailDefaults: Record<Exclude<ModuleKey, "KYC XPRESION" | "E-MAIL FOOTER">, EmailConfig> = {
  "EMAIL ON FORWARDING": {
    smtpServer: "smtpout.secureserver.net",
    smtpPort: "25",
    fromEmail: "coo@shipwala.com",
    mailUserId: "coo@shipwala.com",
    mailPassword: "",
    messageDear: "Dear Sir/Madam,",
    messageSubject: "Forwarding Shipment Details",
    messageBody: "Please note your Shipment Forwarding Details",
    ssl: true,
    printDoxSpx: false,
    printPcs: false,
    printWeight: false,
    printVendorName: false,
  },
  "EMAIL ON PROGRESS": {
    smtpServer: "smtpout.secureserver.net",
    smtpPort: "25",
    fromEmail: "coo@shipwala.com",
    mailUserId: "coo@shipwala.com",
    mailPassword: "",
    messageDear: "Dear Sir/Madam,",
    messageSubject: "Shipment Progress Details",
    messageBody: "Please note your Shipment progress details below",
    ssl: true,
  },
  ESTATEMENT: {
    smtpServer: "smtpout.secureserver.net",
    smtpPort: "465",
    fromEmail: "ceo@shipwala.com",
    mailUserId: "ceo@shipwala.com",
    mailPassword: "",
    messageDear: "Dear Sir / Madam,",
    messageSubject: "Your shipment Booking details by Courierwala",
    messageBody: "Thank You for choosing Courierwala Express.",
    ssl: true,
    date: "1100",
    sendingTime: "30",
  },
  "ESTATEMENT WEIGHT ALERT": {
    smtpServer: "smtpout.secureserver.net",
    smtpPort: "25",
    fromEmail: "coo@shipwala.com",
    mailUserId: "coo@shipwala.com",
    mailPassword: "",
    messageDear: "Sir/Madam,",
    messageSubject: "Weight Change Alert",
    messageBody: "",
    ssl: true,
    printSender: false,
    origin: false,
    consignee: true,
    printVendorAwbNo: false,
    printVendorName: false,
    printPcs: false,
  },
};

const estatementFields = [
  "Act_Weight",
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
];

const formSetupDefinitions: Record<FormSetupModuleKey, FormFieldConfig[]> = {
  "AWB Entry": [
    ["SHIPMENT HOLD", "checkbox", false, ""],
    ["VOLUMETRIC ACTUAL WEIGHT ONCE", "checkbox", true, ""],
    ["NOVALIDATION INSCAN", "checkbox", true, ""],
    ["MTS", "checkbox", true, ""],
    ["COD AND TOPAY RECEIPT", "checkbox", false, ""],
    ["ADDITIONAL TAT", "text", false, ""],
    ["DEFAULT_SERVICE", "text", false, ""],
    ["CUSTOMER VOLUMETRIC WEIGHT", "checkbox", false, ""],
    ["LOCK_STOCK", "text", false, ""],
    ["FUELSURCHARGEWEIGHT", "checkbox", false, ""],
    ["VOLUMEDISCOUNT", "checkbox", false, ""],
    ["AWB CHARGES CODE", "text", false, ""],
    ["ODA PIN CHARGE CODE", "text", false, ""],
    ["NEW EXCEL RATE", "checkbox", true, ""],
    ["NON SERVICE PIN CHARGES", "checkbox", false, ""],
    ["EMAIL ON BOOKING", "text", false, ""],
    ["SMS ON BOOKING", "text", false, ""],
    ["SMS TO CONSIGNEE ON BOOKING", "checkbox", false, ""],
    ["BOOKING PROGRESS", "checkbox", false, ""],
    ["BOOKING PROGRESS TEXT", "text", false, ""],
    ["COMPANY BILLING", "checkbox", false, ""],
    ["POST SELF", "checkbox", false, ""],
    ["REMOTE PINCODE", "checkbox", false, ""],
    ["CUSTINVFORMATO", "checkbox", true, ""],
  ].map(toFormField),
  ManifestsScan: [
    ["BAGWITHMANI", "checkbox", false, ""],
    ["PCSEXPORTSCAN", "checkbox", false, ""],
    ["VENDAWBEXPORTSCAN", "checkbox", true, ""],
    ["DESTEXPORTSCAN", "checkbox", false, ""],
    ["PRODEXPORTSCAN", "checkbox", false, ""],
    ["INSTEXPORTSCAN", "checkbox", false, ""],
    ["MULTI MANIFESTSCAN", "checkbox", false, ""],
    ["Awbtype", "text", false, "C"],
    ["TRANSIT TIME", "checkbox", false, ""],
    ["BAGMODULE", "text", false, ""],
    ["LOCATION CAPTION", "text", false, "Service Centre"],
    ["ENTRYONINSCAN", "checkbox", false, ""],
    ["MANIFEST EXCEL MERGING", "checkbox", false, ""],
    ["BRANCH MANIFEST", "checkbox", true, ""],
    ["EMAIL ON PROGRESS", "text", false, ""],
    ["EXPORTSCANADDAWB", "checkbox", false, ""],
    ["VALIDDESTEXPORTSCAN", "checkbox", false, ""],
    ["NOVALIDATION INSCAN", "checkbox", true, ""],
    ["PREALERT VIEW", "checkbox", false, ""],
    ["COD RETAIL", "checkbox", false, ""],
    ["LOCATION MANIFEST", "checkbox", false, ""],
    ["PIECES RATE", "checkbox", false, ""],
    ["BAG LABLE PRINT", "checkbox", false, ""],
    ["SPLIT AWB GENERATION", "checkbox", false, ""],
    ["MANIFEST AWB CD FOLDER", "text", false, ""],
    ["MANIFEST VENDOR UPDATE", "checkbox", true, ""],
    ["MANIFEST PRODUCT UPDATE", "checkbox", false, ""],
    ["ALLOW DELIVERED MANIFEST DRS", "checkbox", false, ""],
    ["BAGGING CLUSTER", "checkbox", false, ""],
    ["TRANSIT TIME HITMISS", "checkbox", false, ""],
    ["POSTING", "checkbox", false, ""],
    ["REQ INSCAN WEIGHT", "checkbox", false, ""],
    ["PICKUPINSCAN2 ADD AWB", "checkbox", false, ""],
    ["INSCAN DESTINATION UPDATE", "checkbox", false, ""],
  ].map(toFormField),
  "PickUp Inscan": [
    ["MANIFEST INSCAN DATE ENABLE", "checkbox", false, ""],
    ["SHIPMENT HOLD", "checkbox", false, ""],
    ["INSCAN PCS DETAIL", "checkbox", false, ""],
    ["STOCK", "checkbox", false, ""],
    ["FRANCHISE BILLING", "checkbox", false, ""],
    ["COMPANY ENTRY", "checkbox", false, ""],
    ["INSCANADENTRYPROD", "checkbox", false, ""],
    ["INSCANDEST", "checkbox", false, ""],
    ["Awbtype", "text", false, "C"],
    ["CUSTOMER VOLUMETRIC WEIGHT", "checkbox", false, ""],
    ["VOLUMETRIC ACTUAL WEIGHT ONCE", "checkbox", true, ""],
    ["MANIINSCANCUST", "checkbox", false, ""],
    ["PICKUP MODULE", "checkbox", false, ""],
    ["INSCANPAY", "checkbox", false, ""],
    ["INSCAN SERVICE", "checkbox", true, ""],
    ["INSCAN VENDOR", "checkbox", false, ""],
    ["AIRLINE SERVICE", "checkbox", true, ""],
    ["INSCANPCS", "checkbox", false, ""],
    ["INSCANADENTRYWEIGHT", "checkbox", false, ""],
    ["INSCANAMOUNT", "checkbox", false, ""],
    ["EAWB MODULE", "checkbox", false, ""],
    ["VolumetricDivide_InCh", "text", false, "2000"],
    ["VOLUMETRICDIVIDE", "text", false, "5000"],
    ["COSTMODULE", "checkbox", false, ""],
    ["IMPORTSCANNOMANIFEST", "checkbox", false, ""],
    ["IMPORTSCANADENTRY", "checkbox", false, ""],
    ["BAGMODULE", "text", false, ""],
    ["PICKUPINSCAN2 ADD AWB", "text", false, ""],
    ["INSCAN DESTINATION UPDATE", "checkbox", false, ""],
  ].map(toFormField),
  "AWB Query": [
    ["SMS ON DELIVERY URL", "text", false, ""],
    ["NEW OBC MODULE", "checkbox", false, ""],
    ["DRSSCANADAWB", "checkbox", false, ""],
    ["NOVALIDATION INSCAN", "checkbox", true, ""],
    ["ALLOW DELIVERED MANIFEST DRS", "checkbox", false, ""],
    ["REDRS_PODVALIDATE", "checkbox", false, ""],
    ["EMAIL ON PROGRESS", "text", false, ""],
    ["USERS ACCESS GROUP", "checkbox", false, ""],
    ["SMS ON PROGRESS", "text", false, ""],
    ["SHIPPING PROGRESS NOCHECK INSCAN", "checkbox", true, ""],
  ].map(toFormField),
  "DRS Scan": [
    ["DRS DATE ENABLE", "checkbox", false, ""],
    ["DRS PCS DETAIL", "checkbox", false, ""],
    ["DRS VENDOR", "checkbox", false, ""],
    ["DRS SERVICE", "checkbox", true, ""],
    ["DRS DESTINATION", "checkbox", false, ""],
    ["DRS PRODUCT", "checkbox", false, ""],
    ["ALLOW DELIVERED MANIFEST DRS", "checkbox", false, ""],
    ["DRSSCANADAWB", "checkbox", false, ""],
    ["REDRS_PODVALIDATE", "checkbox", false, ""],
    ["NOVALIDATION INSCAN", "checkbox", true, ""],
    ["POD ENTRY OK UPDATE", "checkbox", false, ""],
    ["DRS EXCEL MERGING", "checkbox", false, ""],
    ["SMS ON DELIVERY URL", "text", false, ""],
    ["EMAIL ON PROGRESS", "text", false, ""],
    ["SMS ON PROGRESS", "text", false, ""],
    ["SHIPPING PROGRESS NOCHECK INSCAN", "checkbox", true, ""],
  ].map(toFormField),
  PickUp: [
    ["PICKUP CENTER", "checkbox", false, ""],
    ["PICKUP WEIGHT", "checkbox", false, ""],
    ["PICKUP PRODUCT", "checkbox", false, ""],
    ["PICKUP DIMENSION", "checkbox", false, ""],
    ["NOTCOPYPICKUPSHIPTOCONS", "checkbox", false, ""],
  ].map(toFormField),
  "RCP Entry": [
    ["RCPENTRY AREA", "checkbox", false, ""],
    ["RCPENTRY PAY ACCOUNT", "checkbox", false, ""],
    ["RCPENTRY DRAWN BANK", "checkbox", false, ""],
    ["RCPENTRY CHEQUE DD/NO", "checkbox", true, ""],
    ["RCPENTRY CHEQUE DATE", "checkbox", false, ""],
    ["RCPENTRY BANK CASH", "checkbox", true, ""],
  ].map(toFormField),
};

function toFormField(row: (string | boolean)[]): FormFieldConfig {
  const [name, type, enabled, value] = row as [string, string, boolean, string];
  return { name, type: type as "checkbox" | "text", enabled, value };
}

function buildFormSetupState() {
  return Object.fromEntries(
    formSetupModuleOptions.map((module) => [
      module,
      formSetupDefinitions[module].map((field) => ({ ...field })),
    ]),
  ) as Record<FormSetupModuleKey, FormFieldConfig[]>;
}

export const Route = createFileRoute("/utility/tax-charges-setup/setup")({
  head: () => ({
    meta: [
      { title: "Setup — Utility — Courier ERP" },
      {
        name: "description",
        content: "Configure miscellaneous utility setup and module email controls.",
      },
    ],
  }),
  component: SetupPage,
});

function SetupPage() {
  const { isAuthenticated: authed, permissions } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey>("miscellaneous");
  const [invoiceNo, setInvoiceNo] = useState("223");
  const [entryLockDate, setEntryLockDate] = useState("2018-12-12");
  const [creditLimitPercentage, setCreditLimitPercentage] = useState("0");
  const [moduleName, setModuleName] = useState<ModuleKey>("EMAIL ON FORWARDING");
  const [formModuleName, setFormModuleName] = useState<FormSetupModuleKey>("AWB Entry");
  const [searchedModule, setSearchedModule] = useState<ModuleKey | null>(null);
  const [configs, setConfigs] = useState(emailDefaults);
  const [busy, setBusy] = useState(false);
  const [footerRows, setFooterRows] = useState([
    { controlName: "AWB Prefix", code: "" },
    { controlName: "E-MAIL Regards 1", code: "" },
    { controlName: "E-MAIL Regards 2", code: "" },
    { controlName: "E-MAIL Regards 3", code: "" },
    { controlName: "E-MAIL Regards 4", code: "" },
    { controlName: "E-MAIL Regards 5", code: "" },
    { controlName: "E-MAIL Regards 6", code: "" },
    { controlName: "E-MAIL Regards 7", code: "" },
  ]);
  const [formFieldsByModule, setFormFieldsByModule] =
    useState<Record<FormSetupModuleKey, FormFieldConfig[]>>(buildFormSetupState);

  const canModifyEmail =
    !authed ||
    canDo(permissions, UTILITY_NOTIFICATION_PERMISSIONS.notification, "modify") ||
    canDo(permissions, UTILITY_NOTIFICATION_PERMISSIONS.xpresionSetup, "modify") ||
    canDo(permissions, UTILITY_NOTIFICATION_PERMISSIONS.notification, "add") ||
    canDo(permissions, UTILITY_NOTIFICATION_PERMISSIONS.xpresionSetup, "add");

  const activeConfig = useMemo(() => {
    if (!searchedModule || searchedModule === "KYC XPRESION" || searchedModule === "E-MAIL FOOTER")
      return null;
    return configs[searchedModule];
  }, [configs, searchedModule]);

  const patchConfig = (updates: Partial<EmailConfig>) => {
    if (!searchedModule || searchedModule === "KYC XPRESION" || searchedModule === "E-MAIL FOOTER")
      return;
    setConfigs((current) => ({
      ...current,
      [searchedModule]: { ...current[searchedModule], ...updates },
    }));
  };

  const searchModule = async (module: ModuleKey) => {
    setSearchedModule(module);
    if (!authed || module === "KYC XPRESION" || module === "E-MAIL FOOTER") return;
    const moduleCode = EMAIL_MODULE_CODES[module];
    if (!moduleCode) return;
    try {
      const rows = await listEmailConfigurations();
      const match = rows.find((row) => row.module_code === moduleCode);
      if (!match) return;
      setConfigs((current) => ({
        ...current,
        [module]: {
          ...current[module as keyof typeof emailDefaults],
          smtpServer: match.smtp_host,
          smtpPort: String(match.smtp_port),
          fromEmail: match.sender_email,
          mailUserId: match.username ?? "",
          mailPassword: "",
          messageSubject:
            match.subject_template ?? current[module as keyof typeof emailDefaults].messageSubject,
          messageBody:
            match.body_template ?? current[module as keyof typeof emailDefaults].messageBody,
          ssl: match.use_ssl,
          id: match.id,
          row_version: match.row_version,
          has_password: match.has_password,
          printDoxSpx: Boolean(match.print_flags?.printDoxSpx),
          printPcs: Boolean(match.print_flags?.printPcs),
          printWeight: Boolean(match.print_flags?.printWeight),
          printVendorName: Boolean(match.print_flags?.printVendorName),
          printSender: Boolean(match.print_flags?.printSender),
          origin: Boolean(match.print_flags?.origin),
          consignee: Boolean(match.print_flags?.consignee),
          printVendorAwbNo: Boolean(match.print_flags?.printVendorAwbNo),
        },
      }));
    } catch (error) {
      toast.error(toErrorMessage(error));
    }
  };

  const saveEmailModule = async (module: ModuleKey, config: EmailConfig) => {
    if (!canModifyEmail) return toast.error("Permission denied");
    if (!authed) {
      toast.success(`${module} updated`);
      return;
    }
    const moduleCode = EMAIL_MODULE_CODES[module];
    if (!moduleCode) {
      toast.success(`${module} updated`);
      return;
    }
    try {
      const parsed = emailConfigurationSchema.parse({
        smtp_host: config.smtpServer,
        smtp_port: config.smtpPort,
        username: config.mailUserId || null,
        password: config.mailPassword || null,
        sender_email: config.fromEmail,
        sender_name: null,
        use_ssl: config.ssl,
        is_default: false,
        status: "ACTIVE",
        module_code: moduleCode,
        subject_template: config.messageSubject,
        body_template: config.messageBody,
      });
      setBusy(true);
      const saved = await saveEmailConfiguration({
        fields: {
          ...parsed,
          print_flags: {
            printDoxSpx: config.printDoxSpx,
            printPcs: config.printPcs,
            printWeight: config.printWeight,
            printVendorName: config.printVendorName,
            printSender: config.printSender,
            origin: config.origin,
            consignee: config.consignee,
            printVendorAwbNo: config.printVendorAwbNo,
            messageDear: config.messageDear,
            date: config.date,
            sendingTime: config.sendingTime,
          },
        },
        id: config.id ?? null,
        rowVersion: config.row_version ?? null,
      });
      patchConfig({
        id: saved.id,
        row_version: saved.row_version,
        has_password: saved.has_password,
        mailPassword: "",
      });
      await queryClient.invalidateQueries({ queryKey: ["email-configurations"] });
      toast.success(`${module} updated`);
    } catch (error) {
      toast.error(toErrorMessage(error));
    } finally {
      setBusy(false);
    }
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
        <TabButton active={tab === "formSetup"} onClick={() => setTab("formSetup")}>
          FORM SETUP
        </TabButton>
      </div>

      {tab === "miscellaneous" ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <MiniSaveCard
            title="LAST NO. SETUP"
            label="Invoice No."
            value={invoiceNo}
            onChange={setInvoiceNo}
          />
          <MiniSaveCard
            title="MISCELLANEOUS"
            label="Entry Lock Date"
            type="date"
            value={entryLockDate}
            onChange={setEntryLockDate}
          />
          <MiniSaveCard
            title="Credit Limit Email on %"
            label="Percentage"
            value={creditLimitPercentage}
            onChange={setCreditLimitPercentage}
          />
        </div>
      ) : null}

      {tab === "setup" ? (
        <div className="flex flex-col gap-4">
          <Card className="w-full max-w-xl border p-4">
            <div className="flex flex-wrap items-end gap-8">
              <SelectField
                label="Module Name"
                value={moduleName}
                options={moduleOptions}
                onChange={(value) => setModuleName(value as ModuleKey)}
              />
              <Button
                onClick={() => void searchModule(moduleName)}
                className="h-9 rounded-full bg-slate-600 px-8 text-white hover:bg-slate-700"
              >
                Search
              </Button>
            </div>
          </Card>

          {searchedModule ? (
            <Card className="w-full max-w-xl border p-4">
              {searchedModule === "KYC XPRESION" ? (
                <EmptyModule onCancel={() => setSearchedModule(null)} />
              ) : searchedModule === "E-MAIL FOOTER" ? (
                <FooterSetup
                  rows={footerRows}
                  setRows={setFooterRows}
                  onCancel={() => setSearchedModule(null)}
                />
              ) : activeConfig ? (
                <EmailSetup
                  moduleName={searchedModule}
                  config={activeConfig}
                  patch={patchConfig}
                  busy={busy}
                  onCancel={() => setSearchedModule(null)}
                  onUpdate={() => void saveEmailModule(searchedModule, activeConfig)}
                />
              ) : null}
            </Card>
          ) : null}
        </div>
      ) : null}

      {tab === "formSetup" ? (
        <FormFieldSetup
          moduleName={formModuleName}
          setModuleName={setFormModuleName}
          fields={formFieldsByModule[formModuleName]}
          setFields={(updater) => {
            setFormFieldsByModule((current) => ({
              ...current,
              [formModuleName]:
                typeof updater === "function" ? updater(current[formModuleName]) : updater,
            }));
          }}
        />
      ) : null}
    </div>
  );
}

function MiniSaveCard({
  title,
  label,
  value,
  onChange,
  type = "text",
}: {
  title: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <Card className="relative border p-4 pt-7">
      <span className="absolute -top-3 left-4 rounded-full bg-sidebar px-4 py-1 text-xs font-semibold text-sidebar-foreground shadow">
        {title}
      </span>
      <TextField label={label} value={value} onChange={onChange} type={type} required />
      <div className="mt-4 flex justify-center">
        <Button
          onClick={() => toast.success(`${title} saved`)}
          className="h-8 rounded-full bg-green-500 px-10 text-white hover:bg-green-600"
        >
          Save
        </Button>
      </div>
    </Card>
  );
}

function EmailSetup({
  moduleName,
  config,
  patch,
  onCancel,
  onUpdate,
  busy,
}: {
  moduleName: ModuleKey;
  config: EmailConfig;
  patch: (updates: Partial<EmailConfig>) => void;
  onCancel: () => void;
  onUpdate: () => void;
  busy?: boolean;
}) {
  const forwardingFields =
    moduleName === "EMAIL ON FORWARDING"
      ? ([
          ["Print DOX/SPX", "printDoxSpx"],
          ["Print PCS", "printPcs"],
          ["Print Weight", "printWeight"],
          ["Print Vendor Name", "printVendorName"],
        ] as const)
      : [];
  const weightAlertFields =
    moduleName === "ESTATEMENT WEIGHT ALERT"
      ? ([
          ["Print Sender", "printSender"],
          ["Origin", "origin"],
          ["Consignee", "consignee"],
          ["Print Vendor AWB No", "printVendorAwbNo"],
          ["Print Vendor Name", "printVendorName"],
          ["Print PCS", "printPcs"],
        ] as const)
      : [];

  return (
    <div className="space-y-3">
      <HeaderRow />
      <TextField
        label="SMTP Server"
        value={config.smtpServer}
        onChange={(smtpServer) => patch({ smtpServer })}
      />
      <TextField
        label="SMTP Port"
        value={config.smtpPort}
        onChange={(smtpPort) => patch({ smtpPort })}
      />
      <TextField
        label="From Email"
        value={config.fromEmail}
        onChange={(fromEmail) => patch({ fromEmail })}
      />
      <TextField
        label="Mail User ID"
        value={config.mailUserId}
        onChange={(mailUserId) => patch({ mailUserId })}
      />
      <TextField
        label={config.has_password ? "Mail Password (leave blank to keep)" : "Mail Password"}
        value={config.mailPassword}
        onChange={(mailPassword) => patch({ mailPassword })}
        type="password"
      />
      <TextField
        label="Message Dear"
        value={config.messageDear}
        onChange={(messageDear) => patch({ messageDear })}
      />
      <TextField
        label="Message Subject"
        value={config.messageSubject}
        onChange={(messageSubject) => patch({ messageSubject })}
      />
      <TextField
        label="Message Body"
        value={config.messageBody}
        onChange={(messageBody) => patch({ messageBody })}
      />
      <CheckRow label="SSL" checked={config.ssl} onChange={(ssl) => patch({ ssl })} />
      {config.date !== undefined ? (
        <TextField label="Date" value={config.date} onChange={(date) => patch({ date })} />
      ) : null}
      {config.sendingTime !== undefined ? (
        <TextField
          label="Sending Time"
          value={config.sendingTime}
          onChange={(sendingTime) => patch({ sendingTime })}
        />
      ) : null}
      {[...forwardingFields, ...weightAlertFields].map(([label, key]) => (
        <CheckRow
          key={key}
          label={label}
          checked={Boolean(config[key])}
          onChange={(checked) => patch({ [key]: checked })}
        />
      ))}
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
            } catch (e) {
              toast.error(toErrorMessage(e));
            }
          })();
        }}
      />
    </div>
  );
}

function FooterSetup({
  rows,
  setRows,
  onCancel,
}: {
  rows: { controlName: string; code: string }[];
  setRows: React.Dispatch<React.SetStateAction<{ controlName: string; code: string }[]>>;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-3">
      <HeaderRow />
      {rows.map((row, index) => (
        <div key={row.controlName} className="grid grid-cols-[9rem_1fr] items-center gap-4 text-xs">
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
      <ActionButtons onUpdate={() => toast.success("E-MAIL FOOTER updated")} onCancel={onCancel} />
    </div>
  );
}

function EmptyModule({ onCancel }: { onCancel: () => void }) {
  return (
    <div className="space-y-6">
      <HeaderRow />
      <ActionButtons onUpdate={() => toast.success("KYC XPRESION updated")} onCancel={onCancel} />
    </div>
  );
}

function FormFieldSetup({
  moduleName,
  setModuleName,
  fields,
  setFields,
}: {
  moduleName: FormSetupModuleKey;
  setModuleName: (value: FormSetupModuleKey) => void;
  fields: FormFieldConfig[];
  setFields: React.Dispatch<React.SetStateAction<FormFieldConfig[]>>;
}) {
  return (
    <Card className="w-full max-w-5xl border p-4">
      <div className="mb-5 flex flex-wrap items-end gap-10">
        <SelectField
          label="Module Name"
          value={moduleName}
          options={formSetupModuleOptions}
          onChange={(value) => setModuleName(value as FormSetupModuleKey)}
        />
        <Button
          onClick={() => toast.success(`${moduleName} loaded`)}
          className="h-9 rounded-full bg-slate-600 px-8 text-white hover:bg-slate-700"
        >
          Search
        </Button>
      </div>

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
      <div className="mt-4 flex justify-end">
        <Button
          onClick={() => toast.success(`${moduleName} form setup saved`)}
          className="h-8 rounded-full bg-green-500 px-8 text-white hover:bg-green-600"
        >
          Save
        </Button>
      </div>
    </Card>
  );
}

function HeaderRow() {
  return (
    <div className="grid grid-cols-[1fr_1fr] border-b pb-2 text-xs font-medium">
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
        <Button
          disabled={busy}
          variant="outline"
          onClick={onTest}
          className="h-8 rounded-full px-6"
        >
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="grid grid-cols-[9rem_1fr] items-center gap-4 text-xs">
      <span>
        {label}
        {required ? " *" : ""}
      </span>
      <Input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9"
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
    <label className="grid grid-cols-[9rem_1fr] items-center gap-4 text-xs">
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
    <label className="flex w-60 flex-col gap-1 text-xs font-medium text-foreground">
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
