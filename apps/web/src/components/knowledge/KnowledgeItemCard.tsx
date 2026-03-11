"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
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
          ? "havi-panel-inset border-[color:var(--havi-app-notice-warning-border)] bg-[color:var(--havi-app-notice-warning-bg)]"
          : "havi-panel-inset-alt text-muted-foreground"
      }
    >
      <div className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="havi-type-meta uppercase tracking-wide">{item.group}</p>
            {editing ? (
              <Textarea
                className="mt-1"
                value={draftSummary}
                onChange={(e) => setDraftSummary(e.target.value)}
              />
            ) : (
              <p className="havi-type-body font-medium">{humanSummary}</p>
            )}
            <p className="havi-type-meta">
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
