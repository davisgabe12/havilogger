"use client";

import { useEffect, useMemo, useState } from "react";

import { apiFetch } from "../../lib/api";
import { KnowledgeReviewItem } from "../../types/knowledge";

type KnowledgeApiResponse = KnowledgeReviewItem[];

export default function KnowledgeReviewPanel() {
  const [items, setItems] = useState<KnowledgeReviewItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const resp = await apiFetch("/api/v1/knowledge/review");
      if (resp.ok) {
        const data: KnowledgeApiResponse = await resp.json();
        setItems(data);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const grouped = useMemo(() => {
    const map: Record<string, KnowledgeReviewItem[]> = {};
    items.forEach((item) => {
      const key = item.group ?? "Other";
      if (!map[key]) {
        map[key] = [];
      }
      map[key].push(item);
    });
    return map;
  }, [items]);

  const handleConfirm = async (item: KnowledgeReviewItem) => {
    const resp = await apiFetch(`/api/v1/knowledge/${item.id}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ importance: item.importance }),
    });
    if (resp.ok) {
      const updated: KnowledgeReviewItem = await resp.json();
      setItems((prev) => prev.map((entry) => (entry.id === updated.id ? updated : entry)));
    }
  };

  const handleReject = async (item: KnowledgeReviewItem) => {
    const resp = await apiFetch(`/api/v1/knowledge/${item.id}/reject`, {
      method: "POST",
    });
    if (resp.ok) {
      const updated: KnowledgeReviewItem = await resp.json();
      setItems((prev) =>
        prev
          .map((entry) => (entry.id === updated.id ? updated : entry))
          .filter((entry) => entry.status !== "rejected")
      );
    }
  };

  const formatDate = (value: string | null | undefined) => {
    if (!value) return null;
    try {
      return new Date(value).toLocaleDateString();
    } catch {
      return value;
    }
  };

  const handleEdit = async (item: KnowledgeReviewItem) => {
    if (typeof window === "undefined") {
      return;
    }
    const current = item.key === "manual_memory" ? (item.payload?.text as string | undefined) : item.summary;
    const next = window.prompt(`Update ${item.label}`, current ?? "");
    if (next === null) {
      return;
    }
    const patchPayload: Record<string, unknown> = { summary: next };
    if (item.key === "manual_memory") {
      patchPayload.text = next;
    }
    const resp = await apiFetch(`/api/v1/knowledge/${item.id}/edit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: patchPayload }),
    });
    if (resp.ok) {
      const updated: KnowledgeReviewItem = await resp.json();
      setItems((prev) => prev.map((entry) => (entry.id === updated.id ? updated : entry)));
    }
  };

  if (loading) {
    return <p>Loading what I remember…</p>;
  }

  const groupEntries = Object.entries(grouped);

  return (
    <section>
      <h1>What I’ve learned about your family</h1>
      <p>You’re in control of what I remember. Confirm, adjust, or remove anything here.</p>
      {groupEntries.length === 0 && <p>No memories yet—send me a quick update to get started.</p>}
      {groupEntries.map(([group, entries]) => (
        <div key={group}>
          <h2>{group}</h2>
          <div>
            {entries.map((entry) => (
              <article key={entry.id}>
                <header>
                  <strong>{entry.label}</strong>
                  <span>
                    {entry.status} · {entry.type}
                  </span>
                </header>
                <p>
                  Saved on {formatDate(entry.created_at)}
                  {entry.relevant_date && <> · For date: {formatDate(entry.relevant_date)}</>}
                </p>
                <p>{entry.summary}</p>
                {entry.suggested_prompt && <p>{entry.suggested_prompt}</p>}
                <div>
                  {entry.status === "pending" && (
                    <button onClick={() => handleConfirm(entry)}>Confirm</button>
                  )}
                  <button onClick={() => handleReject(entry)}>
                    {entry.status === "pending" ? "Reject" : "Remove"}
                  </button>
                  {entry.status === "active" && (
                    <button onClick={() => handleEdit(entry)}>Edit</button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
