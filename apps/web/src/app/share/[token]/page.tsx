"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HaviWordmark } from "@/components/brand/HaviWordmark";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

type SharedEntry = {
  id: string;
  role: "user" | "assistant" | "caregiver";
  text: string;
  sender_name?: string;
  created_at?: string;
};

type SharedMemory = {
  id: string;
  key: string;
  status?: string;
  payload?: Record<string, unknown>;
  confidence?: string | null;
  qualifier?: string | null;
  activated_at?: string | null;
};

function summarizeMemory(memory: SharedMemory | null): string {
  if (!memory) return "";
  const payload = memory.payload ?? {};
  const candidate =
    (typeof payload.summary === "string" && payload.summary) ||
    (typeof payload.note === "string" && payload.note) ||
    (typeof payload.text === "string" && payload.text) ||
    (typeof payload.description === "string" && payload.description);
  return candidate || memory.key.replace(/_/g, " ");
}

export default function SharedConversationPage() {
  const params = useParams();
  const token = useMemo(() => {
    const raw = params?.token;
    if (!raw) return null;
    if (Array.isArray(raw)) return raw[0];
    return String(raw);
  }, [params]);
  const [entries, setEntries] = useState<SharedEntry[]>([]);
  const [title, setTitle] = useState<string>("Shared conversation");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shareType, setShareType] = useState<"conversation" | "memory">(
    "conversation",
  );
  const [memory, setMemory] = useState<SharedMemory | null>(null);

  useEffect(() => {
    if (!token) return;
    const fetchShared = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/share/${token}`);
        if (!res.ok) {
          const detail = await res.json().catch(() => ({}));
          const message =
            detail?.detail ?? (res.status === 404 ? "This share link is invalid or has expired." : null);
          throw new Error(message ?? "Unable to load shared conversation");
        }
        const data = await res.json();
        const nextType =
          data.type === "memory" ? "memory" : "conversation";
        setShareType(nextType);
        setTitle(
          data.title ??
            (nextType === "memory" ? "Shared memory" : "Shared conversation"),
        );
        if (nextType === "memory") {
          setMemory(data.memory ?? null);
          setEntries([]);
        } else {
          setEntries(data.messages ?? []);
          setMemory(null);
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : "Unknown error";
        setError(reason);
      } finally {
        setLoading(false);
      }
    };
    fetchShared();
  }, [token]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-muted-foreground">
            <HaviWordmark />
          </h1>
          <p className="text-sm text-muted-foreground">
            {shareType === "memory" ? "Shared memory" : "Shared conversation"}
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <a href="/auth/sign-up">Sign up</a>
        </Button>
      </div>
      <Card className="bg-card/70 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">{title}</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            Anyone with this link can view this shared content.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
          {error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}
          {shareType === "memory" ? (
            !loading && !error ? (
              <div
                data-testid="shared-memory"
                className="space-y-2 rounded-lg border border-border/60 bg-background/70 p-4"
              >
                <p className="text-sm font-semibold">{summarizeMemory(memory)}</p>
                <p className="text-xs text-muted-foreground">
                  {memory?.confidence
                    ? `Confidence: ${memory.confidence}${memory.qualifier ? ` • ${memory.qualifier}` : ""}`
                    : "Saved memory"}
                </p>
              </div>
            ) : null
          ) : (
            <>
              {!loading && !entries.length && !error ? (
                <p className="text-sm text-muted-foreground">No messages to display.</p>
              ) : null}
              <div className="space-y-3" data-testid="shared-conversation">
                {entries.map((entry) => (
                  <div
                    key={entry.id}
                    className={`flex flex-col ${entry.role === "user" ? "items-end" : "items-start"}`}
                  >
                    <div
                      className={`rounded-lg px-3 py-2 text-sm leading-relaxed ${
                        entry.role === "assistant"
                          ? "bg-muted/30 text-muted-foreground"
                          : entry.role === "user"
                            ? "bg-primary/15 text-primary"
                            : "bg-background/70 text-foreground border border-border/40"
                      }`}
                    >
                      {entry.text}
                    </div>
                    <p className="text-[11px] text-muted-foreground/80">
                      {entry.sender_name ?? (entry.role === "assistant" ? "HAVI" : "Caregiver")}
                      {entry.created_at ? ` · ${new Date(entry.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
