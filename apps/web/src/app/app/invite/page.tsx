"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { apiFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8001";

export default function InviteAcceptPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "success">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace("/auth/sign-in");
      }
    };
    void checkSession();
  }, [router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const nextToken = params.get("token") ?? "";
    setToken(nextToken);
  }, []);

  useEffect(() => {
    if (!token) return;
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
  }, [router, token]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12 text-foreground">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Join family</CardTitle>
          <CardDescription>
            We’re adding you to the family. This may take a moment.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {status === "loading" ? (
            <p className="text-sm text-muted-foreground">Accepting invite…</p>
          ) : null}
          {status === "error" ? (
            <div className="space-y-2">
              <p className="text-sm text-destructive">{error}</p>
              <Button size="sm" onClick={() => router.replace("/app")}>
                Go to app
              </Button>
            </div>
          ) : null}
          {status === "success" ? (
            <p className="text-sm text-muted-foreground">Invite accepted. Redirecting…</p>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
