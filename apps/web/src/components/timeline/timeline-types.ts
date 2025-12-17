export type TimelineEventType = "sleep" | "bottle" | "diaper" | "activity" | "growth";

export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  title: string;
  detail?: string;
  amountLabel?: string;
  start: string;
  end?: string;

  hasNote?: boolean;
  isCustom?: boolean;
  source?: "chat" | "chip" | "manual" | "import";
  originMessageId?: string;
}

export type TimelineFilterId = "all" | TimelineEventType;

export interface TimelineFilter {
  id: TimelineFilterId;
  label: string;
}
