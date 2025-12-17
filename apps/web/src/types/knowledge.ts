export type KnowledgeStatus = "pending" | "active" | "rejected";
export type KnowledgeType = "explicit" | "inferred";

export interface KnowledgeReviewItem {
  id: number;
  key: string;
  group: string;
  groups: string[];
  type: KnowledgeType;
  status: KnowledgeStatus;
  label: string;
  summary: string;
  importance: string;
  confidence: number;
  dismiss_count: number;
  payload: Record<string, unknown>;
  suggested_prompt?: string | null;
  created_at: string;
  relevant_date: string | null;
}
