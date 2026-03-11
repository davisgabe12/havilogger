export type ChatRouteMetadata = {
  route_kind: string;
  expected_route_kind?: string | null;
  user_intent: string;
  classifier_intent: string;
  decision_source: string;
  classifier_override?: boolean;
  classifier_reason?: string | null;
  classifier_fallback_reason?: string | null;
  rollout_intent_classifier_pct?: number | null;
  confidence: number;
  is_question: boolean;
  mixed_logging_segment_count: number;
  composer_source?: string | null;
  composer_fallback_reason?: string | null;
};

export type ChatEntry = {
  id: string;
  role: "user" | "havi";
  text: string;
  messageId?: string;
  model?: string;
  routeMetadata?: ChatRouteMetadata | null;
  createdAt: string;
  senderType?: "self" | "assistant" | "caregiver";
  senderId?: string;
  senderName?: string;
};

export type ChipTemplate = {
  id: string;
  label: string;
  text: string;
  requiresSymptom?: boolean;
  requiresHistory?: boolean;
  onlyWhenNoHistory?: boolean;
  requiresProfile?: boolean;
  requiresRoutine?: boolean;
};

export type MessageFeedbackEntry = {
  message_id: string;
  rating?: "up" | "down" | null;
  feedback_text?: string | null;
  model_version?: string | null;
  response_metadata?: Record<string, unknown> | null;
};

export type ConversationMessage = {
  id: string;
  role: string;
  content: string;
  created_at: string;
  user_id?: string | null;
  sender_first_name?: string | null;
  sender_last_name?: string | null;
  sender_email?: string | null;
};
