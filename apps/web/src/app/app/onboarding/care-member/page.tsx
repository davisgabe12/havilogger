"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { NoticeBanner } from "@/components/ui/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { API_BASE_URL } from "@/lib/api-base-url";
import { supabase } from "@/lib/supabase/client";

type CareTeamMember = {
  user_id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  relationship?: string | null;
};

type CareTeamResponse = {
  members: CareTeamMember[];
};

type FieldErrors = Record<string, string>;

async function fetchActiveFamilyId(): Promise<string | null> {
  const response = await fetch("/api/active-family", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) return null;
  const data = (await response.json().catch(() => null)) as { familyId?: string | null } | null;
  return typeof data?.familyId === "string" && data.familyId.length > 0
    ? data.familyId
    : null;
}

export default function CareMemberOnboardingPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [relationship, setRelationship] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  useEffect(() => {
    let mounted = true;
    const hydrate = async () => {
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        const session = data?.session ?? null;
        if (sessionError || !session) {
          router.replace("/auth/sign-in?next=/app/onboarding/care-member");
          return;
        }

        setEmail(session.user.email ?? "");
        const familyId = await fetchActiveFamilyId();
        if (!familyId) {
          router.replace("/app/select-family");
          return;
        }

        const res = await apiFetch(`${API_BASE_URL}/api/v1/care-team`);
        if (!res.ok) return;
        const payload = (await res.json().catch(() => null)) as CareTeamResponse | null;
        const me = payload?.members?.find((member) => member.user_id === session.user.id);
        if (!mounted || !me) return;
        setFirstName(me.first_name ?? "");
        setLastName(me.last_name ?? "");
        setEmail(me.email ?? session.user.email ?? "");
        setPhone(me.phone ?? "");
        setRelationship(me.relationship ?? "");
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };
    void hydrate();
    return () => {
      mounted = false;
    };
  }, [router]);

  const validate = (): boolean => {
    const next: FieldErrors = {};
    if (!firstName.trim()) next.firstName = "Enter your first name.";
    if (!lastName.trim()) next.lastName = "Enter your last name.";
    if (!email.trim()) {
      next.email = "Enter your email.";
    } else if (!email.includes("@")) {
      next.email = "Enter a valid email.";
    }
    const digits = phone.replace(/\D/g, "");
    if (!phone.trim()) {
      next.phone = "Enter your phone number.";
    } else if (digits.length < 7) {
      next.phone = "Enter a valid phone number.";
    }
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setError(null);
    if (!validate()) return;
    setSaving(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/v1/care-team/me/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          relationship: relationship.trim() || null,
        }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail ?? "Unable to save profile.");
      }
      router.replace("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save profile.");
      setSaving(false);
    }
  };

  return (
    <main className="havi-app-main min-h-screen">
      <div className="havi-app-shell max-w-md py-10">
        <Card className="havi-card-shell w-full">
          <CardHeader>
            <CardTitle className="havi-type-page-title">Complete your care-team profile</CardTitle>
            <CardDescription className="havi-type-body">
              Add your required details so your family can see your messages and events correctly.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="havi-type-body">Loading profile…</p>
            ) : (
              <form className="space-y-4" onSubmit={handleSubmit}>
                <Field>
                  <FieldLabel htmlFor="care-member-first-name" required>
                    First name
                  </FieldLabel>
                  <Input
                    id="care-member-first-name"
                    data-testid="care-member-first-name"
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    required
                  />
                  {fieldErrors.firstName ? <FieldError>{fieldErrors.firstName}</FieldError> : null}
                </Field>
                <Field>
                  <FieldLabel htmlFor="care-member-last-name" required>
                    Last name
                  </FieldLabel>
                  <Input
                    id="care-member-last-name"
                    data-testid="care-member-last-name"
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    required
                  />
                  {fieldErrors.lastName ? <FieldError>{fieldErrors.lastName}</FieldError> : null}
                </Field>
                <Field>
                  <FieldLabel htmlFor="care-member-email" required>
                    Email
                  </FieldLabel>
                  <Input
                    id="care-member-email"
                    data-testid="care-member-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                  {fieldErrors.email ? <FieldError>{fieldErrors.email}</FieldError> : null}
                </Field>
                <Field>
                  <FieldLabel htmlFor="care-member-phone" required>
                    Phone
                  </FieldLabel>
                  <Input
                    id="care-member-phone"
                    data-testid="care-member-phone"
                    type="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    required
                  />
                  {fieldErrors.phone ? <FieldError>{fieldErrors.phone}</FieldError> : null}
                </Field>
                <Field>
                  <FieldLabel htmlFor="care-member-relationship">
                    Relationship
                  </FieldLabel>
                  <Input
                    id="care-member-relationship"
                    data-testid="care-member-relationship"
                    value={relationship}
                    onChange={(event) => setRelationship(event.target.value)}
                    placeholder="Parent"
                  />
                </Field>
                {error ? (
                  <NoticeBanner tone="danger">{error}</NoticeBanner>
                ) : null}
                <Button
                  className="w-full"
                  type="submit"
                  data-testid="care-member-submit"
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Continue"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
