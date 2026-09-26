export type PasswordPolicy = {
  minLength: number;
  requireSpecial: boolean;
  requireNumeric: boolean;
  usernameNotPassword: boolean;
};

export function defaultPasswordPolicy(): PasswordPolicy {
  return {
    minLength: 8,
    requireSpecial: true,
    requireNumeric: true,
    usernameNotPassword: true,
  };
}

export function parsePasswordPolicy(value: unknown): PasswordPolicy {
  const base = defaultPasswordPolicy();
  if (!value || typeof value !== "object") return base;
  const row = value as Record<string, unknown>;
  const min = Number(row.min_length ?? row.minLength);
  return {
    minLength: Number.isFinite(min) && min >= 8 ? Math.floor(min) : base.minLength,
    requireSpecial: row.require_special === false || row.requireSpecial === false ? false : base.requireSpecial,
    requireNumeric: row.require_numeric === false || row.requireNumeric === false ? false : base.requireNumeric,
    usernameNotPassword:
      row.username_not_password === false || row.usernameNotPassword === false ? false : base.usernameNotPassword,
  };
}

/** Returns a user-facing message, or null when the password meets the policy. */
export function passwordPolicyError(password: string, username: string, policy: PasswordPolicy = defaultPasswordPolicy()): string | null {
  if (password.length < policy.minLength) {
    return `Password must be at least ${policy.minLength} characters`;
  }
  if (policy.requireNumeric && !/\d/.test(password)) {
    return "Password must contain at least one number";
  }
  if (policy.requireSpecial && !/[^A-Za-z0-9]/.test(password)) {
    return "Password must contain at least one special character";
  }
  if (policy.usernameNotPassword && username.trim() && password.toLowerCase() === username.trim().toLowerCase()) {
    return "Password must not match the username";
  }
  return null;
}
