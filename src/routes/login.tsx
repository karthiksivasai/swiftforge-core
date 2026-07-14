import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, LogIn } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { resolveTenantFromHost } from "@/lib/tenant";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — Courier ERP" },
      { name: "description", content: "Sign in to the Courier Management System." },
    ],
  }),
  component: LoginPage,
});

function defaultSlug(): string {
  if (typeof window === "undefined") return "";
  return resolveTenantFromHost(window.location.hostname).slug;
}

function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [tenantSlug, setTenantSlug] = useState(defaultSlug);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!username.trim() || !password) {
      toast.error("Enter username and password");
      return;
    }
    if (!tenantSlug.trim()) {
      toast.error("Enter your company (tenant) code");
      return;
    }
    setSubmitting(true);
    try {
      await signIn(username, password, tenantSlug);
      toast.success("Signed in");
      void navigate({ to: "/dashboard" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sign in failed";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-6 flex flex-col gap-1 text-center">
          <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <LogIn className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Sign in</h1>
          <p className="text-sm text-muted-foreground">Courier Management System</p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tenant">Company code</Label>
            <Input
              id="tenant"
              value={tenantSlug}
              onChange={(e) => setTenantSlug(e.target.value)}
              autoComplete="organization"
              placeholder="your-company"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <Button type="submit" className="mt-2 w-full" disabled={submitting}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Sign in
          </Button>
        </form>
      </Card>
    </div>
  );
}
