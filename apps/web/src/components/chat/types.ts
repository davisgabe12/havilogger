export type ChatEntry = {
  id: string;
  role: "user" | "havi";
  text: string;
  messageId?: string;
  createdAt: string;
  senderType?: "self" | "assistant" | "caregiver";
  senderName?: string;
};
