export type ChatEntry = {
  id: string;
  role: "user" | "havi";
  text: string;
  messageId?: string;
  createdAt: string;
  senderType?: "self" | "assistant" | "caregiver";
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
};

export type ConversationMessage = {
  id: string;
  role: string;
  content: string;
  created_at: string;
};
