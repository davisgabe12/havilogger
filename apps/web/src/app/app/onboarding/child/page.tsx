"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function OnboardingChildCompatibilityRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/app/onboarding/profile");
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12 text-foreground">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Redirecting to profile setup…</CardTitle>
          <CardDescription>
            We moved child setup into the new required profile step.
          </CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}
