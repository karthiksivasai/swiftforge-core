/** Password note on User Setup. The same four rules are enforced in save_user. */
export const USER_SETUP_PASSWORD_RULES = [
  "Password must contain one special character.",
  "Password must contain one numeric character.",
  "Password length should be greater or equal to 8 characters.",
  "UserName and Password cannot be same.",
] as const;

export const ALLOW_CHANGING_DATE_MODULES = [
  "Inscan",
  "Manifest Scan",
  "AWB Entry",
  "DRS Scan",
  "Progress",
  "Comments",
  "Receipt Entry",
  "Debit Note",
  "Credit Note",
  "Manifest Inscan",
] as const;

export type AllowChangingDateModule = (typeof ALLOW_CHANGING_DATE_MODULES)[number];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function userSetupPasswordError(
  password: string,
  confirmPassword: string,
  username: string,
  creating: boolean,
): string | null {
  const passwordBlank = password.length === 0;
  const confirmBlank = confirmPassword.length === 0;
  if (passwordBlank && confirmBlank) {
    return creating ? "Password length should be greater or equal to 8 characters." : null;
  }
  if (password !== confirmPassword) return "Confirm Password must equal Password";
  if (password.length < 8) return "Password length should be greater or equal to 8 characters.";
  if (!/\d/.test(password)) return "Password must contain one numeric character.";
  if (!/[^A-Za-z0-9]/.test(password)) return "Password must contain one special character.";
  if (username.trim() && password.toLowerCase() === username.trim().toLowerCase()) {
    return "UserName and Password cannot be same.";
  }
  return null;
}

export function userSetupEmailError(email: string): string | null {
  const value = email.trim().toLowerCase();
  if (!EMAIL_RE.test(value) || value.length > 254 || value.endsWith(".cms.local")) {
    return "Enter a valid email address";
  }
  return null;
}

export function additionalEmailError(value: string): string | null {
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
  for (const part of parts) {
    if (userSetupEmailError(part)) return "Enter a valid email address";
  }
  return null;
}
