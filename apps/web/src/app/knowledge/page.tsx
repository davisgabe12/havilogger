"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import KnowledgeList from "@/components/knowledge/KnowledgeList";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HaviWordmark } from "@/components/brand/HaviWordmark";
import { supabase } from "@/lib/supabase/client";
import { KnowledgeReviewItem } from "@/types/knowledge";

const KNOWLEDGE_GROUPS = ["Care Plan", "Child Profile", "Preferences", "Activities", "Milestones"];

export default function KnowledgePage() {
  const router = useRouter();
  const [items, setItems] = useState<KnowledgeReviewItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/knowledge/review");
      if (!res.ok) {
        throw new Error("Unable to load knowledge");
      }
      const data: KnowledgeReviewItem[] = await res.json();
      setItems(data.filter((item) => item.status?.toLowerCase() === "pending"));
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Unknown error";
      setError(reason);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    const checkSessionAndLoad = async () => {
      const { data } = await supabase.auth.getSession();
      if (!isMounted) return;
      if (!data.session) {
        router.replace("/login");
        return;
      }
      await fetchItems();
    };

    void checkSessionAndLoad();

    return () => {
      isMounted = false;
    };
  }, [fetchItems, router]);

  const groups = useMemo(() => {
    const map: Record<string, KnowledgeReviewItem[]> = {};
    items.forEach((item) => {
      const key = item.group || "Other";
      if (!map[key]) {
        map[key] = [];
      }
      map[key].push(item);
    });
    return map;
  }, [items]);

  const handleConfirm = async (id: number) => {
    await fetch(`/api/v1/knowledge/${id}/confirm`, { method: "POST" });
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleDismiss = async (id: number) => {
    await fetch(`/api/v1/knowledge/${id}/reject`, { method: "POST" });
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleEdit = async (id: number, payload: Record<string, unknown>, summary?: string) => {
    await fetch(`/api/v1/knowledge/${id}/edit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload, summary }),
    });
    void fetchItems();
  };

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
      <header>
        <h1 className="text-3xl font-bold text-muted-foreground">
          <HaviWordmark />
        </h1>
      </header>
      <Card className="bg-card/70 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Knowledge review</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            Confirm or edit what HAVI has learned so far.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{loading ? "Refreshing…" : "Up to date"}</span>
            <Button size="sm" variant="outline" onClick={fetchItems} disabled={loading}>
              Refresh
            </Button>
          </div>
          {error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}
          {loading && !items.length ? (
            <p className="text-sm text-muted-foreground">Loading what HAVI remembers…</p>
          ) : null}
          {!loading && items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No knowledge saved yet. As you chat, HAVI will collect helpful details here.
            </p>
          ) : null}
          {Object.entries(groups)
            .sort(([a], [b]) => {
              const ai = KNOWLEDGE_GROUPS.indexOf(a);
              const bi = KNOWLEDGE_GROUPS.indexOf(b);
              return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
            })
            .map(([group, groupItems]) => (
              <KnowledgeList
                key={group}
                group={group}
                items={groupItems}
                onConfirm={handleConfirm}
                onDismiss={handleDismiss}
                onEdit={handleEdit}
              />
            ))}
        </CardContent>
      </Card>
    </main>
  );
}
