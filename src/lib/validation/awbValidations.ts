/**
 * Centralized AWB Entry Validation Layer matching Xpresion reference system rules.
 *
 * Exact message wording is preserved including punctuation/spelling quirks ("cant", "..!!").
 * All validator functions are pure and return { valid, code, message }.
 */

export const VALIDATION_CODES = {
  WEIGHT_OUT_OF_RANGE: "WEIGHT_OUT_OF_RANGE",
  PAYMENT_TYPE_REQUIRED: "PAYMENT_TYPE_REQUIRED",
  DOCUMENT_NO_REQUIRED: "DOCUMENT_NO_REQUIRED",
  DOCUMENT_NO_FORMAT: "DOCUMENT_NO_FORMAT",
  SHIPPER_CONTACT_REQUIRED: "SHIPPER_CONTACT_REQUIRED",
} as const;

export type ValidationCode = (typeof VALIDATION_CODES)[keyof typeof VALIDATION_CODES];

export const VALIDATION_MESSAGES: Record<string, string> = {
  [VALIDATION_CODES.PAYMENT_TYPE_REQUIRED]: "Payment type cant be empty..!!",
  [VALIDATION_CODES.DOCUMENT_NO_REQUIRED]: "Document No. cant be empty..!",
  [VALIDATION_CODES.SHIPPER_CONTACT_REQUIRED]: "Shipper contact cant be empty..!",
  DOCUMENT_NO_FORMAT_AADHAAR: "Aadhaar Number should be 12 digit ..!",

  // Configurable fallback formats (TODO: confirm exact wording from source system for non-Aadhaar types)
  DOCUMENT_NO_FORMAT_PAN: "PAN Number format is invalid (10 characters: AAAAA9999A) ..!",
  DOCUMENT_NO_FORMAT_GSTIN: "GSTIN format is invalid (15 characters) ..!",
  DOCUMENT_NO_FORMAT_GENERIC: "Document No. format is invalid ..!",
};

export interface DocumentFormatRule {
  type: string;
  pattern: RegExp;
  code: string;
  messageKey: string;
}

/**
 * Extensible document format rules map.
 * Aadhaar Number message is confirmed from reference system.
 * Other document rules have TODO markers to confirm exact wording if needed.
 */
export const DOCUMENT_FORMAT_RULES: Record<string, DocumentFormatRule> = {
  "Aadhaar Number": {
    type: "Aadhaar Number",
    pattern: /^\d{12}$/,
    code: VALIDATION_CODES.DOCUMENT_NO_FORMAT,
    messageKey: "DOCUMENT_NO_FORMAT_AADHAAR",
  },
  "PAN Number": {
    type: "PAN Number",
    // TODO: confirm exact message from source system for PAN Number
    pattern: /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i,
    code: VALIDATION_CODES.DOCUMENT_NO_FORMAT,
    messageKey: "DOCUMENT_NO_FORMAT_PAN",
  },
  "GSTIN (Normal)": {
    type: "GSTIN (Normal)",
    // TODO: confirm exact message from source system for GSTIN
    pattern: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/i,
    code: VALIDATION_CODES.DOCUMENT_NO_FORMAT,
    messageKey: "DOCUMENT_NO_FORMAT_GSTIN",
  },
  // Add pattern structures for Voter ID, Passport, TAN, Driving License, IEC Certificate
  "Voter Id": {
    type: "Voter Id",
    // TODO: confirm exact message from source system for Voter Id
    pattern: /^[A-Z]{3}\d{7}$/i,
    code: VALIDATION_CODES.DOCUMENT_NO_FORMAT,
    messageKey: "DOCUMENT_NO_FORMAT_GENERIC",
  },
  "Passport Number": {
    type: "Passport Number",
    // TODO: confirm exact message from source system for Passport Number
    pattern: /^[A-Z]{1}\d{7}$/i,
    code: VALIDATION_CODES.DOCUMENT_NO_FORMAT,
    messageKey: "DOCUMENT_NO_FORMAT_GENERIC",
  },
  "TAN Number": {
    type: "TAN Number",
    // TODO: confirm exact message from source system for TAN Number
    pattern: /^[A-Z]{4}\d{5}[A-Z]{1}$/i,
    code: VALIDATION_CODES.DOCUMENT_NO_FORMAT,
    messageKey: "DOCUMENT_NO_FORMAT_GENERIC",
  },
  "Driving License": {
    type: "Driving License",
    // TODO: confirm exact message from source system for Driving License
    pattern: /^[A-Z0-9]{10,20}$/i,
    code: VALIDATION_CODES.DOCUMENT_NO_FORMAT,
    messageKey: "DOCUMENT_NO_FORMAT_GENERIC",
  },
  "IEC Certificate": {
    type: "IEC Certificate",
    // TODO: confirm exact message from source system for IEC Certificate
    pattern: /^[A-Z0-9]{10}$/i,
    code: VALIDATION_CODES.DOCUMENT_NO_FORMAT,
    messageKey: "DOCUMENT_NO_FORMAT_GENERIC",
  },
};

