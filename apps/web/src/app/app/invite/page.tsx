"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { apiFetch } from "@/lib/api";
import { API_BASE_URL } from "@/lib/api-base-url";
import { supabase } from "@/lib/supabase/client";
import { NoticeBanner } from "@/components/ui/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function InviteAcceptPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [queryString, setQueryString] = useState("");
  const [tokenReady, setTokenReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "success">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const nextToken = params.get("token") ?? "";
    setToken(nextToken);
    setQueryString(window.location.search || "");
    setTokenReady(true);
  }, []);

  useEffect(() => {
    if (!tokenReady) return;
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      const hasActiveSession = Boolean(data.session);
      setHasSession(hasActiveSession);
      setSessionChecked(true);
      if (!hasActiveSession) {
        const nextPath = queryString ? `/app/invite${queryString}` : "/app/invite";
        router.replace(`/auth/sign-in?next=${encodeURIComponent(nextPath)}`);
      }
    };
    void checkSession();
  }, [queryString, router, tokenReady]);

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

  const handleSignOutAndSwitch = async () => {
    setIsSigningOut(true);
    await supabase.auth.signOut().catch(() => {});
    const nextPath = queryString ? `/app/invite${queryString}` : "/app/invite";
    router.replace(`/auth/sign-in?next=${encodeURIComponent(nextPath)}`);
  };

  const mismatchedAccount = (error || "").toLowerCase().includes("does not match this account");

  return (
    <main className="havi-app-main min-h-screen">
      <div className="havi-app-shell max-w-md py-10">
        <Card className="havi-card-shell w-full">
          <CardHeader>
            <CardTitle className="havi-type-page-title">Join family</CardTitle>
            <CardDescription className="havi-type-body">
              We’re adding you to the family. This may take a moment.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!token ? (
              <NoticeBanner tone="danger">Invite token is missing.</NoticeBanner>
            ) : !sessionChecked ? (
              <p className="havi-type-body">Checking session…</p>
            ) : status === "loading" ? (
              <p className="havi-type-body">Accepting invite…</p>
            ) : null}
            {status === "error" ? (
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
