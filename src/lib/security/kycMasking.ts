/**
 * KYC sensitive document data masking and validation helpers.
 * Per Decision D15 & Indian Customs/UIDAI regulations:
 *   - Aadhaar masked as XXXXXXXX1234
 *   - PAN masked as XXXXXX234X
 *   - Expiry date validation (expired = warning)
 */

export function isMaskableType(docType?: string | null): boolean {
  if (!docType) return false;
  const t = docType.toLowerCase();
  return t.includes("aadhaar") || t.includes("pan");
}

export function maskAadhaar(val?: string | null): string {
  if (!val) return "";
  const clean = val.replace(/\s+/g, "");
  if (clean.length <= 4) return clean;
  const last4 = clean.slice(-4);
  return `XXXXXXXX${last4}`;
}

export function maskPan(val?: string | null): string {
  if (!val) return "";
  const clean = val.trim();
  if (clean.length < 10) {
    if (clean.length <= 4) return clean;
    return `XXXXXX${clean.slice(-4)}`;
  }
  // Standard PAN: 5 letters, 4 digits, 1 letter (ABCDE1234F) -> XXXXXX234X
  return `XXXXXX${clean.slice(6, 9)}X`;
}

export function maskDocumentNumber(docType?: string | null, val?: string | null): string {
  if (!val) return "";
  const t = (docType || "").toLowerCase();
  if (t.includes("aadhaar")) return maskAadhaar(val);
  if (t.includes("pan")) return maskPan(val);
  return val;
}

export function isDocExpired(expiryDate?: string | null): boolean {
  if (!expiryDate || !expiryDate.trim()) return false;
  const exp = expiryDate.trim();
  const today = new Date().toISOString().slice(0, 10);
  return exp < today;
}

