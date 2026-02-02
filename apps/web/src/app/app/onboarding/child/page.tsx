"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8001";
const DEFAULT_TIMEZONE = "America/Los_Angeles";

const fetchActiveFamilyId = async (): Promise<string | null> => {
  const response = await fetch("/api/active-family", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { familyId?: string | null };
  return typeof data.familyId === "string" && data.familyId.length > 0
    ? data.familyId
    : null;
};

export default function OnboardingChildPage() {
  const router = useRouter();
  const [childName, setChildName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [gender, setGender] = useState("");
  const [birthWeight, setBirthWeight] = useState("");
  const [birthWeightUnit, setBirthWeightUnit] = useState("oz");
  const [childTimezone, setChildTimezone] = useState(DEFAULT_TIMEZONE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detected) {
        setChildTimezone(detected);
      }
    } catch {
      // ignore timezone detection errors
    }
  }, []);

  const handleCreateChild = useCallback(
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

      const hasBirthDate = Boolean(birthDate);
      const hasDueDate = Boolean(dueDate);
      if (!hasBirthDate && !hasDueDate) {
        setError("Add a birth date or due date to continue.");
        setLoading(false);
        return;
      }
      if (!gender.trim()) {
        setError("Select a gender to continue.");
        setLoading(false);
        return;
      }
      if (hasBirthDate && !birthWeight.trim()) {
        setError("Add a birth weight to continue.");
        setLoading(false);
        return;
      }

      const familyId = await fetchActiveFamilyId();
      if (!familyId) {
        router.replace("/app/select-family");
        return;
      }

      const settingsResponse = await apiFetch(`${API_BASE_URL}/api/v1/settings`);
      if (!settingsResponse.ok) {
        setError("We couldn’t save that child profile. Try again.");
        setLoading(false);
        return;
      }

      const settingsPayload = (await settingsResponse.json().catch(() => null)) as
        | {
            caregiver?: Record<string, unknown>;
            child?: {
              first_name?: string | null;
              last_name?: string | null;
              birth_date?: string | null;
              due_date?: string | null;
            } & Record<string, unknown>;
          }
        | null;
      const caregiver = settingsPayload?.caregiver ?? {};
      const child = settingsPayload?.child ?? {};

      const updateResponse = await apiFetch(`${API_BASE_URL}/api/v1/settings`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          caregiver,
          child: {
            ...child,
            first_name: childName.trim() || child.first_name || "Child",
            last_name: child.last_name ?? "",
            birth_date: birthDate || child.birth_date || "",
            due_date: dueDate || child.due_date || "",
            gender: gender.trim().toLowerCase(),
            birth_weight: birthWeight ? Number(birthWeight) : null,
            birth_weight_unit: birthWeightUnit,
            timezone: childTimezone,
          },
        }),
      });

      if (!updateResponse.ok) {
        setError("We couldn’t save that child profile. Try again.");
        setLoading(false);
        return;
      }

      router.replace("/app");
    },
    [
      birthDate,
      birthWeight,
      birthWeightUnit,
      childTimezone,
      childName,
      dueDate,
      gender,
      loading,
      router,
    ],
  );

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12 text-foreground">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Add your child</CardTitle>
          <CardDescription>
            Add a birth date or due date to personalize guidance.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="space-y-4" onSubmit={handleCreateChild}>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="child-name">
                Child name
              </label>
              <Input
                id="child-name"
                data-testid="onboarding-child-name"
                value={childName}
                onChange={(event) => setChildName(event.target.value)}
                placeholder="River"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="birth-date">
                Birth date (if born)
              </label>
              <Input
                id="birth-date"
                data-testid="onboarding-child-dob"
                type="date"
                value={birthDate}
                onChange={(event) => setBirthDate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="due-date">
                Due date (if expected)
              </label>
              <Input
                id="due-date"
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="gender">
                Gender
              </label>
              <select
                id="gender"
                data-testid="onboarding-child-gender"
                className="havi-select w-full"
                value={gender}
                onChange={(event) => setGender(event.target.value)}
              >
                <option value="">Select</option>
                <option value="boy">Boy</option>
                <option value="girl">Girl</option>
                <option value="unknown">Unknown</option>
              </select>
            </div>
            {birthDate ? (
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="birth-weight">
                  Birth weight
                </label>
                <div className="flex gap-2">
                  <Input
                    id="birth-weight"
                    data-testid="onboarding-child-birth-weight"
                    type="number"
                    inputMode="decimal"
                    value={birthWeight}
                    onChange={(event) => setBirthWeight(event.target.value)}
                    placeholder="7.5"
                    className="flex-1"
                  />
                  <select
                    aria-label="Birth weight unit"
                    className="havi-select w-24"
                    value={birthWeightUnit}
                    onChange={(event) => setBirthWeightUnit(event.target.value)}
                  >
                    <option value="oz">oz</option>
                    <option value="lb">lb</option>
                  </select>
                </div>
              </div>
            ) : null}
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="child-timezone">
                Timezone
              </label>
              <select
                id="child-timezone"
                className="havi-select w-full"
                value={childTimezone || DEFAULT_TIMEZONE}
                onChange={(event) => setChildTimezone(event.target.value)}
              >
                <option value="America/Los_Angeles">Pacific (PT)</option>
                <option value="America/Denver">Mountain (MT)</option>
                <option value="America/Chicago">Central (CT)</option>
                <option value="America/New_York">Eastern (ET)</option>
              </select>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button
              type="submit"
              className="w-full"
              disabled={loading}
              data-testid="onboarding-save-child"
            >
              {loading ? "Saving..." : "Continue"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
