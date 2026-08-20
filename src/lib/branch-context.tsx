import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { useTenant } from "@/lib/tenant";

export type BranchContextType = {
  activeBranchId: string | null;
  activeBranchName: string;
  setActiveBranch: (branch: { id?: string | null; name: string }) => void;
};

const BranchContext = createContext<BranchContextType | null>(null);

const STORAGE_KEY = "cms.active_branch";

export function BranchProvider({ children }: { children: ReactNode }) {
  const tenant = useTenant();
  const { profile } = useAuth();

  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);
  const [activeBranchName, setActiveBranchName] = useState<string>(tenant.primaryBranch);

  useEffect(() => {
    // Check local storage override first
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed?.name) {
            setActiveBranchName(parsed.name);
            setActiveBranchId(parsed.id || null);
            return;
          }
        } catch {
          // ignore parsing error
        }
      }
    }

    // Default to user home_branch_id or tenant primary branch
    if (profile?.home_branch_id) {
      setActiveBranchId(profile.home_branch_id);
    }
    if (tenant.primaryBranch) {
      setActiveBranchName(tenant.primaryBranch);
    }
  }, [profile?.home_branch_id, tenant.primaryBranch]);

  const handleSetActiveBranch = ({ id, name }: { id?: string | null; name: string }) => {
    setActiveBranchId(id || null);
    setActiveBranchName(name);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: id || null, name }));
    }
  };

  return (
    <BranchContext.Provider
      value={{
        activeBranchId,
        activeBranchName,
        setActiveBranch: handleSetActiveBranch,
      }}
    >
      {children}
    </BranchContext.Provider>
  );
}

export function useActiveBranch(): BranchContextType {
  const ctx = useContext(BranchContext);
  if (!ctx) {
    // Fallback if rendered outside provider
    return {
      activeBranchId: null,
      activeBranchName: "Head Office",
      setActiveBranch: () => {},
    };
  }
  return ctx;
}
