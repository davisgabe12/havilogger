"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { API_BASE_URL } from "@/lib/api-base-url";
import { supabase } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api";
import { NoticeBanner } from "@/components/ui/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export default function InviteAcceptPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [queryString, setQueryString] = useState("");
  const [tokenReady, setTokenReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "success">("idle");
  const [error, setError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmittingSignup, setIsSubmittingSignup] = useState(false);

  const nextPath = useMemo(
    () => (queryString ? `/app/invite${queryString}` : "/app/invite"),
    [queryString],
  );
  const signInHref = useMemo(
    () => `/auth/sign-in?next=${encodeURIComponent(nextPath)}`,
    [nextPath],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const nextToken = params.get("token") ?? "";
    const nextEmail = params.get("email") ?? "";
    setToken(nextToken);
    setInviteEmail(nextEmail.trim().toLowerCase());
    setQueryString(window.location.search || "");
    setTokenReady(true);
  }, []);

  useEffect(() => {
    if (!tokenReady) return;
    const checkSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const hasActiveSession = Boolean(data.session);
        setHasSession(hasActiveSession);
      } catch {
        setHasSession(false);
      } finally {
        setSessionChecked(true);
      }
    };
    void checkSession();
  }, [tokenReady]);

  useEffect(() => {
    if (!token || !sessionChecked || !hasSession) return;
    let cancelled = false;
    const accept = async () => {
      setStatus("loading");
      setError(null);
      try {
        const res = await apiFetch(`${API_BASE_URL}/api/v1/invites/accept`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (!res.ok) {
          const detail = await res.json().catch(() => ({}));
          throw new Error(detail?.detail ?? "Unable to accept invite.");
        }
        const data = await res.json();
        const familyId = data.family_id ?? data.familyId;
        if (familyId) {
          await fetch("/api/active-family", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ familyId }),
          });
        }
        if (!cancelled) {
          setStatus("success");
          router.replace("/app");
        }
      } catch (err) {
        if (cancelled) return;
        const reason = err instanceof Error ? err.message : "Unable to accept invite.";
        setError(reason);
        setStatus("error");
      }
    };
    void accept();
    return () => {
      cancelled = true;
    };
  }, [hasSession, router, sessionChecked, token]);

  const handleInviteSignupSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!token) {
      setError("Invite token is missing.");
      return;
    }
    if (!inviteEmail) {
      setError("Invite email is missing.");
      return;
    }
    setStatus("loading");
    setIsSubmittingSignup(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/invites/complete-signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          email: inviteEmail,
          password,
          first_name: firstName,
          last_name: lastName,
          phone,
        }),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail?.detail ?? "Unable to complete invite signup.");
      }
      const payload = await response.json();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: inviteEmail,
        password,
      });
      if (signInError) {
        throw new Error(signInError.message || "Unable to sign in after invite setup.");
      }
      const familyId = payload?.family_id ?? payload?.familyId;
      if (familyId) {
        await fetch("/api/active-family", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ familyId }),
        });
      }
      setStatus("success");
      router.replace("/app");
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Unable to complete invite signup.";
      setError(reason);
      setStatus("error");
      setIsSubmittingSignup(false);
    }
  };

  const handleSignOutAndSwitch = async () => {
    setIsSigningOut(true);
    await supabase.auth.signOut().catch(() => {});
    router.replace(signInHref);
  };

  const mismatchedAccount = (error || "").toLowerCase().includes("does not match this account");

  return (
    <main className="havi-app-main min-h-screen">
      <div className="havi-app-shell max-w-md py-10">
        <Card className="havi-card-shell w-full">
          <CardHeader>
            <CardTitle className="havi-type-page-title">Join family</CardTitle>
            <CardDescription className="havi-type-body">
              Set your password and required details to join the shared family workspace.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!token ? (
              <NoticeBanner tone="danger">Invite token is missing.</NoticeBanner>
            ) : !sessionChecked ? (
              <p className="havi-type-body">Checking session…</p>
            ) : !hasSession ? (
              <form className="space-y-4" onSubmit={handleInviteSignupSubmit}>
                <p className="havi-type-body">
                  Set your password and complete required caregiver details to join. No separate
                  confirmation email is required for this invite link.
                </p>
                <Field>
                  <FieldLabel htmlFor="invite-signup-email" required>
                    Email
                  </FieldLabel>
                  <Input id="invite-signup-email" value={inviteEmail} readOnly data-testid="invite-signup-email" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="invite-signup-first-name" required>
                    First name
                  </FieldLabel>
                  <Input
                    id="invite-signup-first-name"
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    required
                    data-testid="invite-signup-first-name"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="invite-signup-last-name" required>
                    Last name
                  </FieldLabel>
                  <Input
                    id="invite-signup-last-name"
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    required
                    data-testid="invite-signup-last-name"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="invite-signup-phone" required>
                    Phone
                  </FieldLabel>
                  <Input
                    id="invite-signup-phone"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    required
                    data-testid="invite-signup-phone"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="invite-signup-password" required>
                    Password
                  </FieldLabel>
                  <Input
                    id="invite-signup-password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    data-testid="invite-signup-password"
                  />
                </Field>
                {error ? <NoticeBanner tone="danger">{error}</NoticeBanner> : null}
                <Button
                  className="w-full"
                  type="submit"
                  disabled={isSubmittingSignup || status === "loading"}
                  data-testid="invite-signup-submit"
                >
                  {isSubmittingSignup || status === "loading" ? "Joining..." : "Join family"}
                </Button>
                <p className="havi-type-meta text-center">
                  Already have an account?{" "}
                  <Link href={signInHref} className="text-foreground hover:underline" data-testid="invite-signup-sign-in">
                    Sign in
                  </Link>
                </p>
              </form>
            ) : status === "loading" ? (
              <p className="havi-type-body">Accepting invite…</p>
            ) : null}
            {hasSession && status === "error" ? (
              <div className="space-y-2">
                <NoticeBanner tone="danger">{error}</NoticeBanner>
                <div className="flex flex-wrap gap-2">
                  {mismatchedAccount ? (
                    <Button size="sm" onClick={handleSignOutAndSwitch} disabled={isSigningOut}>
                      {isSigningOut ? "Signing out..." : "Sign out and switch account"}
                    </Button>
                  ) : null}
                  <Button size="sm" variant="outline" onClick={() => router.replace("/app")}>
                    Go to app
                  </Button>
                </div>
              </div>
            ) : null}
            {status === "success" ? (
              <p className="havi-type-body">Invite accepted. Redirecting…</p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
