import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/activate")({
  head: () => ({
    meta: [
      { title: "Activate account — Courier ERP" },
      { name: "description", content: "Choose a password for your Courier ERP account." },
    ],
  }),
  component: ActivatePage,
});

function ActivatePage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const token = typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("token") ?? "";

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) {
      toast.error("This link is invalid or has expired");
      return;
    }
    if (password !== confirm) {
      toast.error("Password and confirm password must match");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        toast.error(body.error || "Could not activate the account");
        return;
      }
      setDone(true);
    } catch {
      toast.error("Could not activate the account");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm p-6">
        <h1 className="text-xl font-semibold tracking-tight">Activate your account</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose a password with at least 8 characters, one number, and one special character. It must not match your username.
        </p>
        {done ? (
          <p className="mt-4 text-sm">Password saved. Sign in with your email and password.</p>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save password
            </Button>
          </form>
        )}
        <Link to="/login" className="mt-4 block text-center text-sm text-muted-foreground underline">
          Back to sign in
        </Link>
      </Card>
    </div>
  );
}
