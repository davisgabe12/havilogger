export type KnowledgeStatus = "pending" | "active" | "rejected" | "archived";
export type KnowledgeType = "explicit" | "inferred";

export interface KnowledgeReviewItem {
  id: string;
  key: string;
  label?: string;
  type: KnowledgeType;
  status: KnowledgeStatus;
  group?: string;
  importance?: string;
  summary?: string;
  relevant_date?: string | null;
  suggested_prompt?: string | null;
  confidence?: string | null;
  qualifier?: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at?: string;
  activated_at?: string | null;
  expires_at?: string | null;
  subject_id?: string | null;
}
