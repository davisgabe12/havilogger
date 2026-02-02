"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { KnowledgeReviewItem } from "@/types/knowledge";

type Props = {
  item: KnowledgeReviewItem;
  variant: "pending" | "active";
  onConfirm: (id: string) => Promise<void>;
  onDismiss: (id: string) => Promise<void>;
  onEdit: (id: string, payload: Record<string, unknown>, summary?: string) => Promise<void>;
};

function summarize(item: KnowledgeReviewItem): string {
  if (item.summary) return item.summary;
  if (item.payload) {
    const parts: string[] = [];
    Object.entries(item.payload).forEach(([key, value]) => {
      if (typeof value === "string" && value.trim()) {
        parts.push(`${key.replace(/_/g, " ")}: ${value}`);
      } else if (typeof value === "boolean") {
        parts.push(`${key.replace(/_/g, " ")}: ${value ? "yes" : "no"}`);
      }
    });
    if (parts.length) return parts.join(" · ");
  }
  return "New detail to review";
}

export default function KnowledgeItemCard({ item, variant, onConfirm, onDismiss, onEdit }: Props) {
  const [editing, setEditing] = useState(false);
  const [draftSummary, setDraftSummary] = useState(item.summary ?? summarize(item));
  const humanSummary = useMemo(() => summarize(item), [item]);

  const handleSave = async () => {
    await onEdit(item.id, item.payload ?? {}, draftSummary);
    setEditing(false);
  };

  return (
    <Card
      className={
        variant === "pending"
          ? "border-amber-300/50 bg-amber-50/10"
          : "border-border/50 bg-card/40 text-muted-foreground"
      }
    >
      <div className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.group}</p>
            {editing ? (
              <textarea
                className="mt-1 w-full rounded-md border border-border/50 bg-background/70 p-2 text-sm"
                value={draftSummary}
                onChange={(e) => setDraftSummary(e.target.value)}
              />
            ) : (
              <p className="text-sm font-medium leading-relaxed">{humanSummary}</p>
            )}
            <p className="text-[11px] text-muted-foreground">
              {item.status?.toLowerCase() === "pending" ? "Pending review" : "Active"}
            </p>
          </div>
          {variant === "active" ? (
            <Button size="sm" variant="ghost" onClick={() => setEditing((prev) => !prev)}>
              {editing ? "Cancel" : "Edit"}
            </Button>
          ) : null}
        </div>

        {editing ? (
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleSave} disabled={!draftSummary.trim()}>
              Save
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
              Close
            </Button>
          </div>
        ) : variant === "pending" ? (
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => onConfirm(item.id)}>
              Confirm
            </Button>
            <Button size="sm" variant="outline" onClick={() => onDismiss(item.id)}>
              Reject
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
