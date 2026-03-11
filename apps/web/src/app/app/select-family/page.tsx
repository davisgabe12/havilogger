"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { NoticeBanner } from "@/components/ui/app-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { supabase } from "@/lib/supabase/client";

type Family = {
  id: string;
  name: string;
};

type FamilyMemberRow = {
  family_id: string;
  families:
    | {
        id: string;
        name: string | null;
      }[]
    | null;
};

const normalizeFamilies = (rows: FamilyMemberRow[]): Family[] => {
  const unique = new Map<string, Family>();
  rows.forEach((row) => {
    const family = row.families?.[0] ?? {
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

const setActiveFamily = async (familyId: string): Promise<boolean> => {
  const response = await fetch("/api/active-family", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ familyId }),
  });
  return response.ok;
};

export default function SelectFamilyPage() {
  const router = useRouter();
  const [families, setFamilies] = useState<Family[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFamilies = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();
      const session = sessionData?.session ?? null;
      if (sessionError || !session) {
        router.replace("/auth/sign-in");
        return;
      }

      const { data, error: membershipError } = await supabase
        .from("family_members")
        .select("family_id,families(id,name)")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: true });

      if (membershipError) {
        setError("We couldn’t load your families. Try again in a moment.");
      } else {
        setFamilies(normalizeFamilies((data ?? []) as FamilyMemberRow[]));
      }
    } catch {
      setError("We couldn’t load your families. Try again in a moment.");
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void loadFamilies();
  }, [loadFamilies]);

  const handleSelectFamily = useCallback(
    async (familyId: string) => {
      const ok = await setActiveFamily(familyId);
      if (!ok) {
        setError("We couldn’t select that family. Try again.");
        return;
      }
      router.push("/app");
    },
    [router],
  );

  useEffect(() => {
    if (loading || error || families.length !== 1) {
      return;
    }
    void handleSelectFamily(families[0].id);
  }, [error, families, handleSelectFamily, loading]);

  return (
    <main className="havi-app-main min-h-screen">
      <div className="havi-app-shell max-w-md py-10">
        <Card className="havi-card-shell w-full">
          <CardHeader>
            <CardTitle className="havi-type-page-title">Select your family</CardTitle>
            <CardDescription className="havi-type-body">
              Choose the family you want to log updates for.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <p className="havi-type-body">Loading families...</p>
            ) : error ? (
              <NoticeBanner tone="danger">{error}</NoticeBanner>
            ) : families.length === 0 ? (
              <p className="havi-type-body">
                We couldn’t find any families yet. Ask an admin to add you.
              </p>
            ) : (
              <div className="space-y-2">
                {families.map((family) => (
                  <Button
                    key={family.id}
                    className="w-full justify-between"
                    variant="outline"
                    data-testid={`select-family-${family.id}`}
                    onClick={() => handleSelectFamily(family.id)}
                  >
                    <span>{family.name}</span>
                    <span className="text-xs text-muted-foreground">Select</span>
                  </Button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
