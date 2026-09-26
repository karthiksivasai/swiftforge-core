import { describe, expect, it } from "vitest";

import {
  applicationAllows,
  normalizeEmail,
  otpAttemptBlocked,
  otpCooldownActive,
  otpExpired,
  otpRequestDecision,
  parseUserWrite,
} from "./account-rules";
import { passwordPolicyError } from "./password-policy";

describe("password policy", () => {
  it("rejects short, non-numeric, non-special, and username passwords", () => {
    expect(passwordPolicyError("short1!", "ada")).toMatch(/at least 8/);
    expect(passwordPolicyError("longpassword!", "ada")).toMatch(/number/);
    expect(passwordPolicyError("longpassword1", "ada")).toMatch(/special/);
    expect(passwordPolicyError("Ada-user1", "Ada-user1")).toMatch(/username/);
  });

  it("accepts a password that meets every rule", () => {
    expect(passwordPolicyError("Courier-19", "ada")).toBeNull();
  });
});

describe("account rules", () => {
  it("normalizes a real email and rejects synthetic company-code addresses", () => {
    expect(normalizeEmail(" Ada@Example.com ")).toBe("ada@example.com");
    expect(normalizeEmail("admin@yourco.cms.local")).toBeNull();
  });

  it("limits portal and mobile channels", () => {
    expect(applicationAllows("PORTAL", "WEB")).toBe(true);
    expect(applicationAllows("PORTAL", "MOBILE")).toBe(false);
    expect(applicationAllows("MOBILE", "WEB")).toBe(false);
    expect(applicationAllows("ALL", "MOBILE")).toBe(true);
  });

  it("sends OTP only for an active verified user who is allowed to use it", () => {
    expect(otpRequestDecision({
      exists: true,
      active: true,
      emailVerified: true,
      otpEnabled: true,
      deleted: false,
    })).toBe("send");
    expect(otpRequestDecision({
      exists: true,
      active: false,
      emailVerified: true,
      otpEnabled: true,
      deleted: false,
    })).toBe("silent");
    expect(otpRequestDecision({
      exists: false,
      active: false,
      emailVerified: false,
      otpEnabled: false,
      deleted: false,
    })).toBe("silent");
  });

  it("expires, cools down, and locks OTP attempts", () => {
    const now = Date.parse("2026-09-26T10:00:00Z");
    expect(otpExpired("2026-09-26T09:50:00Z", now)).toBe(true);
    expect(otpExpired("2026-09-26T10:09:00Z", now)).toBe(false);
    expect(otpCooldownActive("2026-09-26T09:59:30Z", now)).toBe(true);
    expect(otpAttemptBlocked(5)).toBe(true);
    expect(otpAttemptBlocked(4)).toBe(false);
  });

  it("rejects a client-supplied tenant and requires a same-shape user payload", () => {
    const parsed = parseUserWrite({
      tenantId: "11111111-1111-4111-8111-111111111111",
      permissions: ["admin"],
      userType: "User",
      userSubtype: "Branch",
      username: "branch.user",
      email: "branch.user@example.com",
      serviceCenterId: "22222222-2222-4222-8222-222222222222",
      groupId: "33333333-3333-4333-8333-333333333333",
      applicationType: "Portal",
      weightType: "Kgs",
      allowLoginWithOtp: true,
      allowMobileScanning: true,
      manifestBranch: true,
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.userType).toBe("STAFF");
    expect(parsed.value.userSubtype).toBe("BRANCH");
    expect(parsed.value.allowLoginWithOtp).toBe(true);
    expect(parsed.value.allowMobileScanning).toBe(true);
    expect("manifestBranch" in parsed.value).toBe(false);
    expect("tenantId" in parsed.value).toBe(false);
  });

  it("rejects a duplicate-prone invalid username and a bad branch id", () => {
    expect(parseUserWrite({ userType: "Admin", userSubtype: "HUB", username: "a", email: "a@b.co" }).ok).toBe(false);
    const bad = parseUserWrite({
      userType: "Admin",
      userSubtype: "HUB",
      username: "admin.user",
      email: "admin.user@example.com",
      serviceCenterId: "not-a-uuid",
      groupId: "33333333-3333-4333-8333-333333333333",
    });
    expect(bad.ok).toBe(false);
  });
});
