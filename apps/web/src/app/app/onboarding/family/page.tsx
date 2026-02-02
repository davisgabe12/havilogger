"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

export default function OnboardingFamilyPage() {
  const router = useRouter();
  const [familyName, setFamilyName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateFamily = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (loading) return;
      setLoading(true);
      setError(null);

      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();
      const session = sessionData?.session ?? null;
      if (sessionError || !session) {
        router.replace("/auth/sign-in");
        return;
      }

      const familyResponse = await apiFetch(`${API_BASE_URL}/api/v1/families`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: familyName.trim() }),
      });

      if (!familyResponse.ok) {
        setError("We couldn’t create your family. Try again.");
        setLoading(false);
        return;
      }

      const familyPayload = (await familyResponse.json().catch(() => null)) as
        | { id?: string }
        | null;
      const familyId = familyPayload?.id ?? "";

      if (!familyId) {
        setError("We couldn’t create your family. Try again.");
        setLoading(false);
        return;
      }

      const cookieResponse = await fetch("/api/active-family", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ familyId }),
      });

      if (!cookieResponse.ok) {
        setError("We couldn’t set your active family. Try again.");
        setLoading(false);
        return;
      }

      router.replace("/app/onboarding/child");
    },
    [familyName, loading, router],
  );

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12 text-foreground">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create your family</CardTitle>
          <CardDescription>
            Start by naming the family you want to log updates for.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="space-y-4" onSubmit={handleCreateFamily}>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="family-name">
                Family name
              </label>
              <Input
                id="family-name"
                data-testid="onboarding-family-name"
                value={familyName}
                onChange={(event) => setFamilyName(event.target.value)}
                placeholder="The Rivera family"
                autoComplete="off"
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button
              type="submit"
              className="w-full"
              disabled={loading}
              data-testid="onboarding-create-family"
            >
              {loading ? "Creating..." : "Create family"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
