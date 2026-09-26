export type ManifestScopeUser = {
  isAdmin: boolean;
  subtype: "HUB" | "BRANCH" | "OTHER";
  homeBranchId: string | null;
  explicitBranchIds: string[];
  hubMappedBranchIds: string[];
  crossBranch: boolean;
};

function unique(ids: Array<string | null>): string[] {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

/**
 * Branches a user may treat as their own. Allow Mobile Scanning is not an input:
 * that flag does not widen manifest, bagging, shipment, or status access.
 */
export function manifestAssignedBranchIds(user: ManifestScopeUser, allBranchIds: string[]): string[] {
  if (user.isAdmin) return allBranchIds;
  if (user.subtype === "BRANCH") return user.homeBranchId ? [user.homeBranchId] : [];
  if (user.subtype === "HUB") {
    return unique([user.homeBranchId, ...user.hubMappedBranchIds, ...user.explicitBranchIds]);
  }
  return unique([user.homeBranchId, ...user.explicitBranchIds]);
}

export function manifestScopeBranchIds(user: ManifestScopeUser, allBranchIds: string[]): string[] {
  if (user.crossBranch) return allBranchIds;
  return manifestAssignedBranchIds(user, allBranchIds);
}

export function manifestBranchVisible(args: {
  user: ManifestScopeUser;
  allBranchIds: string[];
  ownerBranchId: string | null;
  destinationBranchId: string | null;
  handover: boolean;
}): boolean {
  if (args.user.isAdmin) return true;
  const scope = new Set(manifestScopeBranchIds(args.user, args.allBranchIds));
  if (args.ownerBranchId && scope.has(args.ownerBranchId)) return true;
  if (!args.handover || !args.destinationBranchId) return false;
  const assigned = new Set(manifestAssignedBranchIds(args.user, args.allBranchIds));
  return assigned.has(args.destinationBranchId);
}
