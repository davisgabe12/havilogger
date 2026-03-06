"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldHint, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { apiFetch } from "@/lib/api";
import { API_BASE_URL } from "@/lib/api-base-url";
import { supabase } from "@/lib/supabase/client";
const DEFAULT_TIMEZONE = "America/Los_Angeles";
const ACTIVE_CHILD_KEY = "havi_active_child_id";

const TIMEZONE_OPTIONS = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
];

type SettingsChild = {
  id?: string | null;
  first_name?: string | null;
  name?: string | null;
  birth_date?: string | null;
  due_date?: string | null;
  birth_weight?: number | string | null;
  latest_weight?: number | string | null;
  timezone?: string | null;
};

type SettingsPayload = {
  caregiver?: {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  child?: SettingsChild | null;
  children?: SettingsChild[] | null;
};

type FormStep = "caregiver" | "child";
type FieldErrors = Record<string, string>;

const toStringValue = (value: number | string | null | undefined): string => {
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  return "";
};

const parsePositiveNumber = (value: string): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

const fetchActiveFamilyId = async (): Promise<string | null> => {
  const response = await fetch("/api/active-family", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) return null;
  const data = (await response.json().catch(() => null)) as
    | { familyId?: string | null }
    | null;
  return typeof data?.familyId === "string" && data.familyId.length > 0
    ? data.familyId
    : null;
};

export default function OnboardingProfilePage() {
  const router = useRouter();
  const [step, setStep] = useState<FormStep>("caregiver");
  const [caregiverFirstName, setCaregiverFirstName] = useState("");
  const [caregiverLastName, setCaregiverLastName] = useState("");
  const [caregiverEmail, setCaregiverEmail] = useState("");
  const [caregiverPhone, setCaregiverPhone] = useState("");
  const [childName, setChildName] = useState("");
  const [childDob, setChildDob] = useState("");
  const [childDueDate, setChildDueDate] = useState("");
  const [childBirthWeight, setChildBirthWeight] = useState("");
  const [childLatestWeight, setChildLatestWeight] = useState("");
  const [childTimezone, setChildTimezone] = useState(DEFAULT_TIMEZONE);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [hydrating, setHydrating] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const hydrate = async () => {
      try {
        const detectedTimezone =
          Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
        if (!isMounted) return;
        setChildTimezone(detectedTimezone);

        const { data: sessionData, error: sessionError } =
          await supabase.auth.getSession();
        const session = sessionData?.session ?? null;
        if (sessionError || !session) {
          router.replace("/auth/sign-in");
          return;
        }
        setCaregiverEmail(session.user.email ?? "");

        const familyId = await fetchActiveFamilyId();
        if (!familyId) {
          router.replace("/app/onboarding/family");
          return;
        }

        const res = await apiFetch(`${API_BASE_URL}/api/v1/settings`, {
          method: "GET",
        });
        if (!res.ok) {
          if (isMounted) {
            setHydrating(false);
          }
          return;
        }
        const payload = (await res.json().catch(() => null)) as SettingsPayload | null;
        if (!payload || !isMounted) {
          setHydrating(false);
          return;
        }
        const caregiver = payload.caregiver ?? {};
        const child =
          (Array.isArray(payload.children) && payload.children.length > 0
            ? payload.children[0]
            : payload.child) ?? null;

        setCaregiverFirstName(caregiver.first_name ?? "");
        setCaregiverLastName(caregiver.last_name ?? "");
        setCaregiverEmail(caregiver.email ?? session.user.email ?? "");
        setCaregiverPhone(caregiver.phone ?? "");
        setChildName(child?.first_name ?? child?.name ?? "Unknown");
        setChildDob(child?.birth_date ?? "");
        setChildDueDate(child?.due_date ?? "");
        setChildBirthWeight(toStringValue(child?.birth_weight));
        setChildLatestWeight(toStringValue(child?.latest_weight));
        setChildTimezone(child?.timezone || detectedTimezone || DEFAULT_TIMEZONE);

        const caregiverComplete = Boolean(
          (caregiver.first_name ?? "").trim() &&
            (caregiver.last_name ?? "").trim() &&
            (caregiver.email ?? "").trim() &&
            (caregiver.phone ?? "").trim(),
        );
        if (caregiverComplete) {
          setStep("child");
        }
      } finally {
        if (isMounted) {
          setHydrating(false);
        }
      }
    };

    void hydrate();
    return () => {
      isMounted = false;
    };
  }, [router]);

  const timezoneOptions = useMemo(() => {
    const deduped = new Set(TIMEZONE_OPTIONS);
    if (childTimezone) {
      deduped.add(childTimezone);
    }
    return Array.from(deduped);
  }, [childTimezone]);

  const validateCaregiver = useCallback((): boolean => {
    const nextErrors: FieldErrors = {};
    if (!caregiverFirstName.trim()) {
      nextErrors.caregiverFirstName = "Enter your first name.";
    }
    if (!caregiverLastName.trim()) {
      nextErrors.caregiverLastName = "Enter your last name.";
    }
    const email = caregiverEmail.trim();
    if (!email) {
      nextErrors.caregiverEmail = "Enter your email.";
    } else if (!email.includes("@")) {
      nextErrors.caregiverEmail = "Enter a valid email address.";
    }
    const phone = caregiverPhone.trim();
    const digitsOnly = phone.replace(/\D/g, "");
    if (!phone) {
      nextErrors.caregiverPhone = "Enter your phone number.";
    } else if (digitsOnly.length < 7) {
      nextErrors.caregiverPhone = "Enter a valid phone number.";
    }
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }, [caregiverEmail, caregiverFirstName, caregiverLastName, caregiverPhone]);

  const validateChild = useCallback((): boolean => {
    const nextErrors: FieldErrors = {};
    if (!childName.trim()) {
      nextErrors.childName = "Enter a child name. Use Unknown if needed.";
    }
    if (!childDob && !childDueDate) {
      nextErrors.childDob = "Add a date of birth or due date.";
      nextErrors.childDueDate = "Add a date of birth or due date.";
    }
    if (!childBirthWeight.trim()) {
      nextErrors.childBirthWeight = "Enter birth weight.";
    } else if (parsePositiveNumber(childBirthWeight) == null) {
      nextErrors.childBirthWeight = "Enter a number greater than 0.";
    }
    if (!childLatestWeight.trim()) {
      nextErrors.childLatestWeight = "Enter last known weight.";
    } else if (parsePositiveNumber(childLatestWeight) == null) {
      nextErrors.childLatestWeight = "Enter a number greater than 0.";
    }
    if (!childTimezone.trim()) {
      nextErrors.childTimezone = "Select a timezone.";
    }
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }, [childBirthWeight, childDob, childDueDate, childLatestWeight, childName, childTimezone]);

  const handleContinue = useCallback(() => {
    setError(null);
    if (!validateCaregiver()) {
      return;
    }
    setStep("child");
    setFieldErrors({});
  }, [validateCaregiver]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (saving) return;
      setError(null);
      if (step === "caregiver") {
        handleContinue();
        return;
      }
      if (!validateChild()) {
        return;
      }

      const birthWeight = parsePositiveNumber(childBirthWeight);
      const latestWeight = parsePositiveNumber(childLatestWeight);
      if (birthWeight == null || latestWeight == null) {
        return;
      }

      setSaving(true);
      try {
        const activeFamilyId = await fetchActiveFamilyId();
        if (!activeFamilyId) {
          throw new Error("No active family found. Return to family setup and try again.");
        }

        const caregiverPayload = {
          first_name: caregiverFirstName.trim(),
          last_name: caregiverLastName.trim(),
          email: caregiverEmail.trim(),
          phone: caregiverPhone.trim(),
        };
        const onboardingChildPayload = {
          name: childName.trim() || "Unknown",
          birth_date: childDob || "",
          due_date: childDueDate || "",
          birth_weight: birthWeight,
          latest_weight: latestWeight,
          timezone: childTimezone || DEFAULT_TIMEZONE,
        };

        let response = await apiFetch(`${API_BASE_URL}/api/v1/onboarding/profile`, {
          method: "POST",
          familyId: activeFamilyId,
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            caregiver: caregiverPayload,
            child: onboardingChildPayload,
          }),
        });

        if (response.status === 404 || response.status === 405) {
          response = await apiFetch(`${API_BASE_URL}/api/v1/settings`, {
            method: "PUT",
            familyId: activeFamilyId,
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              caregiver: caregiverPayload,
              child: {
                first_name: onboardingChildPayload.name,
                last_name: caregiverPayload.last_name,
                birth_date: onboardingChildPayload.birth_date,
                due_date: onboardingChildPayload.due_date,
                timezone: onboardingChildPayload.timezone,
                gender: "unknown",
                birth_weight: onboardingChildPayload.birth_weight,
                birth_weight_unit: "lb",
                latest_weight: onboardingChildPayload.latest_weight,
                latest_weight_date: "",
              },
            }),
          });
        }

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { detail?: string }
            | null;
          throw new Error(payload?.detail || "We couldn’t save your profile. Try again.");
        }

        const payload = (await response.json().catch(() => null)) as SettingsPayload | null;
        const selectedChildId =
          payload?.child?.id ??
          (Array.isArray(payload?.children) && payload.children.length > 0
            ? payload.children[0]?.id
            : null);
        if (selectedChildId && typeof window !== "undefined") {
          window.localStorage.setItem(ACTIVE_CHILD_KEY, selectedChildId);
        }
        router.replace("/app");
      } catch (err) {
        if (err instanceof Error && err.message) {
          setError(err.message);
        } else {
          setError("We couldn’t save your profile. Try again.");
        }
        setSaving(false);
      }
    },
    [
      caregiverEmail,
      caregiverFirstName,
      caregiverLastName,
      caregiverPhone,
      childBirthWeight,
      childDob,
      childDueDate,
      childLatestWeight,
      childName,
      childTimezone,
      handleContinue,
      saving,
      step,
      validateChild,
      router,
    ],
  );

  if (hydrating) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12 text-foreground">
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle>Loading profile step…</CardTitle>
            <CardDescription>Preparing your setup.</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12 text-foreground">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Step 2 of 2
          </p>
          <CardTitle>Complete your profile</CardTitle>
          <CardDescription>
            Add required caregiver and child details once so settings is prefilled.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="space-y-6" onSubmit={handleSubmit}>
            {step === "caregiver" ? (
              <section className="space-y-4" data-testid="onboarding-profile-caregiver">
                <Field>
                  <FieldLabel htmlFor="caregiver-first-name" required>
                    First name
                  </FieldLabel>
                  <Input
                    id="caregiver-first-name"
                    data-testid="onboarding-profile-caregiver-first-name"
                    autoComplete="given-name"
                    value={caregiverFirstName}
                    onChange={(event) => setCaregiverFirstName(event.target.value)}
                    required
                    aria-invalid={Boolean(fieldErrors.caregiverFirstName)}
                  />
                  {fieldErrors.caregiverFirstName ? (
                    <FieldError>{fieldErrors.caregiverFirstName}</FieldError>
                  ) : null}
                </Field>
                <Field>
                  <FieldLabel htmlFor="caregiver-last-name" required>
                    Last name
                  </FieldLabel>
                  <Input
                    id="caregiver-last-name"
                    data-testid="onboarding-profile-caregiver-last-name"
                    autoComplete="family-name"
                    value={caregiverLastName}
                    onChange={(event) => setCaregiverLastName(event.target.value)}
                    required
                    aria-invalid={Boolean(fieldErrors.caregiverLastName)}
                  />
                  {fieldErrors.caregiverLastName ? (
                    <FieldError>{fieldErrors.caregiverLastName}</FieldError>
                  ) : null}
                </Field>
                <Field>
                  <FieldLabel htmlFor="caregiver-email" required>
                    Email
                  </FieldLabel>
                  <Input
                    id="caregiver-email"
                    data-testid="onboarding-profile-caregiver-email"
                    type="email"
                    autoComplete="email"
                    value={caregiverEmail}
                    onChange={(event) => setCaregiverEmail(event.target.value)}
                    required
                    aria-invalid={Boolean(fieldErrors.caregiverEmail)}
                  />
                  {fieldErrors.caregiverEmail ? (
                    <FieldError>{fieldErrors.caregiverEmail}</FieldError>
                  ) : null}
                </Field>
                <Field>
                  <FieldLabel htmlFor="caregiver-phone" required>
                    Phone
                  </FieldLabel>
                  <Input
                    id="caregiver-phone"
                    data-testid="onboarding-profile-caregiver-phone"
                    type="tel"
                    autoComplete="tel"
                    value={caregiverPhone}
                    onChange={(event) => setCaregiverPhone(event.target.value)}
                    required
                    aria-invalid={Boolean(fieldErrors.caregiverPhone)}
                  />
                  {fieldErrors.caregiverPhone ? (
                    <FieldError>{fieldErrors.caregiverPhone}</FieldError>
                  ) : null}
                </Field>
              </section>
            ) : (
              <section className="space-y-4" data-testid="onboarding-profile-child">
                <Field>
                  <FieldLabel htmlFor="child-name" required>
                    Child name
                  </FieldLabel>
                  <Input
                    id="child-name"
                    data-testid="onboarding-profile-child-name"
                    autoComplete="off"
                    value={childName}
                    onChange={(event) => setChildName(event.target.value)}
                    placeholder="Use Unknown if needed"
                    required
                    aria-invalid={Boolean(fieldErrors.childName)}
                  />
                  <FieldHint>Unknown is accepted when name is not available yet.</FieldHint>
                  {fieldErrors.childName ? (
                    <FieldError>{fieldErrors.childName}</FieldError>
                  ) : null}
                </Field>
                <Field>
                  <FieldLabel htmlFor="child-dob" required>
                    Date of birth (if born)
                  </FieldLabel>
                  <Input
                    id="child-dob"
                    data-testid="onboarding-profile-child-dob"
                    type="date"
                    value={childDob}
                    onChange={(event) => setChildDob(event.target.value)}
                    aria-invalid={Boolean(fieldErrors.childDob)}
                  />
                  {fieldErrors.childDob ? (
                    <FieldError>{fieldErrors.childDob}</FieldError>
                  ) : null}
                </Field>
                <Field>
                  <FieldLabel htmlFor="child-due-date">Due date (if expected)</FieldLabel>
                  <Input
                    id="child-due-date"
                    data-testid="onboarding-profile-child-due-date"
                    type="date"
                    value={childDueDate}
                    onChange={(event) => setChildDueDate(event.target.value)}
                    aria-invalid={Boolean(fieldErrors.childDueDate)}
                  />
                  {fieldErrors.childDueDate ? (
                    <FieldError>{fieldErrors.childDueDate}</FieldError>
                  ) : null}
                </Field>
                <Field>
                  <FieldLabel htmlFor="child-birth-weight" required>
                    Birth weight
                  </FieldLabel>
                  <Input
                    id="child-birth-weight"
                    data-testid="onboarding-profile-child-birth-weight"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.1"
                    value={childBirthWeight}
                    onChange={(event) => setChildBirthWeight(event.target.value)}
                    required
                    aria-invalid={Boolean(fieldErrors.childBirthWeight)}
                  />
                  {fieldErrors.childBirthWeight ? (
                    <FieldError>{fieldErrors.childBirthWeight}</FieldError>
                  ) : null}
                </Field>
                <Field>
                  <FieldLabel htmlFor="child-latest-weight" required>
                    Last known weight
                  </FieldLabel>
                  <Input
                    id="child-latest-weight"
                    data-testid="onboarding-profile-child-last-known-weight"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.1"
                    value={childLatestWeight}
                    onChange={(event) => setChildLatestWeight(event.target.value)}
                    required
                    aria-invalid={Boolean(fieldErrors.childLatestWeight)}
                  />
                  {fieldErrors.childLatestWeight ? (
                    <FieldError>{fieldErrors.childLatestWeight}</FieldError>
                  ) : null}
                </Field>
                <Field>
                  <FieldLabel htmlFor="child-timezone" required>
                    Timezone
                  </FieldLabel>
                  <Select
                    id="child-timezone"
                    data-testid="onboarding-profile-child-timezone"
                    value={childTimezone}
                    onChange={(event) => setChildTimezone(event.target.value)}
                    aria-invalid={Boolean(fieldErrors.childTimezone)}
                  >
                    {timezoneOptions.map((timezone) => (
                      <option key={timezone} value={timezone}>
                        {timezone}
                      </option>
                    ))}
                  </Select>
                  {fieldErrors.childTimezone ? (
                    <FieldError>{fieldErrors.childTimezone}</FieldError>
                  ) : null}
                </Field>
              </section>
            )}

            {error ? <FieldError>{error}</FieldError> : null}
            <div className="flex justify-between gap-2">
              {step === "child" ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setError(null);
                    setFieldErrors({});
                    setStep("caregiver");
                  }}
                  data-testid="onboarding-profile-back"
                >
                  Back
                </Button>
              ) : (
                <span />
              )}
              <Button
                type="submit"
                disabled={saving}
                data-testid={step === "caregiver"
                  ? "onboarding-profile-continue"
                  : "onboarding-profile-submit"}
              >
                {step === "caregiver"
                  ? "Continue"
                  : saving
                    ? "Saving..."
                    : "Finish setup"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
