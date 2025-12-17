"use client";

import KnowledgeItemCard from "./KnowledgeItemCard";
import { KnowledgeReviewItem } from "@/types/knowledge";

type Props = {
  group: string;
  items: KnowledgeReviewItem[];
  onConfirm: (id: number) => Promise<void>;
  onDismiss: (id: number) => Promise<void>;
  onEdit: (id: number, payload: Record<string, unknown>, summary?: string) => Promise<void>;
};

export default function KnowledgeList({ group, items, onConfirm, onDismiss, onEdit }: Props) {
  if (!items.length) return null;
  const pending = items.filter((item) => item.status?.toLowerCase() === "pending");
  const active = items.filter((item) => item.status?.toLowerCase() === "active");

  return (
    <section className="space-y-3 rounded-xl border border-border/40 bg-card/50 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">{group}</h2>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {pending.length} to review · {active.length} active
        </p>
      </div>

      {pending.length ? (
        <div className="space-y-2">
          {pending.map((item) => (
            <KnowledgeItemCard
              key={item.id}
              item={item}
              variant="pending"
              onConfirm={onConfirm}
              onDismiss={onDismiss}
              onEdit={onEdit}
            />
          ))}
        </div>
      ) : null}

      {active.length ? (
        <div className="space-y-2">
          {active.map((item) => (
            <KnowledgeItemCard
              key={item.id}
              item={item}
              variant="active"
              onConfirm={onConfirm}
              onDismiss={onDismiss}
              onEdit={onEdit}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
