"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import KnowledgeList from "@/components/knowledge/KnowledgeList";
import { NoticeBanner } from "@/components/ui/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HaviWordmark } from "@/components/brand/HaviWordmark";
import { apiFetch } from "@/lib/api";
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
      const res = await apiFetch("/api/v1/knowledge/review");
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
        router.replace("/auth/sign-in");
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

  const handleConfirm = async (id: string) => {
    await apiFetch(`/api/v1/knowledge/${id}/confirm`, { method: "POST" });
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleDismiss = async (id: string) => {
    await apiFetch(`/api/v1/knowledge/${id}/reject`, { method: "POST" });
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleEdit = async (
    id: string,
    payload: Record<string, unknown>,
    summary?: string,
  ) => {
    await apiFetch(`/api/v1/knowledge/${id}/edit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload, summary }),
    });
    void fetchItems();
  };

  return (
    <main className="havi-app-main min-h-screen">
      <div className="havi-app-shell max-w-3xl">
        <header className="havi-panel-inset-alt rounded-xl p-4">
          <h1 className="havi-type-page-title">
            <HaviWordmark />
          </h1>
          <p className="havi-type-body mt-1">
            Review and confirm what HAVI is retaining for your family.
          </p>
        </header>
        <Card className="havi-card-shell">
          <CardHeader>
            <CardTitle className="havi-type-section-title">Knowledge review</CardTitle>
            <CardDescription className="havi-type-body">
              Confirm or edit what HAVI has learned so far.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="havi-panel-inset-alt havi-type-body flex items-center justify-between rounded-lg px-3 py-2">
              <span>{loading ? "Refreshing…" : "Up to date"}</span>
              <Button size="sm" variant="outline" onClick={fetchItems} disabled={loading}>
                Refresh
              </Button>
            </div>
            {error ? (
              <NoticeBanner tone="danger">
                {error}
              </NoticeBanner>
            ) : null}
            {loading && !items.length ? (
              <p className="havi-type-body">Loading what HAVI remembers…</p>
            ) : null}
            {!loading && items.length === 0 ? (
              <p className="havi-type-body">
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
      </div>
    </main>
  );
}
