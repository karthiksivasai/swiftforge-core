export type AppChannel = "WEB" | "MOBILE";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) return null;
  if (email.endsWith("@cms.local") || email.endsWith(".cms.local")) return null;
  return email;
}

export function applicationAllows(applicationType: string | null | undefined, channel: AppChannel): boolean {
  const type = (applicationType ?? "PORTAL").toUpperCase();
  if (type === "ALL") return true;
  if (type === "MOBILE") return channel === "MOBILE";
  if (type === "PORTAL") return channel === "WEB";
  return false;
}

export type OtpEligibility = {
  exists: boolean;
  active: boolean;
  emailVerified: boolean;
  otpEnabled: boolean;
  deleted: boolean;
};

/** Unknown and ineligible accounts both produce silence so the API does not reveal the account. */
export function otpRequestDecision(account: OtpEligibility): "send" | "silent" {
  if (!account.exists || account.deleted || !account.active || !account.emailVerified || !account.otpEnabled) {
    return "silent";
  }
  return "send";
}

export function otpExpired(expiresAtIso: string, nowMs: number): boolean {
  const expires = Date.parse(expiresAtIso);
  return !Number.isFinite(expires) || expires <= nowMs;
}

export function otpAttemptBlocked(attempts: number, maxAttempts = 5): boolean {
  return attempts >= maxAttempts;
}

export function otpCooldownActive(lastSentAtIso: string | null, nowMs: number, cooldownMs = 60_000): boolean {
  if (!lastSentAtIso) return false;
  const sent = Date.parse(lastSentAtIso);
  return Number.isFinite(sent) && nowMs - sent < cooldownMs;
}

const USERNAME_RE = /^[A-Za-z0-9._-]{2,64}$/;

export type UserWriteInput = {
  userType: "ADMIN" | "STAFF";
  userSubtype: "HUB" | "BRANCH";
  username: string;
  fullName: string;
  email: string;
  mobile: string;
  originId: string | null;
  serviceCenterId: string;
  customerId: string | null;
  groupId: string;
  birthDate: string | null;
  joiningDate: string | null;
  status: "ACTIVE" | "INACTIVE";
  applicationType: "ALL" | "MOBILE" | "PORTAL";
  allowChangingDate: string;
  addEntryOnManifest: boolean;
  allowLoginWithOtp: boolean;
  globalManifest: boolean;
  allowChangingAwbNo: boolean;
  allowMobileScanning: boolean;
  weightUnit: "KG" | "LB";
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asBool(value: unknown): boolean {
  return value === true;
}

function asUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return UUID_RE.test(id) ? id : null;
}

/**
 * Client tenant, role, and permission fields are ignored.
 * Allow Mobile Scanning is a camera flag only. Manifest branch scope is mandatory and is not taken from the client.
 */
export function parseUserWrite(body: unknown): { ok: true; value: UserWriteInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Enter the user details" };
  const row = body as Record<string, unknown>;

  const typeRaw = String(row.userType ?? row.user_type ?? "").trim().toUpperCase();
  const userType = typeRaw === "ADMIN" || typeRaw === "USER" ? (typeRaw === "USER" ? "STAFF" : "ADMIN") : typeRaw === "STAFF" ? "STAFF" : "";
  if (userType !== "ADMIN" && userType !== "STAFF") return { ok: false, error: "User type must be Admin or User" };

  const subtypeRaw = String(row.userSubtype ?? row.user_subtype ?? "").trim().toUpperCase();
  if (subtypeRaw !== "HUB" && subtypeRaw !== "BRANCH") return { ok: false, error: "User subtype must be HUB or Branch" };

  const username = String(row.username ?? "").trim();
  if (!USERNAME_RE.test(username)) return { ok: false, error: "Username must be 2–64 letters, numbers, dots, underscores, or hyphens" };

  const email = normalizeEmail(String(row.email ?? row.emailId ?? ""));
  if (!email) return { ok: false, error: "Enter a valid email address" };

  const serviceCenterId = asUuid(row.serviceCenterId ?? row.homeBranchId);
  if (!serviceCenterId) return { ok: false, error: "Select a service center" };
  const groupId = asUuid(row.groupId);
  if (!groupId) return { ok: false, error: "Select a group" };

  const originRaw = row.originId;
  const originId = originRaw === "" || originRaw == null ? null : asUuid(originRaw);
  if (originRaw != null && originRaw !== "" && !originId) return { ok: false, error: "Select a valid origin" };

  const customerRaw = row.customerId;
  const customerId = customerRaw === "" || customerRaw == null ? null : asUuid(customerRaw);
  if (customerRaw != null && customerRaw !== "" && !customerId) return { ok: false, error: "Select a valid customer" };

  const birthRaw = String(row.birthDate ?? "").trim();
  const joiningRaw = String(row.joiningDate ?? "").trim();
  if (birthRaw && !DATE_RE.test(birthRaw)) return { ok: false, error: "Birth date is invalid" };
  if (joiningRaw && !DATE_RE.test(joiningRaw)) return { ok: false, error: "Joining date is invalid" };

  const statusRaw = String(row.status ?? "ACTIVE").trim().toUpperCase().replace("-", "");
  const status = statusRaw === "INACTIVE" ? "INACTIVE" : statusRaw === "ACTIVE" ? "ACTIVE" : "";
  if (!status) return { ok: false, error: "Status must be Active or In-Active" };

  const appRaw = String(row.applicationType ?? "PORTAL").trim().toUpperCase();
  if (appRaw !== "ALL" && appRaw !== "MOBILE" && appRaw !== "PORTAL") {
    return { ok: false, error: "Application type must be All, Mobile, or Portal" };
  }

  const weightRaw = String(row.weightType ?? row.weightUnit ?? "KG").trim().toUpperCase();
  const weightUnit = weightRaw === "LBS" || weightRaw === "LB" ? "LB" : weightRaw === "KGS" || weightRaw === "KG" ? "KG" : "";
  if (!weightUnit) return { ok: false, error: "Weight type must be Kgs or Lbs" };

  const mobile = String(row.mobile ?? row.mobileNo ?? "").trim();
  if (mobile && !/^[0-9+\-() ]{6,20}$/.test(mobile)) return { ok: false, error: "Mobile number is invalid" };

  const fullName = String(row.fullName ?? "").trim().slice(0, 120);
  const allowChangingDate = String(row.allowChangingDate ?? "").trim().slice(0, 80);

  return {
    ok: true,
    value: {
      userType,
      userSubtype: subtypeRaw,
      username,
      fullName,
      email,
      mobile,
      originId,
      serviceCenterId,
      customerId,
      groupId,
      birthDate: birthRaw || null,
      joiningDate: joiningRaw || null,
      status,
      applicationType: appRaw,
      allowChangingDate,
      addEntryOnManifest: asBool(row.addEntryOnManifest),
      allowLoginWithOtp: asBool(row.allowLoginWithOtp),
      globalManifest: asBool(row.globalManifest),
      allowChangingAwbNo: asBool(row.allowChangingAwbNo),
      allowMobileScanning: asBool(row.allowMobileScanning ?? row.mobileAppLens),
      weightUnit,
    },
  };
}
