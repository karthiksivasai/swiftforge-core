/**
 * Strict ID format validation for PAN, GSTIN, Aadhaar, and IEC documents.
 */

export function validateDocumentId(
  docType: string,
  docNo: string,
  partyLabel = "Document"
): { valid: boolean; message?: string } {
  const cleanType = docType.trim().toUpperCase();
  const cleanNo = docNo.trim().toUpperCase();
  if (!cleanNo) return { valid: true };

  if (cleanType === "PAN" || cleanType.includes("PAN")) {
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(cleanNo)) {
      return {
        valid: false,
        message: `Invalid ${partyLabel} PAN "${cleanNo}". Format must be 5 uppercase letters, 4 digits, 1 uppercase letter (e.g. ABCDE1234F).`,
      };
    }
  } else if (cleanType === "GSTIN" || cleanType.includes("GSTIN") || cleanType === "GST") {
    if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(cleanNo)) {
      return {
        valid: false,
        message: `Invalid ${partyLabel} GSTIN "${cleanNo}". Format must be 15 alphanumeric characters (e.g. 36ABCDE1234F1Z5).`,
      };
    }
  } else if (cleanType === "AADHAAR" || cleanType.includes("AADHAAR") || cleanType.includes("ADHAAR")) {
    if (!/^[0-9]{12}$/.test(cleanNo)) {
      return {
        valid: false,
        message: `Invalid ${partyLabel} Aadhaar "${cleanNo}". Must be exactly 12 digits.`,
      };
    }
  } else if (cleanType === "IEC" || cleanType.includes("IEC")) {
    if (!/^[A-Z0-9]{10}$/.test(cleanNo)) {
      return {
        valid: false,
        message: `Invalid ${partyLabel} IEC "${cleanNo}". Must be exactly 10 alphanumeric characters.`,
      };
    }
  }

  return { valid: true };
}

export function validatePartyIdNumbers(party: {
  documentType?: string;
  documentNo?: string;
  iecNo?: string;
}, partyLabel: string): string[] {
  const errors: string[] = [];

  if (party.documentType && party.documentNo) {
    const res = validateDocumentId(party.documentType, party.documentNo, `${partyLabel} Document`);
    if (!res.valid && res.message) {
      errors.push(res.message);
    }
  }

  if (party.iecNo && party.iecNo.trim()) {
    const res = validateDocumentId("IEC", party.iecNo, `${partyLabel} IEC`);
    if (!res.valid && res.message) {
      errors.push(res.message);
    }
  }

  return errors;
}