export interface ValidationResult {
  valid: boolean;
  code?: string;
  message?: string;
}

export interface AwbValidationPayload {
  paymentType?: string;
  documentType?: string;
  documentNo?: string;
  shipperContactName?: string;
  shipperTelephone?: string;
  shipperMobile?: string;
}

/**
 * 2. Payment Type Required Validation
 */
export function validatePaymentType(paymentType?: string): ValidationResult {
  const val = (paymentType || "").trim();
  if (!val || val.toUpperCase() === "SELECT" || val === "") {
    return {
      valid: false,
      code: VALIDATION_CODES.PAYMENT_TYPE_REQUIRED,
      message: VALIDATION_MESSAGES[VALIDATION_CODES.PAYMENT_TYPE_REQUIRED],
    };
  }
  return { valid: true };
}

/**
 * 3. Document No. Required Validation
 * Triggered if Document Type is selected/non-empty.
 */
export function validateDocumentNoRequired(documentType?: string, documentNo?: string): ValidationResult {
  const docType = (documentType || "").trim();
  const docNo = (documentNo || "").trim();

  if (docType && docType.toUpperCase() !== "SELECT" && !docNo) {
    return {
      valid: false,
      code: VALIDATION_CODES.DOCUMENT_NO_REQUIRED,
      message: VALIDATION_MESSAGES[VALIDATION_CODES.DOCUMENT_NO_REQUIRED],
    };
  }
  return { valid: true };
}

/**
 * 4. Document No. Format Validation by Document Type
 */
export function validateDocumentNoFormat(documentType?: string, documentNo?: string): ValidationResult {
  const docType = (documentType || "").trim();
  const docNo = (documentNo || "").trim();

  if (!docType || docType.toUpperCase() === "SELECT" || !docNo) {
    return { valid: true };
  }

  const rule = DOCUMENT_FORMAT_RULES[docType];
  if (!rule) {
    return { valid: true };
  }

  if (!rule.pattern.test(docNo)) {
    const msg = VALIDATION_MESSAGES[rule.messageKey] || VALIDATION_MESSAGES.DOCUMENT_NO_FORMAT_GENERIC;
    return {
      valid: false,
      code: rule.code,
      message: msg,
    };
  }

  return { valid: true };
}

/**
 * 5. Shipper Contact Required Validation
 * Contact name OR telephone/mobile must be populated.
 */
export function validateShipperContact(input: {
  contactName?: string;
  telephone?: string;
  mobile?: string;
}): ValidationResult {
  const name = (input.contactName || "").trim();
  const tel = (input.telephone || "").trim();
  const mob = (input.mobile || "").trim();

  if (!name && !tel && !mob) {
    return {
      valid: false,
      code: VALIDATION_CODES.SHIPPER_CONTACT_REQUIRED,
      message: VALIDATION_MESSAGES[VALIDATION_CODES.SHIPPER_CONTACT_REQUIRED],
    };
  }
  return { valid: true };
}

/**
 * Single validateAwbEntry runner running validators in defined order
 * and returning the FIRST failure (single popup on Save).
 */
export function validateAwbEntry(payload: AwbValidationPayload): ValidationResult {
  // 1. Payment Type
  const paymentCheck = validatePaymentType(payload.paymentType);
  if (!paymentCheck.valid) return paymentCheck;

  // 2. Document No Required
  const docReqCheck = validateDocumentNoRequired(payload.documentType, payload.documentNo);
  if (!docReqCheck.valid) return docReqCheck;

  // 3. Document No Format
  const docFmtCheck = validateDocumentNoFormat(payload.documentType, payload.documentNo);
  if (!docFmtCheck.valid) return docFmtCheck;

  // 4. Shipper Contact
  const shipperCheck = validateShipperContact({
    contactName: payload.shipperContactName,
    telephone: payload.shipperTelephone,
    mobile: payload.shipperMobile,
  });
  if (!shipperCheck.valid) return shipperCheck;

  return { valid: true };
}
