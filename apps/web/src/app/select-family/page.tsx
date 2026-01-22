"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
const ACTIVE_FAMILY_STORAGE_KEY = "havi_active_family_id";
const DEV_FAMILY_LABEL = "New test family";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

type Family = {
  id: number;
  name: string;
};

type FamilyMemberRow = {
  family_id: number;
  families: {
    id: number;
    name: string | null;
  } | null;
};

const normalizeFamilies = (rows: FamilyMemberRow[]): Family[] => {
  const unique = new Map<number, Family>();
  rows.forEach((row) => {
    const family = row.families ?? {
      id: row.family_id,
      name: null,
    };
    if (!unique.has(family.id)) {
      unique.set(family.id, {
        id: family.id,
        name: family.name ?? `Family #${family.id}`,
      });
    }
  });
  return Array.from(unique.values());
};

const getSupabaseSession = () => {
  if (typeof window === "undefined" || !SUPABASE_URL) {
    return null;
  }
  try {
    const projectRef = new URL(SUPABASE_URL).hostname.split(".")[0];
    const storageKey = `sb-${projectRef}-auth-token`;
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as {
      access_token?: string;
      user?: { id?: string };
    };
    if (!parsed?.access_token || !parsed?.user?.id) {
      return null;
    }
    return parsed;
  } catch (error) {
    return null;
  }
};

export default function SelectFamilyPage() {
  const router = useRouter();
  const [families, setFamilies] = useState<Family[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isDev = useMemo(() => process.env.NODE_ENV === "development", []);

  const loadFamilies = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      setError("Supabase is not configured. Please contact support.");
      setLoading(false);
      return;
    }

    const session = getSupabaseSession();
    if (!session) {
      setError("Please sign in to pick a family.");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/family_members?select=family_id,families(id,name)&user_id=eq.${encodeURIComponent(
          session.user.id,
        )}`,
        {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${session.access_token}`,
          },
        },
      );

      if (!response.ok) {
        setError("We couldn’t load your families. Try again in a moment.");
        setLoading(false);
        return;
      }

      const data = (await response.json()) as FamilyMemberRow[];
      setFamilies(normalizeFamilies(data ?? []));
    } catch {
      setError("We couldn’t load your families. Try again in a moment.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadFamilies();
  }, [loadFamilies]);

  useEffect(() => {
    if (loading || error || families.length !== 1) {
      return;
    }
    handleSelectFamily(families[0].id);
  }, [error, families, handleSelectFamily, loading]);

  const handleSelectFamily = useCallback(
    (familyId: number) => {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          ACTIVE_FAMILY_STORAGE_KEY,
          String(familyId),
        );
      }
      router.push("/");
    },
    [router],
  );

  const handleAddDevFamily = useCallback(() => {
    setFamilies((current) => [
      ...current,
      {
        id: Date.now(),
        name: DEV_FAMILY_LABEL,
      },
    ]);
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12 text-foreground">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Select your family</CardTitle>
          <CardDescription>
            Choose the family you want to log updates for.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading families...</p>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : families.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              We couldn’t find any families yet. Ask an admin to add you.
            </p>
          ) : (
            <div className="space-y-2">
              {families.map((family) => (
                <Button
                  key={family.id}
                  className="w-full justify-between"
                  variant="outline"
                  onClick={() => handleSelectFamily(family.id)}
                >
                  <span>{family.name}</span>
                  <span className="text-xs text-muted-foreground">Select</span>
                </Button>
              ))}
            </div>
          )}

          {isDev ? (
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={handleAddDevFamily}
            >
              + Add another family
            </Button>
          ) : null}
import Link from "next/link";

import { HaviWordmark } from "@/components/brand/HaviWordmark";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const FAMILY_OPTIONS = [
  { id: "family-1", name: "Avery & Oak", detail: "Primary household" },
  { id: "family-2", name: "Daycare Crew", detail: "Shared caregiver log" },
];

export default function SelectFamilyPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="havi-card-shell w-full max-w-md">
        <CardHeader className="space-y-3 text-center">
          <div className="flex justify-center text-muted-foreground">
            <HaviWordmark />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-xl">Choose a family</CardTitle>
            <CardDescription>Select the log you want to update right now.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {FAMILY_OPTIONS.map((family) => (
              <button
                key={family.id}
                type="button"
                className="flex w-full flex-col items-start gap-1 rounded-md border border-border bg-background/40 px-4 py-3 text-left text-sm text-foreground transition hover:bg-accent"
              >
                <span className="font-medium">{family.name}</span>
                <span className="text-xs text-muted-foreground">{family.detail}</span>
              </button>
            ))}
          </div>
          <Button className="w-full" type="button">
            Continue
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href="/login">Switch account</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
