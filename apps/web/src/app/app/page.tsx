"use client";

import type { Metadata } from "next";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Menu } from "lucide-react";

import { TimelinePanel } from "@/components/timeline/timeline-panel";
import { DictateButton, ShareButton } from "@/components/ui/action-buttons";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { type FeedbackRating } from "@/components/chat/message-feedback";
import { MessageBubble, CHAT_BODY_TEXT } from "@/components/chat/message-bubble";
import type {
  ChatEntry,
  ChipTemplate,
  ConversationMessage,
  MessageFeedbackEntry,
} from "@/components/chat/types";
import { chipLibrary } from "@/components/chat/chips";
import { buildHaviModelRequest } from "@/lib/havi-model-request";
import { supabase } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useFamilyGuard } from "@/lib/guards/use-family-guard";
import type { KnowledgeReviewItem } from "@/types/knowledge";

type ActionMetadata = {
  amount_value?: number | null;
  amount_unit?: string | null;
  substance?: string | null;
  measurement_type?: string | null;
  measurement_unit?: string | null;
  duration_minutes?: number | null;
  outcome?: string | null;
  sleep_type?: string | null;
  sleep_start_mood?: string | null;
  sleep_end_mood?: string | null;
  sleep_location?: string | null;
  sleep_method?: string | null;
  extra?: Record<string, string | number | boolean>;
};

type Action = {
  action_type: string;
  timestamp: string;
  note?: string | null;
  metadata: ActionMetadata;
  is_core_action: boolean;
  custom_action_label?: string | null;
};

type HomeEvent = {
  id: string;
  type: "sleep" | "bottle" | "diaper" | "activity" | "growth";
  title: string;
  detail?: string;
  amountLabel?: string;
  start: string;
  end?: string;
  originMessageId?: string;
};

type HomeApiEvent = {
  id: string;
  child_id: string;
  type: string;
  title: string;
  detail?: string;
  amount_label?: string;
  start: string;
  end?: string;
  origin_message_id?: string;
};

type ConversationSession = {
  id: string;
  title: string;
  last_message_at: string;
};

type ChildProfile = {
  id: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  birth_date?: string | null;
  due_date?: string | null;
  gender?: string | null;
  birth_weight?: number | string | null;
  birth_weight_unit?: string | null;
  latest_weight?: number | string | null;
  latest_weight_date?: string | null;
  timezone?: string | null;
  routine_eligible?: boolean | null;
};

type InferenceCard = {
  id: string;
  inference_type: string;
  payload: Record<string, unknown>;
  confidence: number;
  created_at: string;
};

type TaskItem = {
  id: string;
  title: string;
  status: "open" | "done";
  due_at?: string | null;
  remind_at?: string | null;
  last_reminded_at?: string | null;
  snooze_count?: number | null;
  created_at: string;
  user_id?: string | null;
  child_id?: string | null;
  created_by_user_id?: string | null;
  assigned_to_user_id?: string | null;
  assigned_to_name?: string | null;
};

const filterTasksByAssignee = (
  tasks: TaskItem[],
  filter: "all" | "me" | "others",
  currentUserId: string | null,
): TaskItem[] => {
  if (!currentUserId || filter === "all") {
    return tasks;
  }
  if (filter === "me") {
    return tasks.filter(
      (task) => task.assigned_to_user_id === currentUserId,
    );
  }
  return tasks.filter(
    (task) =>
      task.assigned_to_user_id != null &&
      task.assigned_to_user_id !== currentUserId,
  );
};

const buildTaskMeta = (
  task: TaskItem,
  currentUserId: string | null,
  currentUserName: string,
): string => {
  const parts: string[] = [];
  try {
    const created = new Date(task.created_at);
    if (!Number.isNaN(created.getTime())) {
      parts.push(
        `Added ${created.toLocaleDateString([], {
          month: "short",
          day: "numeric",
        })}`,
      );
    }
  } catch {
    // ignore parse errors
  }
  if (currentUserId && currentUserName && task.created_by_user_id === currentUserId) {
    parts.push(`Created by ${currentUserName} (Me)`);
  }
  return parts.join(" • ");
};

const getTasksTabEmptyMessage = (
  view: "all" | "open" | "scheduled" | "unscheduled" | "completed",
): string => {
  if (view === "all") {
    return "You’re all caught up. Add a task to get started.";
  }
  if (view === "open") {
    return "You’re all caught up. Add a task when something comes up.";
  }
  if (view === "scheduled") {
    return "All clear on scheduled tasks. Add a due date to plan ahead.";
  }
  if (view === "unscheduled") {
    return "All set here. Add a due date when you’re ready.";
  }
  return "Completed tasks will show up here once you check one off.";
};

const getAssigneeEmptyMessage = (filter: "all" | "me" | "others"): string => {
  if (filter === "me") {
    return "You’re all caught up. Assign something to yourself if needed.";
  }
  if (filter === "others") {
    return "All clear. Assign something to someone else when you need to delegate.";
  }
  return getTasksTabEmptyMessage("all");
};

const sortTasksByDueAndCreated = (tasks: TaskItem[]): TaskItem[] => {
  return [...tasks].sort((a, b) => {
    const aDue = a.due_at ? new Date(a.due_at).getTime() : Number.POSITIVE_INFINITY;
    const bDue = b.due_at ? new Date(b.due_at).getTime() : Number.POSITIVE_INFINITY;
    if (aDue !== bDue) {
      return aDue - bDue;
    }
    const aCreated = new Date(a.created_at).getTime();
    const bCreated = new Date(b.created_at).getTime();
    if (Number.isNaN(aCreated) || Number.isNaN(bCreated)) {
      return 0;
    }
    // Newest first when due_at is equal
    return bCreated - aCreated;
  });
};

type ApiResponse = {
  actions: Action[];
  assistant_message?: string;
  raw_message: string;
  model: string;
  latency_ms: number;
  question_category?: string;
  conversation_id?: string;
  user_message_id?: string;
  assistant_message_id?: string;
  intent?: string;
};

const metadata: Metadata = {
  title: "Havi | Another brain for your family",
  description:
    "Havi helps parents carry the mental load with calm, conversational support, shared memory, and Runway foresight.",
};

const featureHighlights = [
  {
    title: "Conversation-first support",
    description:
      "Ask questions by chat or voice and get calm guidance fast, without digging through tabs or threads.",
  },
  {
    title: "Runway: a clear path ahead",
    description:
      "See what’s coming next and reduce guesswork with a simple, shared view of family growth.",
  },
  {
    title: "Shared family memory",
    description:
      "Keep moments, decisions, and context in one place so partners and caregivers stay aligned.",
  },
];

const whyHavi = [
  {
    title: "Too much to remember",
    body: "Havi keeps moments, notes, and questions in one calm place, so nothing valuable disappears.",
  },
  {
    title: "Advice everywhere. Clarity nowhere.",
    body: "Havi helps you make sense of guidance in the context of your child and your situation.",
  },
  {
    title: "Less logging. More living.",
    body: "Capture information naturally through conversation and quick moments—then let Havi make it useful later.",
  },
];

const quotes = [
  "I’m not failing—I’m overloaded. Havi makes it feel manageable.",
  "It’s like having another brain that actually remembers what happened.",
  "We stopped arguing about who said what. We finally feel aligned.",
  "At 3 a.m., I don’t need a blog post. I need a clear next step.",
];
type ConversationState =
  | "idle"
  | "sending"
  | "thinking_short"
  | "thinking_rich"
  | "streaming_response"
  | "error_soft_retry"
  | "error_hard"
  | "network_offline"
  | "rate_limited";

type LoadingCategory = "generic" | "sleep" | "routine" | "health";

type Panel =
  | "havi"
  | "home"
  | "timeline"
  | "tasks"
  | "history"
  | "knowledge"
  | "integrations"
  | "settings";

type SpeechRecognitionEventLike = {
  results: Array<{ 0: { transcript: string } }>;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionGlobal = {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

const LOADING_MESSAGES: Record<
  LoadingCategory,
  { short: string; rich: string[] }
> = {
  generic: {
    short: "HAVI is on it…",
    rich: [
      "Reviewing what you just shared.",
      "Pulling a clear, calm answer together for you.",
    ],
  },
  sleep: {
    short: "HAVI is on it…",
    rich: [
      "Reviewing recent naps, wake windows, and bedtime notes.",
      "Lining up what’s typical for babies this age and sleep patterns like yours.",
    ],
  },
  routine: {
    short: "HAVI is on it…",
    rich: [
      "Checking recent feeds, diapers, and patterns to see what stands out.",
      "Reviewing recent days to spot any trends.",
    ],
  },
  health: {
    short: "HAVI is on it…",
    rich: [
      "Comparing what you shared with common patterns for babies this age.",
      "Organizing what might be normal, what to watch, and when to call your doctor.",
    ],
  },
};

export const dynamic = "force-dynamic";

const CHIP_CATEGORY_HINTS: Record<string, LoadingCategory> = {
  milestones_today: "sleep",
  week_intro: "sleep",
  routine_setup: "routine",
  symptom_followup: "health",
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";
const DEFAULT_TIMEZONE = "America/Los_Angeles";
const FIRST_CHAT_SEEN_KEY = "havi_first_chat_seen";
const HOME_EXPECTATION_WEEK_KEY = "havi_home_expected_week";
const ACTIVE_CHILD_KEY = "havi_active_child_id";

const newId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const isValidChildId = (value?: string | null): value is string =>
  typeof value === "string" && value.trim().length > 0;

const AutoResizeTextarea = ({
  className,
  inputRef,
  ...props
}: React.ComponentProps<typeof Textarea> & {
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
}) => {
  const fallbackRef = useRef<HTMLTextAreaElement | null>(null);
  const ref = inputRef ?? fallbackRef;
  const resize = () => {
    if (!ref.current) return;
    const maxHeight = 160; // px, cap growth to keep composer stable
    ref.current.style.height = "0px";
    const nextHeight = Math.min(ref.current.scrollHeight, maxHeight);
    ref.current.style.height = `${nextHeight}px`;
    ref.current.style.overflowY =
      ref.current.scrollHeight > maxHeight ? "auto" : "hidden";
  };

  useEffect(() => {
    resize();
  }, [props.value]);

  return (
    <Textarea
      ref={ref}
      {...props}
      className={cn(
        "min-h-[52px] max-h-40 resize-none bg-card placeholder:text-muted-foreground placeholder:opacity-80",
        CHAT_BODY_TEXT,
        className,
      )}
      style={{ font: "inherit" }}
    />
  );
};

const InlineSpinner = () => (
  <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
);

const NAV_ITEMS: Array<{ id: Panel; label: string }> = [
  { id: "home", label: "Home" },
  { id: "havi", label: "Chat" },
  { id: "timeline", label: "Timeline" },
  { id: "tasks", label: "Tasks" },
  { id: "history", label: "History" },
  { id: "knowledge", label: "Memory" },
  { id: "integrations", label: "Integrations" },
  { id: "settings", label: "Settings" },
];

const GuardShell = ({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) => (
  <div className="min-h-screen bg-background text-foreground">
    <section className="border-b border-border/60">
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-6 py-16">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          {children ? <CardContent>{children}</CardContent> : null}
        </Card>
      </div>
    </section>
  </div>
);

const GuardLoading = () => (
  <GuardShell
    title="Getting your family ready"
    description="Checking your account and family context."
  >
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <InlineSpinner />
      <span>Just a moment…</span>
    </div>
  </GuardShell>
);

const GuardError = ({ message }: { message: string }) => (
  <GuardShell
    title="We hit a snag"
    description="We couldn’t verify your family context."
  >
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button type="button" onClick={() => window.location.reload()}>
        Try again
      </Button>
    </div>
  </GuardShell>
);

export default function Home() {
  const router = useRouter();
  const guard = useFamilyGuard();
  const guardReady = guard.status === "ready";
  const [message, setMessage] = useState("");
  const [chatEntries, setChatEntries] = useState<ChatEntry[]>([]);
  const [activePanel, setActivePanel] = useState<Panel>("havi");
  const [navOpen, setNavOpen] = useState(false);
  const [conversationState, setConversationState] =
    useState<ConversationState>("idle");
  const [conversationIdParam, setConversationIdParam] = useState<string | null>(
    null,
  );
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);
  const [scrollViewport, setScrollViewport] = useState<HTMLDivElement | null>(
    null,
  );
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const [primaryChildId, setPrimaryChildId] = useState<string>("");
  const [activeChildId, setActiveChildId] = useState<string | null>(null);
  const [activeChildName, setActiveChildName] = useState<string>("");
  const [childrenList, setChildrenList] = useState<ChildProfile[]>([]);
  const [newChildOpen, setNewChildOpen] = useState(false);
  const [newChildName, setNewChildName] = useState("");
  const [newChildBirthDate, setNewChildBirthDate] = useState("");
  const [newChildDueDate, setNewChildDueDate] = useState("");
  const [newChildGender, setNewChildGender] = useState("");
  const [newChildBirthWeight, setNewChildBirthWeight] = useState("");
  const [newChildBirthWeightUnit, setNewChildBirthWeightUnit] = useState("oz");
  const [newChildTimezone, setNewChildTimezone] = useState(DEFAULT_TIMEZONE);
  const [newChildError, setNewChildError] = useState<string | null>(null);
  const [newChildSaving, setNewChildSaving] = useState(false);
  const [lastIntent, setLastIntent] = useState<string | null>(null);
  const [focusedMessageId, setFocusedMessageId] = useState<string | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<
    string | null
  >(null);
  const [pinnedTimestampId, setPinnedTimestampId] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState(
    LOADING_MESSAGES.generic.short,
  );
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thinkingShortStartRef = useRef<number | null>(null);
  const thinkingRichStartRef = useRef<number | null>(null);
  const retryCountRef = useRef(0);
  const activeConversationIdRef = useRef<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messageFeedbackById, setMessageFeedbackById] = useState<
    Record<string, { rating: FeedbackRating; comment: string }>
  >({});
  const [questionCategory, setQuestionCategory] =
    useState<LoadingCategory>("generic");
  const [pendingCategoryHint, setPendingCategoryHint] =
    useState<LoadingCategory | null>(null);
  const [networkOffline, setNetworkOffline] = useState<boolean>(
    typeof navigator !== "undefined" ? !navigator.onLine : false,
  );
  const [rateLimitedMessage, setRateLimitedMessage] =
    useState<string | null>(null);
  const [hardErrorMessage, setHardErrorMessage] = useState<string | null>(null);
  const [lastMessageDraft, setLastMessageDraft] = useState("");
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const shareTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [memoryShareMessage, setMemoryShareMessage] = useState<string | null>(
    null,
  );
  const [memoryShareLink, setMemoryShareLink] = useState<string | null>(null);
  const memoryShareTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const syncConversationId = () => {
      const params = new URLSearchParams(window.location.search);
      const raw = params.get("conversationId");
      if (!raw) {
        setConversationIdParam(null);
        return;
      }
      const trimmed = raw.trim();
      setConversationIdParam(trimmed.length > 0 ? trimmed : null);
    };

    syncConversationId();
    const handlePopState = () => {
      syncConversationId();
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  const knowledgeToastTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  const [sessions, setSessions] = useState<ConversationSession[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [hasAnyLog, setHasAnyLog] = useState(false);
  const [timelineRefreshKey, setTimelineRefreshKey] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  const hasUserMessage = useMemo(
    () =>
      chatEntries.some(
        (entry) =>
          entry.role === "user" || entry.senderType === "self",
      ),
    [chatEntries],
  );
  const shareEnabled = hasUserMessage || hasAnyLog;

  const [inferenceCards, setInferenceCards] = useState<InferenceCard[]>([]);
  const [inferenceLoading, setInferenceLoading] = useState(false);
  const [inferenceError, setInferenceError] = useState<string | null>(null);
  const [savedMemories, setSavedMemories] = useState<KnowledgeReviewItem[]>([]);
  const [savedMemoriesLoading, setSavedMemoriesLoading] = useState(false);
  const [savedMemoriesError, setSavedMemoriesError] = useState<string | null>(
    null,
  );
  const [knowledgeToast, setKnowledgeToast] = useState<string | null>(null);
  const [expandedInferences, setExpandedInferences] = useState<Set<string>>(
    new Set(),
  );
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceBaseRef = useRef<string>("");
  const voiceTranscriptRef = useRef<string>("");
  const [voiceState, setVoiceState] = useState<
    "idle" | "recording" | "transcribing"
  >("idle");
  const [voiceSeconds, setVoiceSeconds] = useState(0);
  const voiceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showCaregiverForm, setShowCaregiverForm] = useState(false);
  const [showChildForm, setShowChildForm] = useState(false);
  const [caregiverSnapshot, setCaregiverSnapshot] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    email: "",
    relationship: "",
  });
  const [childSnapshot, setChildSnapshot] = useState({
    first_name: "",
    last_name: "",
    birth_date: "",
    due_date: "",
    gender: "",
    birth_weight: "",
    birth_weight_unit: "oz",
    latest_weight: "",
    latest_weight_date: "",
    timezone: DEFAULT_TIMEZONE,
  });
  const [birthStatus, setBirthStatus] = useState<"born" | "expected">("born");
  const [hasUnsaved, setHasUnsaved] = useState(false);

  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [taskCreateError, setTaskCreateError] = useState<string | null>(null);
  const [taskCreating, setTaskCreating] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [tasksView, setTasksView] = useState<
    "all" | "open" | "scheduled" | "unscheduled" | "completed"
  >("open");
  const [tasksAssigneeFilter, setTasksAssigneeFilter] = useState<
    "all" | "me" | "others"
  >("all");
  const [dueReminders, setDueReminders] = useState<TaskItem[]>([]);
  const [remindersLoading, setRemindersLoading] = useState(false);
  const [remindersError, setRemindersError] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [taskDetailTitle, setTaskDetailTitle] = useState("");
  const [taskDetailDueDate, setTaskDetailDueDate] = useState<string>("");
  const [taskDetailDueTime, setTaskDetailDueTime] = useState<string>("");
  const [taskSaving, setTaskSaving] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  const [relationship, setRelationship] = useState("");
  const [caregiverFirstName, setCaregiverFirstName] = useState("");
  const [caregiverLastName, setCaregiverLastName] = useState("");
  const [caregiverPhone, setCaregiverPhone] = useState("");
  const [caregiverEmail, setCaregiverEmail] = useState("");
  const [childFirstName, setChildFirstName] = useState("");
  const [childLastName, setChildLastName] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string>("");
  const [chatTitle, setChatTitle] = useState<string | null>(null);
  const statusFilteredTasks = useMemo(() => {
    const base = tasks;
    if (tasksView === "all") {
      return sortTasksByDueAndCreated(base);
    }
    if (tasksView === "completed") {
      return sortTasksByDueAndCreated(
        base.filter((task) => task.status === "done"),
      );
    }
    if (tasksView === "scheduled") {
      return sortTasksByDueAndCreated(
        base.filter(
          (task) => task.status !== "done" && task.due_at != null,
        ),
      );
    }
    if (tasksView === "unscheduled") {
      return sortTasksByDueAndCreated(
        base.filter(
          (task) => task.status !== "done" && task.due_at == null,
        ),
      );
    }
    // "open"
    return sortTasksByDueAndCreated(
      base.filter((task) => task.status !== "done"),
    );
  }, [tasks, tasksView]);
  const filteredTasks = useMemo(
    () =>
      filterTasksByAssignee(statusFilteredTasks, tasksAssigneeFilter, currentUserId),
    [statusFilteredTasks, tasksAssigneeFilter, currentUserId],
  );
  const [childDob, setChildDob] = useState("");
  const [childDueDate, setChildDueDate] = useState("");
  const [childGender, setChildGender] = useState("");
  const [childBirthWeight, setChildBirthWeight] = useState("");
  const [childBirthWeightUnit, setChildBirthWeightUnit] = useState("oz");
  const [childLatestWeight, setChildLatestWeight] = useState("");
  const [childLatestWeightDate, setChildLatestWeightDate] = useState("");
  const [childTimezone, setChildTimezone] = useState(DEFAULT_TIMEZONE);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null);
  const settingsSuccessTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);
  const [chipTemplates, setChipTemplates] = useState<ChipTemplate[]>(
    chipLibrary.slice(0, 6),
  );
  const [profilePromptCount, setProfilePromptCount] = useState(0);
  const [routineEligible, setRoutineEligible] = useState(false);
  const isComposerLocked = [
    "sending",
    "thinking_short",
    "thinking_rich",
    "streaming_response",
  ].includes(conversationState);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("Parent");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [recentEvents, setRecentEvents] = useState<HomeEvent[]>([]);
  const [recentEventsLoading, setRecentEventsLoading] = useState(false);
  const [recentEventsError, setRecentEventsError] = useState<string | null>(null);
  const [showComingUp, setShowComingUp] = useState(false);

  const agentCards = useMemo(
    () => [
      {
        id: "remind-agent",
        name: "Remind Agent",
        icon: "⏰",
        shortDescription: "Set lightweight reminders that stay visible.",
        longDescription:
          "Capture quick reminders and keep them handy across chat and daily routines.",
        createdBy: "HAVI",
        createdAt: "2024-08-01",
        usedXTimes: 128,
        usedByYUsers: 64,
        savedPrompt:
          "Remind Agent: Capture a quick reminder for me—make it concise and actionable.",
        statusBadge: "Available",
      },
      {
        id: "routine-wiz",
        name: "Routine Wiz",
        icon: "🪄",
        shortDescription: "Draft calm, repeatable routines.",
        longDescription:
          "Suggest wake windows and nap routines tuned to recent days and gentle rhythms.",
        createdBy: "HAVI",
        createdAt: "2024-08-10",
        usedXTimes: 0,
        usedByYUsers: 0,
        savedPrompt:
          "Routine Wiz: Build a simple routine based on the last 3 days of logs.",
        statusBadge: "Coming soon",
      },
      {
        id: "behavior-coach",
        name: "Behavior Coach",
        icon: "🧠",
        shortDescription: "Gentle scripts and guidance.",
        longDescription:
          "Offer calm, age-appropriate responses for tricky moments and tantrums.",
        createdBy: "HAVI",
        createdAt: "2024-08-15",
        usedXTimes: 0,
        usedByYUsers: 0,
        savedPrompt:
          "Behavior Coach: Give a short script to defuse a fussy moment.",
        statusBadge: "Coming soon",
      },
      {
        id: "travel-guide",
        name: "Travel Guide",
        icon: "✈️",
        shortDescription: "Prep lists and travel routines.",
        longDescription:
          "Assemble packing lists and travel-day plans matched to your child’s needs.",
        createdBy: "HAVI",
        createdAt: "2024-08-20",
        usedXTimes: 0,
        usedByYUsers: 0,
        savedPrompt:
          "Travel Guide: Draft a packing list and travel day plan for a short flight.",
        statusBadge: "Coming soon",
      },
      {
        id: "activity-ace",
        name: "Activity Ace",
        icon: "🎨",
        shortDescription: "Bite-sized play ideas.",
        longDescription:
          "Surface quick activities based on energy, space, and what you have on hand.",
        createdBy: "HAVI",
        createdAt: "2024-08-25",
        usedXTimes: 0,
        usedByYUsers: 0,
        savedPrompt:
          "Activity Ace: Suggest a 10-minute activity with common household items.",
        statusBadge: "Coming soon",
      },
      {
        id: "entertainer-eddy",
        name: "Entertainer Eddy",
        icon: "🎭",
        shortDescription: "Distraction and calm-down ideas.",
        longDescription:
          "Suggest soothing distractions for transitions or fussy moments.",
        createdBy: "HAVI",
        createdAt: "2024-08-28",
        usedXTimes: 0,
        usedByYUsers: 0,
        savedPrompt:
          "Entertainer Eddy: Give a playful distraction for a tough diaper change.",
        statusBadge: "Coming soon",
      },
    ],
    [],
  );

  const inferenceMetaFor = useCallback(
    (inferenceType: string, payload: Record<string, unknown>) => {
      const lower = inferenceType?.toLowerCase?.() ?? "";
      const name = (value?: unknown) =>
        typeof value === "string" ? value : "";
      const summaryCandidate =
        name((payload as Record<string, unknown>).summary) ||
        name((payload as Record<string, unknown>).note) ||
        name((payload as Record<string, unknown>).text) ||
        name((payload as Record<string, unknown>).description);

      if (summaryCandidate) {
        return { title: "Memory suggestion", summary: summaryCandidate };
      }

      if (lower.includes("sibling")) {
        const child =
          name((payload as Record<string, unknown>).child_name) || "Child";
        const sibling =
          name((payload as Record<string, unknown>).sibling_name) || "Sibling";
        const relation =
          name((payload as Record<string, unknown>).relationship) || "sibling";
        return {
          title: "Sibling link",
          summary: `${sibling} is ${child}’s ${relation}.`,
        };
      }

      if (lower.includes("routine")) {
        const prompt =
          name((payload as Record<string, unknown>).prompt) ||
          "A routine prompt is ready.";
        return { title: "Routine cue", summary: prompt };
      }

      if (
        lower.includes("feeding") ||
        lower.includes("bottle") ||
        lower.includes("breast")
      ) {
        const method =
          name((payload as Record<string, unknown>).method) || "a feeding pattern";
        return { title: "Feeding note", summary: `Noticed ${method}.` };
      }

      if (lower.includes("allergy")) {
        const item =
          name((payload as Record<string, unknown>).item) || "something new";
        return {
          title: "Allergy watch",
          summary: `Possible sensitivity to ${item}.`,
        };
      }

      if (lower.includes("sleep")) {
        const hint =
          name((payload as Record<string, unknown>).note) ||
          "Sleep pattern insight.";
        return { title: "Sleep note", summary: hint };
      }

      if (lower.includes("med") || lower.includes("medicine")) {
        const med =
          name((payload as Record<string, unknown>).name) ||
          "a medication update";
        return { title: "Medication note", summary: med };
      }

      return { title: "New memory", summary: "Review details below." };
    },
    [],
  );

  const memorySummaryFor = useCallback((memory: KnowledgeReviewItem) => {
    if (memory.summary) return memory.summary;
    const payload = memory.payload ?? {};
    const candidate =
      (typeof payload.summary === "string" && payload.summary) ||
      (typeof payload.note === "string" && payload.note) ||
      (typeof payload.text === "string" && payload.text) ||
      (typeof payload.description === "string" && payload.description);
    if (candidate) return candidate;
    return memory.key.replace(/_/g, " ");
  }, []);

  const timelineChildOptions = useMemo(
    () =>
      childrenList.map((child) => ({
        id: child.id,
        name: child.first_name || child.name || "your child",
      })),
    [childrenList],
  );

  useEffect(() => {
    setActiveChildName(childFirstName || "");
  }, [childFirstName]);
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    setChatEntries((prev) => {
      if (prev.length > 0) {
        return prev;
      }
      const seen = window.localStorage.getItem(FIRST_CHAT_SEEN_KEY);
      if (seen === "1") {
        return prev;
      }
      const now = new Date().toISOString();
      window.localStorage.setItem(FIRST_CHAT_SEEN_KEY, "1");
      return [
        {
          id: newId(),
          role: "havi",
          text:
            "Hi — I’m HAVI.\n" +
            "Ask a question, log a moment, or track anything about your family’s day.\n" +
            "I’ll help you understand what’s normal and remember what matters.",
          createdAt: now,
          senderType: "assistant",
          senderName: "HAVI",
        },
      ];
    });
  }, []);

  useEffect(() => {
    if (!navOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNavOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [navOpen]);

  const fillTemplate = useCallback(
    (template: string) => {
      const childName = childFirstName?.trim() || "your child";
      const caregiverName =
        caregiverFirstName?.trim() || relationship || "caregiver";
      const weekNumber =
        computeWeekFromDob(childDob) ?? computeWeekFromDob(childDueDate) ?? 1;
      return template
        .replace(/\{child\}/gi, childName)
        .replace(/\{caregiver\}/gi, caregiverName)
        .replace(/\{week\}/gi, weekNumber.toString());
    },
    [caregiverFirstName, childFirstName, childDob, childDueDate, relationship],
  );

  const pickLoadingCopy = useCallback(
    (category: LoadingCategory, richness: "short" | "rich") => {
      const bucket = LOADING_MESSAGES[category] ?? LOADING_MESSAGES.generic;
      if (richness === "short") {
        return bucket.short;
      }
      const pool = bucket.rich.length
        ? bucket.rich
        : LOADING_MESSAGES.generic.rich;
      return pool[Math.floor(Math.random() * pool.length)];
    },
    [],
  );

  const getClientTimezone = useCallback((): string | undefined => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return undefined;
    }
  }, []);

  const getTimezoneLabel = useCallback((value: string) => {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: value,
        timeZoneName: "short",
      }).formatToParts(new Date());
      const zone = parts.find((part) => part.type === "timeZoneName")?.value;
      return zone || value;
    } catch {
      return value;
    }
  }, []);

  const timezoneLabel = useMemo(
    () => getTimezoneLabel(childTimezone || DEFAULT_TIMEZONE),
    [childTimezone, getTimezoneLabel],
  );

  const computeMissingExpectationFields = useCallback(() => {
    const missing: string[] = [];
    const hasBirthDate = Boolean(childDob);
    const hasDueDate = Boolean(childDueDate);
    if (!hasBirthDate && !hasDueDate) {
      missing.push("birth date or due date");
    }
    if (!childGender) {
      missing.push("gender");
    }
    if (hasBirthDate && !childBirthWeight) {
      missing.push("birth weight");
    }
    return missing;
  }, [
    childBirthWeight,
    childDob,
    childDueDate,
    childGender,
  ]);

  const missingProfileFields = useMemo(
    () => computeMissingExpectationFields(),
    [computeMissingExpectationFields],
  );
  const needsCaregiverSetup = !caregiverFirstName && !caregiverLastName && !caregiverEmail;
  const showSignupPrompt =
    missingProfileFields.length > 0 || needsCaregiverSetup;
  const hardErrorLower = hardErrorMessage?.toLowerCase() ?? "";
  const showNewChatButton = hardErrorLower.includes("start a new chat");
  const showSignupButton =
    showSignupPrompt &&
    (hardErrorLower.includes("profile") ||
      hardErrorLower.includes("settings") ||
      hardErrorLower.includes("child") ||
      hardErrorLower.includes("select an active child"));
  const homeChildName = childFirstName?.trim() || "your child";
  const homeGreeting = buildTimeGreeting();
  const homeAgeLabel = formatHomeAgeLabel(childDob, childDueDate);
  const comingUpWeek =
    computeWeekFromDob(childDob) ?? computeWeekFromDob(childDueDate);
  const recentWindowEvents = useMemo(
    () => filterEventsByWindow(recentEvents, 72),
    [recentEvents],
  );
  const recentLastEvent = recentWindowEvents[0] ?? null;
  const recentTypeCount = useMemo(
    () => new Set(recentWindowEvents.map((event) => event.type)).size,
    [recentWindowEvents],
  );
  const showLastTile = recentWindowEvents.length > 0;
  const showChapterTile =
    showLastTile && (recentWindowEvents.length >= 5 || recentTypeCount >= 2);
  const chapterSummary = showChapterTile
    ? buildChapterSummary(recentWindowEvents)
    : "";
  const lastSummary = recentLastEvent ? buildLastSummary(recentLastEvent) : "";
  const chapterSeed = showChapterTile
    ? buildChapterSeedMessage(recentWindowEvents, homeChildName)
    : "";
  const lastSeed = recentLastEvent
    ? buildLastSeedMessage(recentLastEvent, homeChildName)
    : "";
  const comingUpSeed =
    comingUpWeek && showComingUp
      ? buildComingUpSeedMessage(comingUpWeek, homeChildName)
      : "";

  const startLoadingTimer = useCallback(
    (category: LoadingCategory) => {
      if (loadingTimerRef.current) {
        clearTimeout(loadingTimerRef.current);
      }
      thinkingShortStartRef.current = performance.now();
      thinkingRichStartRef.current = null;
      setConversationState("thinking_short");
      setLoadingMessage(pickLoadingCopy(category, "short"));
      loadingTimerRef.current = setTimeout(() => {
        setConversationState((state) =>
          state === "thinking_short" ? "thinking_rich" : state,
        );
        setLoadingMessage(pickLoadingCopy(category, "rich"));
        thinkingRichStartRef.current = performance.now();
      }, 2000);
    },
    [pickLoadingCopy],
  );

  const clearLoadingTimers = useCallback(() => {
    if (loadingTimerRef.current) {
      clearTimeout(loadingTimerRef.current);
      loadingTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const weekNumber =
      computeWeekFromDob(childDob) ?? computeWeekFromDob(childDueDate);
    if (!weekNumber) {
      setShowComingUp(false);
      return;
    }
    const stored = window.localStorage.getItem(HOME_EXPECTATION_WEEK_KEY);
    if (stored !== String(weekNumber)) {
      setShowComingUp(true);
    } else {
      setShowComingUp(false);
    }
  }, [childDob, childDueDate, hydrated]);

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  const assistantMessageIds = useMemo(() => {
    const ids = new Set<string>();
    chatEntries.forEach((entry) => {
      const senderType =
        entry.senderType ?? (entry.role === "havi" ? "assistant" : "self");
      if (senderType === "assistant" && entry.messageId) {
        ids.add(entry.messageId);
      }
    });
    return Array.from(ids);
  }, [chatEntries]);

  useEffect(() => {
    setMessageFeedbackById({});
  }, [activeConversationId]);

  useEffect(() => {
    if (!activeConversationId || assistantMessageIds.length === 0) return;
    const controller = new AbortController();
    const params = new URLSearchParams({
      conversation_id: String(activeConversationId),
      message_ids: assistantMessageIds.join(","),
    });
    apiFetch(`${API_BASE_URL}/api/v1/messages/feedback?${params.toString()}`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error("Unable to load feedback");
        return res.json();
      })
      .then((data: MessageFeedbackEntry[]) => {
        setMessageFeedbackById((prev) => {
          const next = { ...prev };
          data.forEach((item) => {
            if (!item?.message_id) return;
            next[String(item.message_id)] = {
              rating: item.rating ?? null,
              comment: item.feedback_text ?? "",
            };
          });
          return next;
        });
      })
      .catch(() => {});
    return () => controller.abort();
  }, [activeConversationId, assistantMessageIds]);

  const postClientMetrics = useCallback(
    (errorType?: string) => {
      if (thinkingShortStartRef.current == null) {
        return;
      }
      const now = performance.now();
      const shortEnd = thinkingRichStartRef.current ?? now;
      const shortMs = Math.max(
        0,
        Math.round(shortEnd - thinkingShortStartRef.current),
      );
      const richMs =
        thinkingRichStartRef.current != null
          ? Math.max(0, Math.round(now - thinkingRichStartRef.current))
          : undefined;
      thinkingShortStartRef.current = null;
      thinkingRichStartRef.current = null;
      void apiFetch(`${API_BASE_URL}/api/v1/metrics/loading`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          session_id: activeConversationIdRef.current,
          thinking_short_ms: shortMs,
          thinking_rich_ms: richMs,
          error_type: errorType ?? null,
          retry_count: retryCountRef.current,
        }),
      }).catch(() => {
        // Swallow metric errors to avoid impacting the user flow.
      });
    },
    [],
  );

  const updateConversationParam = useCallback(
    (conversationId: string | null) => {
      if (typeof window === "undefined") return;
      const params = new URLSearchParams(window.location.search);
      if (conversationId) {
        params.set("conversationId", String(conversationId));
      } else {
        params.delete("conversationId");
      }
      const query = params.toString();
      router.replace(query ? `?${query}` : "/app", { scroll: false });
      setConversationIdParam(conversationId);
    },
    [router],
  );

  const loadConversation = useCallback(
    async (conversationId: string) => {
      try {
        setConversationState("idle");
        const [conversationRes, messagesRes] = await Promise.all([
          apiFetch(`${API_BASE_URL}/api/v1/conversations/${conversationId}`),
          apiFetch(
            `${API_BASE_URL}/api/v1/conversations/${conversationId}/messages`,
          ),
        ]);
        if (!conversationRes.ok) throw new Error("Unable to load conversation.");
        if (!messagesRes.ok) throw new Error("Unable to load conversation messages.");
        const conversation: ConversationSession = await conversationRes.json();
        const messages: ConversationMessage[] = await messagesRes.json();
        setActiveConversationId(conversation.id);
        setChatTitle(conversation.title);
        setChatEntries(
          messages.map((msg) => ({
            id: String(msg.id),
            role: msg.role === "assistant" ? "havi" : "user",
            text: msg.content,
            messageId: String(msg.id),
            createdAt: msg.created_at,
            senderType: msg.role === "assistant" ? "assistant" : "self",
            senderName: msg.role === "assistant" ? "HAVI" : caregiverFirstName || "You",
          })),
        );
        setHasAnyLog(messages.length > 0);
      } catch (err) {
        const reason = err instanceof Error ? err.message : "Unable to load conversation.";
        setHistoryError(reason);
      }
    },
    [caregiverFirstName],
  );

  const createConversation = useCallback(
    async (childId: string) => {
      const res = await apiFetch(
        `${API_BASE_URL}/api/v1/conversations?child_id=${encodeURIComponent(childId)}`,
        { method: "POST", childId },
      );
      if (!res.ok) {
        throw new Error("Unable to start a new chat.");
      }
      const conversation: ConversationSession = await res.json();
      return conversation;
    },
    [],
  );

  const refreshConversationTitle = useCallback(async (conversationId: string) => {
    const res = await apiFetch(
      `${API_BASE_URL}/api/v1/conversations/${conversationId}`,
    );
    if (!res.ok) return;
    const conversation: ConversationSession = await res.json();
    setChatTitle(conversation.title);
  }, []);

  const handleSelectConversation = useCallback(
    async (conversationId: string) => {
      updateConversationParam(conversationId);
      await loadConversation(conversationId);
      setMessage("");
      setActivePanel("havi");
      setNavOpen(false);
    },
    [loadConversation, updateConversationParam],
  );

  const renderChipLabel = useCallback(
    (chip: ChipTemplate) => fillTemplate(chip.label),
    [fillTemplate],
  );
  const rotateChips = useCallback(() => {
    const hasSymptomMention = chatEntries
      .slice(-5)
      .some((entry) => /cough|fever|rash|vomit|spit[\s-]?up/i.test(entry.text));
    const hasHistory = hasAnyLog || sessions.length > 0;
    const hasProfileInfo = Boolean(childDob || childDueDate);
    const suppressProfileChips = profilePromptCount >= 2 && !hasProfileInfo;
    const filtered = chipLibrary.filter((chip) => {
      if (chip.requiresSymptom && !hasSymptomMention) return false;
      if (chip.requiresHistory && !hasHistory) return false;
      if (chip.onlyWhenNoHistory && hasHistory) return false;
      if (chip.requiresProfile && suppressProfileChips) return false;
      if (chip.requiresRoutine && !routineEligible) return false;
      return true;
    });
    const selection = filtered.length
      ? filtered.slice(0, 6)
      : chipLibrary.slice(0, 6);
    setChipTemplates(selection);
  }, [
    chatEntries,
    hasAnyLog,
    sessions,
    childDob,
    childDueDate,
    profilePromptCount,
    routineEligible,
  ]);

  const handleScrollViewportRef = useCallback((node: HTMLDivElement | null) => {
    scrollViewportRef.current = node;
    setScrollViewport(node);
  }, []);

  useEffect(() => {
    rotateChips();
  }, [rotateChips]);

  useEffect(() => {
    if (!scrollViewport) return;
    const handleScroll = () => {
      const distanceFromBottom =
        scrollViewport.scrollHeight -
        scrollViewport.scrollTop -
        scrollViewport.clientHeight;
      setAutoScrollEnabled(distanceFromBottom < 80);
    };
    scrollViewport.addEventListener("scroll", handleScroll);
    handleScroll();
    return () => {
      scrollViewport.removeEventListener("scroll", handleScroll);
    };
  }, [scrollViewport]);

  useEffect(() => {
    if (!focusedMessageId) return;
    const target = document.querySelector<HTMLElement>(
      `[data-message-id="${focusedMessageId}"]`,
    );
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedMessageId(focusedMessageId);
    }
    setFocusedMessageId(null);
  }, [focusedMessageId]);

  useEffect(() => {
    if (!highlightedMessageId) return;
    const timer = window.setTimeout(() => setHighlightedMessageId(null), 3000);
    return () => window.clearTimeout(timer);
  }, [highlightedMessageId]);

  useEffect(() => {
    if (!scrollViewport || !autoScrollEnabled) return;
    scrollViewport.scrollTo({
      top: scrollViewport.scrollHeight,
      behavior: "smooth",
    });
  }, [
    autoScrollEnabled,
    chatEntries,
    conversationState,
    loadingMessage,
    scrollViewport,
  ]);

  useEffect(() => {
    const handleOnline = () => {
      setNetworkOffline(false);
      setHardErrorMessage(null);
      setRateLimitedMessage(null);
      setConversationState((state) =>
        state === "network_offline" ? "idle" : state,
      );
    };
    const handleOffline = () => {
      setNetworkOffline(true);
      setConversationState("network_offline");
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (childDob || childDueDate) {
      setProfilePromptCount(0);
    }
  }, [childDob, childDueDate]);

  useEffect(() => {
    return () => {
      clearLoadingTimers();
      thinkingShortStartRef.current = null;
      thinkingRichStartRef.current = null;
    };
  }, [clearLoadingTimers]);

  useEffect(() => {
    return () => {
      if (loadingTimerRef.current) {
        clearTimeout(loadingTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch (err) {
        // ignore
      }
      if (voiceTimerRef.current) {
        clearInterval(voiceTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (shareTimerRef.current) {
        clearTimeout(shareTimerRef.current);
      }
      if (knowledgeToastTimerRef.current) {
        clearTimeout(knowledgeToastTimerRef.current);
      }
      if (voiceTimerRef.current) {
        clearInterval(voiceTimerRef.current);
      }
    };
  }, []);

  const fetchHistory = useCallback(
    async (options?: { silent?: boolean }) => {
      const childId = isValidChildId(activeChildId) ? activeChildId : null;
      if (!childId) {
        if (!options?.silent) {
          setHistoryLoading(false);
          setHistoryError("Select a child to load history.");
        }
        setSessions([]);
        return;
      }
      if (!options?.silent) {
        setHistoryLoading(true);
        setHistoryError(null);
      }
      try {
        const res = await apiFetch(
          `${API_BASE_URL}/api/v1/conversations?child_id=${encodeURIComponent(childId)}`,
          { childId: activeChildId ?? undefined },
        );
        if (!res.ok) throw new Error("Unable to load history");
        const data: ConversationSession[] = await res.json();
        setSessions(data);
        if (data.length > 0) {
          setHasAnyLog(true);
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : "Unknown error";
        if (!options?.silent) {
          setHistoryError(reason);
        }
      } finally {
        if (!options?.silent) {
          setHistoryLoading(false);
        }
      }
    },
    [activeChildId],
  );

  useEffect(() => {
    if (!activeChildId) return;
    activeConversationIdRef.current = null;
    setActiveConversationId(null);
    setChatEntries([]);
    setChatTitle(null);
    fetchHistory({ silent: true });
  }, [activeChildId, fetchHistory]);

  const openSignupPanel = useCallback(() => {
    setActivePanel("settings");
    setNavOpen(false);
    setShowCaregiverForm(true);
    setShowChildForm(true);
  }, []);

  const clearActiveFamilyCookie = useCallback(async () => {
    await fetch("/api/active-family", {
      method: "DELETE",
      credentials: "include",
    });
  }, []);

  const handleSignOut = useCallback(async () => {
    try {
      await clearActiveFamilyCookie();
      await supabase.auth.signOut();
    } finally {
      setActiveChildId(null);
      setPrimaryChildId("");
      setActiveChildName("");
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(ACTIVE_CHILD_KEY);
      }
      router.replace("/auth/sign-in");
    }
  }, [clearActiveFamilyCookie, router]);

  const handleNewChat = useCallback(async () => {
    const childId =
      [activeChildId, primaryChildId].find(isValidChildId) ?? null;
    if (!childId) {
      setHistoryError("Select a child to start a new chat.");
      return;
    }
    try {
      const conversation = await createConversation(childId);
      updateConversationParam(conversation.id);
      activeConversationIdRef.current = conversation.id;
      setActiveConversationId(conversation.id);
      setChatTitle(conversation.title);
      setChatEntries([]);
      setMessage("");
      setActivePanel("havi");
      setNavOpen(false);
      fetchHistory({ silent: true });
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Unable to start a new chat.";
      setHistoryError(reason);
    }
  }, [
    activeChildId,
    createConversation,
    fetchHistory,
    primaryChildId,
    updateConversationParam,
  ]);

  useEffect(() => {
    if (!guardReady) return;
    if (activePanel === "history") {
      fetchHistory();
    }
  }, [activePanel, fetchHistory, guardReady]);

  useEffect(() => {
    if (!guardReady) return;
    fetchHistory({ silent: true });
  }, [fetchHistory, guardReady]);

  useEffect(() => {
    if (!guardReady) return;
    if (conversationIdParam) {
      void loadConversation(conversationIdParam);
    } else {
      setActiveConversationId(null);
      setChatEntries([]);
      setChatTitle(null);
    }
  }, [conversationIdParam, guardReady, loadConversation]);

  const loadInferences = useCallback(async () => {
    const childId = isValidChildId(activeChildId) ? activeChildId : null;
    if (!childId) {
      setInferenceCards([]);
      setInferenceError("Select a child to load insights.");
      setInferenceLoading(false);
      return;
    }
    setInferenceLoading(true);
    setInferenceError(null);
    try {
      const params = new URLSearchParams({
        status: "pending",
        child_id: childId,
      });
      const res = await apiFetch(`${API_BASE_URL}/api/v1/inferences?${params}`, {
        childId: activeChildId ?? undefined,
      });
      if (!res.ok) throw new Error("Unable to load insights");
      const data: InferenceCard[] = await res.json();
      setInferenceCards(data);
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Unknown error";
      setInferenceError(reason);
    } finally {
      setInferenceLoading(false);
    }
  }, [activeChildId]);

  const loadSavedMemories = useCallback(async () => {
    const childId = isValidChildId(activeChildId) ? activeChildId : null;
    if (!childId) {
      setSavedMemories([]);
      setSavedMemoriesError("Select a child to load memories.");
      setSavedMemoriesLoading(false);
      return;
    }
    setSavedMemoriesLoading(true);
    setSavedMemoriesError(null);
    try {
      const params = new URLSearchParams({
        status: "active",
        child_id: childId,
      });
      const res = await apiFetch(`${API_BASE_URL}/api/v1/knowledge?${params}`, {
        childId: activeChildId ?? undefined,
      });
      if (!res.ok) throw new Error("Unable to load saved memories");
      const data: KnowledgeReviewItem[] = await res.json();
      setSavedMemories(data);
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Unknown error";
      setSavedMemoriesError(reason);
    } finally {
      setSavedMemoriesLoading(false);
    }
  }, [activeChildId]);

  useEffect(() => {
    if (!guardReady) return;
    loadInferences();
  }, [guardReady, loadInferences]);

  useEffect(() => {
    if (!guardReady) return;
    loadSavedMemories();
  }, [guardReady, loadSavedMemories]);

  useEffect(() => {
    if (!guardReady) return;
    if (activePanel === "knowledge") {
      loadInferences();
      loadSavedMemories();
    }
  }, [activePanel, guardReady, loadInferences, loadSavedMemories]);

  const loadTasks = useCallback(async () => {
    setTasksLoading(true);
    setTasksError(null);
    try {
      const views: Array<"open" | "scheduled" | "completed"> = [
        "open",
        "scheduled",
        "completed",
      ];
      const byId = new Map<string, TaskItem>();
      for (const view of views) {
        const params = new URLSearchParams({ view });
        if (isValidChildId(activeChildId)) {
          params.append("child_id", activeChildId);
        }
        const res = await apiFetch(`${API_BASE_URL}/api/v1/tasks?${params}`, {
          childId: activeChildId ?? undefined,
        });
        if (!res.ok) throw new Error("Unable to load tasks");
        const data: TaskItem[] = await res.json();
        for (const task of data) {
          byId.set(task.id, task);
        }
      }
      setTasks(Array.from(byId.values()));
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Unknown error";
      setTasksError(reason);
      setTasks([]);
    } finally {
      setTasksLoading(false);
    }
  }, [activeChildId]);

  const loadDueReminders = useCallback(async () => {
    setRemindersLoading(true);
    setRemindersError(null);
    try {
      const params = new URLSearchParams();
      if (isValidChildId(activeChildId)) {
        params.append("child_id", activeChildId);
      }
      const res = await apiFetch(
        `${API_BASE_URL}/api/v1/reminders/due?${params}`,
        { childId: activeChildId ?? undefined },
      );
      if (!res.ok) throw new Error("Unable to load reminders");
      const data: TaskItem[] = await res.json();
      setDueReminders(data);
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Unknown error";
      setRemindersError(reason);
      setDueReminders([]);
    } finally {
      setRemindersLoading(false);
    }
  }, [activeChildId]);

  const handleCreateTask = useCallback(
    async (event?: React.FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      const title = newTaskTitle.trim();
      if (!title) return;
      const childId =
        [activeChildId, primaryChildId].find(isValidChildId) ?? null;
      setTaskCreating(true);
      setTaskCreateError(null);
      try {
        const res = await apiFetch(`${API_BASE_URL}/api/v1/tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          childId: childId ?? undefined,
          body: JSON.stringify({
            title,
            child_id: childId,
          }),
        });
        if (!res.ok) throw new Error("Unable to create task");
        const created: TaskItem = await res.json();
        setTasks((prev) => [created, ...prev]);
        setNewTaskTitle("");
        setTaskCreateError(null);
      } catch (err) {
        const reason = err instanceof Error ? err.message : "Unable to create task";
        setTaskCreateError(reason);
      } finally {
        setTaskCreating(false);
      }
    },
    [activeChildId, primaryChildId, newTaskTitle],
  );

  useEffect(() => {
    if (!guardReady) return;
    if (activePanel === "tasks") {
      loadTasks();
      loadDueReminders();
    }
  }, [activePanel, guardReady, loadDueReminders, loadTasks]);

  const applyChildProfile = useCallback(
    (child: ChildProfile | null) => {
      if (!child) {
        setActiveChildId(null);
        setActiveChildName("");
        setChildFirstName("");
        setChildLastName("");
        setChildDob("");
        setChildDueDate("");
        setChildGender("");
        setChildBirthWeight("");
        setChildBirthWeightUnit("oz");
        setChildLatestWeight("");
        setChildLatestWeightDate("");
        setChildTimezone(DEFAULT_TIMEZONE);
        setRoutineEligible(false);
        setChildSnapshot({
          first_name: "",
          last_name: "",
          birth_date: "",
          due_date: "",
          gender: "",
          birth_weight: "",
          birth_weight_unit: "oz",
          latest_weight: "",
          latest_weight_date: "",
          timezone: DEFAULT_TIMEZONE,
        });
        setBirthStatus("born");
        return;
      }

      const childId = child.id ? String(child.id) : null;
      setActiveChildId(childId);
      setActiveChildName(child.first_name ?? child.name ?? "");
      setChildFirstName(child.first_name ?? "");
      setChildLastName(child.last_name ?? "");
      setChildDob(formatDisplayDate(child.birth_date ?? ""));
      setChildDueDate(formatDisplayDate(child.due_date ?? ""));
      setChildGender(child.gender ?? "");
      setChildBirthWeight(
        typeof child.birth_weight === "number"
          ? String(child.birth_weight)
          : child.birth_weight ?? "",
      );
      setChildBirthWeightUnit(child.birth_weight_unit ?? "oz");
      setChildLatestWeight(
        typeof child.latest_weight === "number"
          ? String(child.latest_weight)
          : child.latest_weight ?? "",
      );
      setChildLatestWeightDate(
        formatDisplayDate(child.latest_weight_date ?? ""),
      );
      setChildTimezone(child.timezone || DEFAULT_TIMEZONE);
      setRoutineEligible(Boolean(child.routine_eligible));
      setChildSnapshot({
        first_name: child.first_name ?? "",
        last_name: child.last_name ?? "",
        birth_date: formatDisplayDate(child.birth_date ?? ""),
        due_date: formatDisplayDate(child.due_date ?? ""),
        gender: child.gender ?? "",
        birth_weight:
          child.birth_weight != null ? String(child.birth_weight) : "",
        birth_weight_unit: child.birth_weight_unit ?? "oz",
        latest_weight:
          child.latest_weight != null ? String(child.latest_weight) : "",
        latest_weight_date: formatDisplayDate(child.latest_weight_date ?? ""),
        timezone: child.timezone || DEFAULT_TIMEZONE,
      });
      setBirthStatus(child.birth_date ? "born" : "expected");
    },
    [],
  );

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    setSettingsError(null);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/v1/settings`);
      if (!res.ok) {
        throw new Error("Unable to load settings");
      }
      const data = await res.json();
      const caregiver = data.caregiver ?? {};
      const children = Array.isArray(data.children)
        ? (data.children as ChildProfile[])
        : data.child
          ? ([data.child] as ChildProfile[])
          : [];
      setChildrenList(children);
      const firstChildId = children[0]?.id ? String(children[0].id) : "";
      setPrimaryChildId(firstChildId);
      const storedChildId =
        typeof window !== "undefined"
          ? window.localStorage.getItem(ACTIVE_CHILD_KEY)
          : null;
      const explicitChildId = data.child?.id ? String(data.child.id) : null;
      const selectedChild =
        children.find((entry) => entry.id === storedChildId) ??
        (explicitChildId
          ? children.find((entry) => entry.id === explicitChildId)
          : null) ??
        (children.length > 0 ? children[0] : null);
      if (selectedChild?.id && typeof window !== "undefined") {
        window.localStorage.setItem(ACTIVE_CHILD_KEY, selectedChild.id);
      } else if (typeof window !== "undefined") {
        window.localStorage.removeItem(ACTIVE_CHILD_KEY);
      }
      applyChildProfile(selectedChild);
      setCaregiverFirstName(caregiver.first_name ?? "");
      setCaregiverLastName(caregiver.last_name ?? "");
      setCaregiverPhone(caregiver.phone ?? "");
      setCaregiverEmail(caregiver.email ?? "");
      setRelationship(caregiver.relationship ?? "");
      setCaregiverSnapshot({
        first_name: caregiver.first_name ?? "",
        last_name: caregiver.last_name ?? "",
        phone: caregiver.phone ?? "",
        email: caregiver.email ?? "",
        relationship: caregiver.relationship ?? "",
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Unknown error";
      setSettingsError(reason);
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!guardReady) return;
    loadSettings();
  }, [guardReady, loadSettings]);

  const handleChildChange = useCallback(
    (childId: string | null) => {
      const nextChild =
        (childId
          ? childrenList.find((entry) => entry.id === childId)
          : null) ?? null;
      applyChildProfile(nextChild);
      if (typeof window !== "undefined") {
        if (nextChild?.id) {
          window.localStorage.setItem(ACTIVE_CHILD_KEY, nextChild.id);
        } else {
          window.localStorage.removeItem(ACTIVE_CHILD_KEY);
        }
      }
    },
    [applyChildProfile, childrenList],
  );

  const loadRecentEvents = useCallback(async () => {
    const resolvedChildId =
      [activeChildId, primaryChildId].find(isValidChildId) ?? null;
    if (!resolvedChildId) {
      setRecentEvents([]);
      setRecentEventsError(null);
      setRecentEventsLoading(false);
      return;
    }
    setRecentEventsLoading(true);
    setRecentEventsError(null);
    try {
      const now = new Date();
      const start = new Date(now.getTime() - 72 * 60 * 60 * 1000);
      const params = new URLSearchParams({
        start: start.toISOString(),
        end: now.toISOString(),
        child_id: resolvedChildId,
      });
      const res = await apiFetch(`${API_BASE_URL}/events?${params}`, {
        childId: activeChildId ?? primaryChildId ?? undefined,
      });
      if (!res.ok) {
        throw new Error("Unable to load recent activity");
      }
      const data: HomeApiEvent[] = await res.json();
      const mapped = data
        .map(mapHomeEvent)
        .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime());
      setRecentEvents(mapped);
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Unknown error";
      setRecentEventsError(reason);
      setRecentEvents([]);
    } finally {
      setRecentEventsLoading(false);
    }
  }, [activeChildId, primaryChildId]);

  useEffect(() => {
    if (!guardReady) return;
    if (activePanel !== "home") return;
    loadRecentEvents();
  }, [activePanel, guardReady, loadRecentEvents, timelineRefreshKey]);

  useEffect(() => {
    const caregiverChanged =
      caregiverFirstName !== caregiverSnapshot.first_name ||
      caregiverLastName !== caregiverSnapshot.last_name ||
      caregiverPhone !== caregiverSnapshot.phone ||
      caregiverEmail !== caregiverSnapshot.email ||
      relationship !== caregiverSnapshot.relationship;
    const childChanged =
      childFirstName !== childSnapshot.first_name ||
      childLastName !== childSnapshot.last_name ||
      childDob !== childSnapshot.birth_date ||
      childDueDate !== childSnapshot.due_date ||
      childGender !== childSnapshot.gender ||
      childBirthWeight !== childSnapshot.birth_weight ||
      childBirthWeightUnit !== childSnapshot.birth_weight_unit ||
      childLatestWeight !== childSnapshot.latest_weight ||
      childLatestWeightDate !== childSnapshot.latest_weight_date ||
      childTimezone !== childSnapshot.timezone;
    setHasUnsaved(caregiverChanged || childChanged);
  }, [
    caregiverEmail,
    caregiverFirstName,
    caregiverLastName,
    caregiverPhone,
    caregiverSnapshot.email,
    caregiverSnapshot.first_name,
    caregiverSnapshot.last_name,
    caregiverSnapshot.phone,
    caregiverSnapshot.relationship,
    relationship,
    childBirthWeight,
    childBirthWeightUnit,
    childDueDate,
    childDob,
    childFirstName,
    childGender,
    childLastName,
    childLatestWeight,
    childLatestWeightDate,
    childTimezone,
    childSnapshot.birth_date,
    childSnapshot.due_date,
    childSnapshot.first_name,
    childSnapshot.gender,
    childSnapshot.last_name,
    childSnapshot.latest_weight,
    childSnapshot.latest_weight_date,
    childSnapshot.birth_weight,
    childSnapshot.birth_weight_unit,
    childSnapshot.timezone,
  ]);

  const appendEntry = useCallback((entry: ChatEntry) => {
    setChatEntries((prev) => [...prev, entry]);
  }, []);

  const handleUseAgentPrompt = useCallback(
    (prompt: string) => {
      setActivePanel("havi");
      setNavOpen(false);
      setMessage((prev) => (prev?.trim() ? `${prev} ${prompt}` : prompt));
      if (composerRef.current) {
        composerRef.current.focus();
      }
    },
    [],
  );

  const startVoice = useCallback(() => {
    setVoiceError(null);
    voiceBaseRef.current = message.trim();
    const SpeechRecognitionConstructor =
      (typeof window !== "undefined" &&
        ((window as unknown as SpeechRecognitionGlobal).SpeechRecognition ||
          (window as unknown as SpeechRecognitionGlobal).webkitSpeechRecognition)) ||
      null;
    if (!SpeechRecognitionConstructor) {
      setVoiceError("Voice not supported in this browser.");
      return;
    }
    try {
      const recognition: SpeechRecognitionLike =
        new SpeechRecognitionConstructor();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = "en-US";
      recognition.onstart = () => {
        setVoiceListening(true);
        setVoiceState("recording");
        setVoiceSeconds(0);
        if (voiceTimerRef.current) {
          clearInterval(voiceTimerRef.current);
        }
        voiceTimerRef.current = setInterval(() => {
          setVoiceSeconds((prev) => prev + 1);
        }, 1000);
      };
      recognition.onerror = () => {
        setVoiceError("Voice not supported in this browser.");
        setVoiceListening(false);
        setVoiceState("idle");
        if (voiceTimerRef.current) {
          clearInterval(voiceTimerRef.current);
          voiceTimerRef.current = null;
        }
      };
      recognition.onresult = (event: SpeechRecognitionEventLike) => {
        const transcript = Array.from(event.results)
          .map((result) => result[0].transcript)
          .join(" ")
          .trim();
        if (transcript) {
          voiceTranscriptRef.current = transcript;
        }
      };
      recognition.onend = () => {
        setVoiceListening(false);
        if (voiceState === "transcribing" || voiceTranscriptRef.current) {
          const base = voiceBaseRef.current;
          const combined = voiceTranscriptRef.current
            ? (base
                ? `${base} ${voiceTranscriptRef.current}`
                : voiceTranscriptRef.current
              ).trim()
            : base;
          setMessage(combined);
        }
        voiceTranscriptRef.current = "";
        setVoiceState("idle");
        if (voiceTimerRef.current) {
          clearInterval(voiceTimerRef.current);
          voiceTimerRef.current = null;
        }
      };
      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      setVoiceError("Unable to start voice input.");
      setVoiceListening(false);
      setVoiceState("idle");
    }
  }, []);

  const stopVoice = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch (err) {
      // ignore stop errors
    }
    setVoiceListening(false);
    setVoiceState("transcribing");
    if (voiceTimerRef.current) {
      clearInterval(voiceTimerRef.current);
      voiceTimerRef.current = null;
    }
  }, []);

  const sendMessage = useCallback(
    async (
      overrideText?: string,
      categoryHint?: LoadingCategory,
      options?: {
        skipEcho?: boolean;
        source?: "chat" | "chip" | "manual" | "import";
        localEntryId?: string | null;
      },
    ) => {
      const textToSend = (overrideText ?? message).trim();
      if (!textToSend) return;
      if (
        ["sending", "thinking_short", "thinking_rich", "streaming_response"].includes(
          conversationState,
        )
      ) {
        return;
      }
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setNetworkOffline(true);
        setConversationState("network_offline");
        setHardErrorMessage(
          "It looks like we’re offline. Please check your connection and retry.",
        );
        return;
      }
      const resolvedChildId =
        [activeChildId, primaryChildId].find(isValidChildId) ?? null;
      if (!resolvedChildId) {
        setHardErrorMessage("Select an active child before sending.");
        setConversationState("error_hard");
        return;
      }
      if (!activeConversationIdRef.current) {
        try {
          const conversation = await createConversation(resolvedChildId);
          activeConversationIdRef.current = conversation.id;
          setActiveConversationId(conversation.id);
          setChatTitle(conversation.title);
        } catch (err) {
          setHardErrorMessage("Start a new chat before sending.");
          setConversationState("error_hard");
          return;
        }
      }
      if (!activeChildId && resolvedChildId) {
        setActiveChildId(resolvedChildId);
      }
      setHardErrorMessage(null);
      setRateLimitedMessage(null);
      setAutoScrollEnabled(true);
      const category = categoryHint ?? pendingCategoryHint ?? questionCategory;
      setPendingCategoryHint(categoryHint ?? null);
      setConversationState("sending");
      let userEntryLocalId = options?.localEntryId ?? null;
      if (!options?.skipEcho && !userEntryLocalId) {
        userEntryLocalId = newId();
        appendEntry({
          id: userEntryLocalId,
          role: "user",
          text: textToSend,
          createdAt: new Date().toISOString(),
          senderType: "self",
          senderName: caregiverFirstName || "You",
        });
      }
      setLastMessageDraft(textToSend);
      startLoadingTimer(category);

      const timezone = childTimezone || DEFAULT_TIMEZONE;
      const resolvedSource = options?.source ?? "chat";
      const modelRequest = buildHaviModelRequest({
        userMessage: textToSend,
        userPreferences: null,
        child: {
          name: activeChildName || childFirstName || null,
          dob: childDob || null,
          dueDate: childDueDate || null,
        },
        feedbackSummary: null,
      });

      try {
        const res = await apiFetch(`${API_BASE_URL}/api/v1/activities`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          childId: activeChildId ?? primaryChildId ?? undefined,
          body: JSON.stringify({
            message: textToSend,
            timezone,
            source: resolvedSource,
            child_id: resolvedChildId,
            conversation_id: activeConversationIdRef.current,
            model_request: modelRequest,
          }),
        });

        if (res.status === 429) {
          const detail = await res.json().catch(() => ({}));
          clearLoadingTimers();
          postClientMetrics("rate_limited");
          setConversationState("rate_limited");
          setRateLimitedMessage(
            detail?.detail ??
              "I’m a bit busy helping other families right now. Give me a moment and try again.",
          );
          return;
        }

        if (!res.ok) {
          const detail = await res.json().catch(() => ({}));
          throw new Error(
            detail?.detail ?? "I’m sorry — I couldn’t finish that one.",
          );
        }

        const data: ApiResponse & { question_category?: LoadingCategory } =
          await res.json();
        setLastIntent(data.intent ?? null);
        activeConversationIdRef.current =
          data.conversation_id ?? activeConversationIdRef.current;
        if (data.conversation_id) {
          setActiveConversationId(data.conversation_id);
        }
        if (activeConversationIdRef.current) {
          updateConversationParam(activeConversationIdRef.current);
        }
        if (data.actions?.length) {
          setHasAnyLog(true);
          setTimelineRefreshKey((prev) => prev + 1);
        }
        clearLoadingTimers();
        setConversationState("streaming_response");
        if (data.question_category) {
          setQuestionCategory(data.question_category as LoadingCategory);
        } else if (categoryHint) {
          setQuestionCategory(categoryHint);
        }
        if (userEntryLocalId && data.user_message_id) {
          setChatEntries((prev) =>
            prev.map((entry) =>
              entry.id === userEntryLocalId
                ? { ...entry, messageId: String(data.user_message_id) }
                : entry,
            ),
          );
        }

        const summary = data.assistant_message?.trim()?.length
          ? data.assistant_message
          : describeActions(data.actions ?? []);
        appendEntry({
          id: newId(),
          role: "havi",
          text: summary,
          messageId: data.assistant_message_id ? String(data.assistant_message_id
          ) : undefined,
          createdAt: new Date().toISOString(),
          senderType: "assistant",
          senderName: "HAVI",
        });
        if (activeConversationIdRef.current) {
          void refreshConversationTitle(activeConversationIdRef.current);
        }
        setMessage("");
        setPendingCategoryHint(null);
        fetchHistory({ silent: true });
        rotateChips();
        setConversationState("idle");
        postClientMetrics();
        retryCountRef.current = 0;
      } catch (err) {
        clearLoadingTimers();
        const reason =
          err instanceof Error ? err.message : "Something unexpected happened.";
        const navigatorOffline =
          typeof navigator !== "undefined" && !navigator.onLine;
        const isOffline =
          navigatorOffline && reason.toLowerCase().includes("failed to fetch");
        if (isOffline) {
          setNetworkOffline(true);
          setConversationState("network_offline");
          setHardErrorMessage(
            "It looks like we’re offline. Please check your connection and retry.",
          );
          postClientMetrics("network_offline");
        } else {
          setHardErrorMessage(reason);
          setConversationState("error_hard");
          postClientMetrics("hard_error");
        }
      }
    },
    [
      appendEntry,
      childTimezone,
      clearLoadingTimers,
      conversationState,
      createConversation,
      fetchHistory,
      activeChildId,
      primaryChildId,
      message,
      pendingCategoryHint,
      postClientMetrics,
      questionCategory,
      refreshConversationTitle,
      rotateChips,
      startLoadingTimer,
      updateConversationParam,
    ],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (isComposerLocked) return;
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
      }
    },
    [isComposerLocked, sendMessage],
  );

  const handleActiveChildChange = useCallback(
    (childId: string | null) => {
      handleChildChange(childId);
    },
    [handleChildChange],
  );

  const handleCompleteTask = useCallback(
    async (taskId: string, targetStatus: "open" | "done" = "done") => {
      setTasksError(null);
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, status: targetStatus } : t,
        ),
      );
      try {
        const res = await apiFetch(`${API_BASE_URL}/api/v1/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          childId: activeChildId ?? undefined,
          body: JSON.stringify({ status: targetStatus }),
        });
        if (!res.ok) throw new Error("Unable to update task");
      } catch (err) {
        const reason = err instanceof Error ? err.message : "Unknown error";
        setTasksError(reason);
        loadTasks();
      }
    },
    [activeChildId, loadTasks],
  );

  const handleSnoozeReminder = useCallback(
    async (taskId: string, snoozeMinutes: number) => {
      setRemindersError(null);
      try {
        const res = await apiFetch(
          `${API_BASE_URL}/api/v1/reminders/${taskId}/ack`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            childId: activeChildId ?? undefined,
            body: JSON.stringify({ snooze_minutes: snoozeMinutes }),
          },
        );
        if (!res.ok) throw new Error("Unable to snooze reminder");
        await loadDueReminders();
        await loadTasks();
      } catch (err) {
        const reason = err instanceof Error ? err.message : "Unknown error";
        setRemindersError(reason);
      }
    },
    [activeChildId, loadDueReminders, loadTasks],
  );

  const formatDateInput = (value?: string | null) => {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return d.toISOString().slice(0, 10);
  };

  const formatTimeInput = (value?: string | null) => {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return d.toISOString().slice(11, 16);
  };

  const formatReminderLabel = (value?: string | null) => {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const openTaskDetails = useCallback((task: TaskItem) => {
    setSelectedTask(task);
    setTaskDetailTitle(task.title);
    setTaskDetailDueDate(formatDateInput(task.due_at));
    setTaskDetailDueTime(formatTimeInput(task.due_at));
  }, []);

  const closeTaskDetails = useCallback(() => {
    setSelectedTask(null);
    setTaskDetailTitle("");
    setTaskDetailDueDate("");
    setTaskDetailDueTime("");
    setTaskSaving(false);
  }, []);

  const saveTaskDetails = useCallback(async () => {
    if (!selectedTask) return;
    const updates: Record<string, unknown> = {};
    const trimmed = taskDetailTitle.trim();
    if (trimmed && trimmed !== selectedTask.title) {
      updates.title = trimmed;
    }
    const originalDueDate = formatDateInput(selectedTask.due_at);
    const originalDueTime = formatTimeInput(selectedTask.due_at);
    const nextDate = taskDetailDueDate;
    const nextTime = taskDetailDueTime;
    if (nextDate !== originalDueDate || nextTime !== originalDueTime) {
      if (!nextDate) {
        updates.due_at = null;
      } else {
        const timePart = nextTime || "00:00";
        const isoString = new Date(`${nextDate}T${timePart}:00`).toISOString();
        updates.due_at = isoString;
      }
    }
    if (Object.keys(updates).length === 0) {
      closeTaskDetails();
      return;
    }
    setTaskSaving(true);
    setTasksError(null);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/v1/tasks/${selectedTask.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        childId: activeChildId ?? undefined,
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Unable to update task");
      await loadTasks();
      closeTaskDetails();
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Unknown error";
      setTasksError(reason);
      setTaskSaving(false);
    }
  }, [
    API_BASE_URL,
    activeChildId,
    closeTaskDetails,
    loadTasks,
    selectedTask,
    taskDetailDueDate,
    taskDetailDueTime,
    taskDetailTitle,
  ]);

  const handleInferenceAction = useCallback(
    async (
      inferenceId: string,
      action:
        | "confirm_general"
        | "confirm_sometimes"
        | "reject"
        | "archive",
    ) => {
      setInferenceError(null);
      const previous = inferenceCards;
      setInferenceCards((cards) =>
        cards.filter((card) => card.id !== inferenceId),
      );
      const resolvedAction = action === "archive" ? "reject" : action;
      const toastText =
        action === "confirm_general"
          ? "Saved."
          : action === "confirm_sometimes"
            ? "Saved (sometimes)."
            : action === "archive"
              ? "Archived."
              : "Dismissed.";
      if (knowledgeToastTimerRef.current) {
        clearTimeout(knowledgeToastTimerRef.current);
      }
      setKnowledgeToast(toastText);
      knowledgeToastTimerRef.current = setTimeout(
        () => setKnowledgeToast(null),
        1500,
      );
      try {
        const res = await apiFetch(
          `${API_BASE_URL}/api/v1/inferences/${inferenceId}/resolve`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            childId: activeChildId ?? undefined,
            body: JSON.stringify({ action: resolvedAction }),
          },
        );
        if (!res.ok) throw new Error("Failed to update insight");
        if (resolvedAction !== "reject") {
          void loadSavedMemories();
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : "Unknown error";
        setInferenceError(reason);
        setInferenceCards(previous);
        setKnowledgeToast(null);
      }
    },
    [API_BASE_URL, activeChildId, inferenceCards, loadSavedMemories],
  );

  useEffect(() => {
    if (childDob || childDueDate) {
      setProfilePromptCount(0);
    }
  }, [childDob, childDueDate]);

  const handleChip = useCallback(
    (chip: ChipTemplate) => {
      const personalized = fillTemplate(chip.text);
      const echoUser = () => {
        const localId = newId();
        setAutoScrollEnabled(true);
        appendEntry({
          id: localId,
          role: "user",
          text: personalized,
          createdAt: new Date().toISOString(),
          senderType: "self",
          senderName: caregiverFirstName || "You",
        });
        setMessage("");
        return localId;
      };

      if (chip.requiresProfile) {
        const missing = computeMissingExpectationFields();
        if (missing.length) {
          echoUser();
          setProfilePromptCount((prev) => prev + 1);
          appendEntry({
            id: newId(),
            role: "havi",
            text:
              "To personalize expectations, I’ll need a birth date or due date, gender, and birth weight if they’re born. Share them here or add everything in Settings.",
            createdAt: new Date().toISOString(),
          });
          return;
        }
      }

      if (chip.requiresRoutine && !routineEligible) {
        echoUser();
        appendEntry({
          id: newId(),
          role: "havi",
          text:
            "Once I spot a couple of similar days, I can draft a routine for you. Keep logging and I’ll take it from there.",
          createdAt: new Date().toISOString(),
        });
        return;
      }

      const localEntryId = echoUser();
      const categoryHint = CHIP_CATEGORY_HINTS[chip.id] ?? null;
      if (categoryHint) {
        sendMessage(personalized, categoryHint, {
          skipEcho: true,
          source: "chip",
          localEntryId,
        });
      } else {
        sendMessage(personalized, undefined, {
          skipEcho: true,
          source: "chip",
          localEntryId,
        });
      }
    },
    [
      appendEntry,
      childFirstName,
      computeMissingExpectationFields,
      fillTemplate,
      hasAnyLog,
      routineEligible,
      sendMessage,
      setMessage,
      setAutoScrollEnabled,
    ],
  );

  const handleHomeChip = useCallback(
    async (chip: ChipTemplate) => {
      if (!activeConversationIdRef.current) {
        await handleNewChat();
      }
      setActivePanel("havi");
      setNavOpen(false);
      handleChip(chip);
    },
    [handleChip, handleNewChat],
  );

  const startSeededConversation = useCallback(
    async (seedText: string) => {
      const childId =
        [activeChildId, primaryChildId].find(isValidChildId) ?? null;
      if (!childId) {
        setHistoryError("Select a child to start a new chat.");
        return;
      }
      try {
        const conversation = await createConversation(childId);
        updateConversationParam(conversation.id);
        activeConversationIdRef.current = conversation.id;
        setActiveConversationId(conversation.id);
        setChatTitle(conversation.title);
        setChatEntries([]);
        setMessage("");
        setActivePanel("havi");
        setNavOpen(false);
        await sendMessage(seedText);
      } catch (err) {
        const reason = err instanceof Error ? err.message : "Unable to start a new chat.";
        setHistoryError(reason);
      }
    },
    [
      activeChildId,
      primaryChildId,
      createConversation,
      sendMessage,
      updateConversationParam,
    ],
  );

  const handleAskQuestion = useCallback(() => {
    setActivePanel("havi");
    setNavOpen(false);
    setTimeout(() => composerRef.current?.focus(), 0);
  }, []);

  const handleOpenTimelineMessage = useCallback((messageId: string) => {
    setActivePanel("havi");
    setFocusedMessageId(messageId);
  }, []);

  const handleShareConversation = useCallback(async () => {
    try {
      const sessionId = activeConversationIdRef.current ?? sessions[0]?.id;
      if (!sessionId) {
        setShareMessage("No conversation to share yet.");
        return;
      }
      const res = await apiFetch(`${API_BASE_URL}/api/v1/share/conversation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail?.detail ?? "Unable to create share link");
      }
      const data = await res.json();
      const token = data.token ?? data.id ?? data.share_id;
      if (!token) {
        throw new Error("Share token unavailable");
      }
      const url = `${window.location.origin}/share/${token}`;
      let copied = false;
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        copied = true;
      }
      setShareLink(url);
      setShareMessage(copied ? "Copied" : "Link ready");
      if (shareTimerRef.current) {
        clearTimeout(shareTimerRef.current);
      }
      shareTimerRef.current = setTimeout(() => setShareMessage(null), 1500);
    } catch (err) {
      const reason =
        err instanceof Error ? err.message : "Unable to share right now.";
      setShareLink(null);
      setShareMessage(reason);
      if (shareTimerRef.current) {
        clearTimeout(shareTimerRef.current);
      }
      shareTimerRef.current = setTimeout(() => setShareMessage(null), 2500);
    }
  }, [sessions]);

  const handleShareMemory = useCallback(
    async (memoryId: string) => {
      try {
        const res = await apiFetch(`${API_BASE_URL}/api/v1/share/memory`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ knowledge_item_id: memoryId }),
        });
        if (!res.ok) {
          const detail = await res.json().catch(() => ({}));
          throw new Error(detail?.detail ?? "Unable to create share link");
        }
        const data = await res.json();
        const token = data.token ?? data.id ?? data.share_id;
        if (!token) {
          throw new Error("Share token unavailable");
        }
        const url = `${window.location.origin}/share/${token}`;
        let copied = false;
        if (typeof navigator !== "undefined" && navigator.clipboard) {
          await navigator.clipboard.writeText(url);
          copied = true;
        }
        setMemoryShareLink(url);
        setMemoryShareMessage(copied ? "Copied" : "Link ready");
        if (memoryShareTimerRef.current) {
          clearTimeout(memoryShareTimerRef.current);
        }
        memoryShareTimerRef.current = setTimeout(
          () => setMemoryShareMessage(null),
          1500,
        );
      } catch (err) {
        const reason =
          err instanceof Error ? err.message : "Unable to share right now.";
        setMemoryShareLink(null);
        setMemoryShareMessage(reason);
        if (memoryShareTimerRef.current) {
          clearTimeout(memoryShareTimerRef.current);
        }
        memoryShareTimerRef.current = setTimeout(
          () => setMemoryShareMessage(null),
          2500,
        );
      }
    },
    [],
  );

  const handleArchiveMemory = useCallback(
    async (memoryId: string) => {
      const previous = savedMemories;
      setSavedMemories((items) => items.filter((item) => item.id !== memoryId));
      try {
        const res = await apiFetch(
          `${API_BASE_URL}/api/v1/knowledge/${memoryId}/archive`,
          { method: "POST" },
        );
        if (!res.ok) {
          throw new Error("Unable to archive memory");
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : "Unknown error";
        setSavedMemories(previous);
        setSavedMemoriesError(reason);
      }
    },
    [API_BASE_URL, savedMemories],
  );

  const handleSendInvite = useCallback(async () => {
    if (inviteSending) return;
    setInviteError(null);
    setInviteLink(null);
    const email = inviteEmail.trim();
    if (!email) {
      setInviteError("Enter an email address to invite.");
      return;
    }
    setInviteSending(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/v1/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role: inviteRole }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail?.detail ?? "Unable to create invite.");
      }
      const data = await res.json();
      setInviteLink(data.invite_url ?? null);
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Unable to create invite.";
      setInviteError(reason);
    } finally {
      setInviteSending(false);
    }
  }, [inviteEmail, inviteRole, inviteSending]);

  const showSettingsSuccess = useCallback(() => {
    setSettingsSuccess("Saved");
    if (settingsSuccessTimerRef.current) {
      clearTimeout(settingsSuccessTimerRef.current);
    }
    settingsSuccessTimerRef.current = setTimeout(
      () => setSettingsSuccess(null),
      4000,
    );
  }, []);

  const saveSettings = useCallback(async () => {
    setSettingsSaving(true);
    setSettingsError(null);
    setSettingsSuccess(null);
    const nextFieldErrors: Record<string, string> = {};
    const validateDate = (value: string | null | undefined) =>
      !value || value.trim() === "" || extractDateParts(value) !== null;
    if (!validateDate(childDob)) {
      nextFieldErrors.childDob = "Enter a valid date in MM-DD-YYYY format.";
    }
    if (!validateDate(childDueDate)) {
      nextFieldErrors.childDueDate = "Enter a valid date in MM-DD-YYYY format.";
    }
    const hasDob = Boolean(childDob?.trim());
    const hasDueDate = Boolean(childDueDate?.trim());
    if (!validateDate(childLatestWeightDate)) {
      nextFieldErrors.childLatestWeightDate =
        "Enter a valid date in MM-DD-YYYY format.";
    }
    if (!hasDob && !hasDueDate) {
      nextFieldErrors.childDob = "Add a date of birth or due date.";
      nextFieldErrors.childDueDate = "Add a date of birth or due date.";
    }
    if ((hasDob || hasDueDate) && !childGender.trim()) {
      nextFieldErrors.childGender = "Select a gender.";
    }
    if (hasDob && !childBirthWeight.trim()) {
      nextFieldErrors.childBirthWeight = "Enter a birth weight.";
    }
    if (Object.keys(nextFieldErrors).length) {
      setFieldErrors(nextFieldErrors);
      setSettingsSaving(false);
      return;
    }
    setFieldErrors({});
    if (
      (childDob !== childSnapshot.birth_date ||
        childDueDate !== childSnapshot.due_date) &&
      (childDob || childDueDate)
    ) {
      const confirmed = window.confirm(
        "Update your child's birth or due date? This affects age-based guidance.",
      );
      if (!confirmed) {
        setSettingsSaving(false);
        return;
      }
    }
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/v1/settings`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          caregiver: {
            first_name: caregiverFirstName,
            last_name: caregiverLastName,
            phone: caregiverPhone,
            email: caregiverEmail,
            relationship,
          },
          child: {
            id: activeChildId,
            first_name: childFirstName,
            last_name: childLastName,
            birth_date: toApiDate(childDob),
            due_date: toApiDate(childDueDate),
            gender: childGender,
            birth_weight: childBirthWeight ? Number(childBirthWeight) : null,
            birth_weight_unit: childBirthWeightUnit,
            latest_weight: childLatestWeight ? Number(childLatestWeight) : null,
            latest_weight_date: toApiDate(childLatestWeightDate),
            timezone: childTimezone || DEFAULT_TIMEZONE,
          },
        }),
      });
      if (!res.ok) {
        throw new Error("Failed to save settings");
      }
      await res.json();
      showSettingsSuccess();
      setCaregiverSnapshot({
        first_name: caregiverFirstName,
        last_name: caregiverLastName,
        phone: caregiverPhone,
        email: caregiverEmail,
        relationship,
      });
      setChildSnapshot({
        first_name: childFirstName,
        last_name: childLastName,
        birth_date: childDob,
        due_date: childDueDate,
        gender: childGender,
        birth_weight: childBirthWeight,
        birth_weight_unit: childBirthWeightUnit,
        latest_weight: childLatestWeight,
        latest_weight_date: childLatestWeightDate,
        timezone: childTimezone,
      });
      if (activeChildId) {
        setChildrenList((prev) =>
          prev.map((child) =>
            child.id === activeChildId
              ? {
                  ...child,
                  first_name: childFirstName,
                  last_name: childLastName,
                  birth_date: toApiDate(childDob),
                  due_date: toApiDate(childDueDate),
                  gender: childGender,
                  birth_weight: childBirthWeight
                    ? Number(childBirthWeight)
                    : null,
                  birth_weight_unit: childBirthWeightUnit,
                  latest_weight: childLatestWeight
                    ? Number(childLatestWeight)
                    : null,
                  latest_weight_date: toApiDate(childLatestWeightDate),
                  timezone: childTimezone,
                }
              : child,
          ),
        );
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Unknown error";
      setSettingsError(reason);
    } finally {
      setSettingsSaving(false);
    }
  }, [
    activeChildId,
    caregiverFirstName,
    caregiverLastName,
    caregiverPhone,
    caregiverEmail,
    relationship,
    childFirstName,
    childLastName,
    childDob,
    childDueDate,
    childGender,
    childBirthWeight,
    childBirthWeightUnit,
    childLatestWeight,
    childLatestWeightDate,
    childTimezone,
    getClientTimezone,
    showSettingsSuccess,
  ]);

  const resetNewChildForm = useCallback(() => {
    setNewChildName("");
    setNewChildBirthDate("");
    setNewChildDueDate("");
    setNewChildGender("");
    setNewChildBirthWeight("");
    setNewChildBirthWeightUnit("oz");
    setNewChildTimezone(childTimezone || DEFAULT_TIMEZONE);
    setNewChildError(null);
  }, [childTimezone]);

  const handleCreateNewChild = useCallback(async () => {
    if (newChildSaving) return;
    setNewChildSaving(true);
    setNewChildError(null);

    const hasBirthDate = Boolean(newChildBirthDate);
    const hasDueDate = Boolean(newChildDueDate);
    if (!hasBirthDate && !hasDueDate) {
      setNewChildError("Add a birth date or due date to continue.");
      setNewChildSaving(false);
      return;
    }
    if (!newChildGender.trim()) {
      setNewChildError("Select a gender to continue.");
      setNewChildSaving(false);
      return;
    }
    if (hasBirthDate && !newChildBirthWeight.trim()) {
      setNewChildError("Add a birth weight to continue.");
      setNewChildSaving(false);
      return;
    }

    try {
      const res = await apiFetch(`${API_BASE_URL}/api/v1/children`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: newChildName.trim() || "Child",
          last_name: "",
          birth_date: toApiDate(newChildBirthDate),
          due_date: toApiDate(newChildDueDate),
          gender: newChildGender,
          birth_weight: newChildBirthWeight ? Number(newChildBirthWeight) : null,
          birth_weight_unit: newChildBirthWeightUnit,
          timezone: newChildTimezone || DEFAULT_TIMEZONE,
        }),
      });
      if (!res.ok) {
        throw new Error("Unable to create child");
      }
      const created = (await res.json()) as ChildProfile;
      setChildrenList((prev) => [...prev, created]);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(ACTIVE_CHILD_KEY, created.id);
      }
      applyChildProfile(created);
      setNewChildOpen(false);
      resetNewChildForm();
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Unable to create child";
      setNewChildError(reason);
    } finally {
      setNewChildSaving(false);
    }
  }, [
    applyChildProfile,
    newChildBirthDate,
    newChildBirthWeight,
    newChildBirthWeightUnit,
    newChildDueDate,
    newChildGender,
    newChildName,
    newChildSaving,
    newChildTimezone,
    resetNewChildForm,
  ]);

  useEffect(() => {
    return () => {
      if (settingsSuccessTimerRef.current) {
        clearTimeout(settingsSuccessTimerRef.current);
      }
      if (shareTimerRef.current) {
        clearTimeout(shareTimerRef.current);
      }
      if (memoryShareTimerRef.current) {
        clearTimeout(memoryShareTimerRef.current);
      }
    };
  }, []);

  if (guard.status !== "ready" || !hydrated) {
    return <GuardLoading />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div data-testid="app-ready" data-app-frame className="flex min-h-screen w-full">
        <aside className="hidden md:flex md:w-60 flex-col gap-4 border-r border-border/60 bg-sidebar p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            HAVI
          </div>
          <nav className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                data-testid={`nav-${item.id}`}
                onClick={() => {
                  setActivePanel(item.id);
                  setNavOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition",
                  activePanel === item.id
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </aside>

        <main className="flex-1 px-4 md:px-6 lg:px-8 py-6">
          <div className="mb-4 flex items-center gap-3 md:hidden">
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label="Menu"
              onClick={() => setNavOpen(true)}
              className="h-9 w-9 p-0"
            >
              <Menu className="h-4 w-4" />
            </Button>
            <span className="text-sm font-semibold">HAVI</span>
          </div>
          {guard.error ? (
            <div
              className="mb-4 rounded-md border border-amber-500/40 bg-amber-900/30 px-3 py-2 text-sm text-amber-50"
              data-testid="guard-warning"
            >
              {guard.error}
            </div>
          ) : null}
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>Active child</span>
            <select
              id="active-child-select"
              className="havi-select text-xs"
              data-testid="active-child-select"
              value={activeChildId ?? ""}
              onChange={(event) =>
                handleChildChange(event.target.value || null)
              }
              disabled={childrenList.length === 0}
            >
              {childrenList.length === 0 ? (
                <option value="">No child yet</option>
              ) : null}
              {childrenList.map((child) => (
                <option key={child.id} value={child.id}>
                  {child.first_name || child.name || "Child"}
                </option>
              ))}
            </select>
            <span data-testid="timezone-label">Times shown in {timezoneLabel}</span>
          </div>
          <section className="border-b border-border/60">
            <div className="mx-auto w-full max-w-6xl px-6 py-10">
          {conversationState === "network_offline" ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-900/30 px-3 py-2 text-sm text-amber-50">
              <p>You're offline. Check your connection and try again.</p>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    if (
                      typeof navigator === "undefined" ||
                      navigator.onLine
                    ) {
                      setNetworkOffline(false);
                      setConversationState("idle");
                      setHardErrorMessage(null);
                      if (lastMessageDraft) {
                        retryCountRef.current += 1;
                        sendMessage(
                          lastMessageDraft,
                          pendingCategoryHint ?? questionCategory,
                          { skipEcho: true },
                        );
                      }
                    }
                  }}
                >
                  Retry
                </Button>
              </div>
            </div>
          ) : null}

          {conversationState === "rate_limited" && rateLimitedMessage ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-900/30 px-3 py-2 text-sm text-amber-50">
              <p>{rateLimitedMessage}</p>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    setRateLimitedMessage(null);
                    setConversationState("idle");
                    if (lastMessageDraft) {
                      retryCountRef.current += 1;
                      sendMessage(
                        lastMessageDraft,
                        pendingCategoryHint ?? questionCategory,
                        { skipEcho: true },
                      );
                    }
                  }}
                >
                  Retry
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setRateLimitedMessage(null);
                    setConversationState("idle");
                  }}
                >
                  Okay
                </Button>
              </div>
            </div>
          ) : null}

          {conversationState === "error_hard" && hardErrorMessage ? (
            <div className="rounded-md border border-destructive/50 bg-destructive/20 px-3 py-2 text-sm text-destructive-foreground">
              <p>{hardErrorMessage}</p>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    if (!lastMessageDraft) return;
                    retryCountRef.current += 1;
                    sendMessage(
                      lastMessageDraft,
                      pendingCategoryHint ?? questionCategory,
                      { skipEcho: true },
                    );
                    setHardErrorMessage(null);
                  }}
                >
                  Retry
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setMessage(lastMessageDraft);
                    setConversationState("idle");
                    setHardErrorMessage(null);
                  }}
                >
                  Edit message
                </Button>
                {showNewChatButton ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setHardErrorMessage(null);
                      setConversationState("idle");
                      void handleNewChat();
                    }}
                  >
                    New chat
                  </Button>
                ) : null}
                {showSignupButton ? (
                  <Button size="sm" variant="outline" onClick={openSignupPanel}>
                    Sign up
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

      {activePanel === "home" ? (
        <Card className="havi-card-shell">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Home</CardTitle>
            <CardDescription className="text-muted-foreground">
              A calm, structured snapshot.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <section data-testid="home-zone-status" className="space-y-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Status
                </p>
                <div className="rounded-md border border-border/40 bg-background/60 p-4 space-y-2">
                  <p className="text-sm text-muted-foreground">{homeGreeting}</p>
                  <p className="text-lg font-semibold">
                    {homeChildName} · {homeAgeLabel}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Here’s a calm snapshot based on what you’ve logged.
                  </p>
                </div>
              </section>

              <section data-testid="home-zone-recent" className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Recent
                  </p>
                  {recentEventsLoading ? (
                    <span className="text-xs text-muted-foreground">
                      Updating…
                    </span>
                  ) : null}
                </div>
                {recentEventsError ? (
                  <p className="text-sm text-muted-foreground">
                    Recent activity is unavailable right now.
                  </p>
                ) : null}
                {!recentEventsLoading && !showLastTile ? (
                  <div className="rounded-md border border-dashed border-border/40 p-4">
                    <p className="text-sm text-muted-foreground">
                      You’re up to date. Log something to see it here.
                    </p>
                  </div>
                ) : null}
                {showChapterTile ? (
                  <div className="rounded-md border border-border/40 bg-background/60 p-4 space-y-2">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold">Last chapter</p>
                        <p className="text-sm text-muted-foreground">
                          {chapterSummary}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          startSeededConversation(chapterSeed)
                        }
                      >
                        View details →
                      </Button>
                    </div>
                  </div>
                ) : null}
                {showLastTile ? (
                  <div className="rounded-md border border-border/40 bg-background/60 p-4 space-y-2">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold">Last</p>
                        <p className="text-sm text-muted-foreground">
                          {lastSummary}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => startSeededConversation(lastSeed)}
                      >
                        View details →
                      </Button>
                    </div>
                  </div>
                ) : null}
              </section>

              <section data-testid="home-zone-coming-up" className="space-y-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Coming up
                </p>
                {showComingUp && comingUpWeek ? (
                  <div className="rounded-md border border-border/40 bg-background/60 p-4 space-y-3">
                    <div>
                      <p className="text-sm font-semibold">
                        What to expect
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Week {comingUpWeek} guidance for {homeChildName}.
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (comingUpSeed) {
                          startSeededConversation(comingUpSeed);
                          window.localStorage.setItem(
                            HOME_EXPECTATION_WEEK_KEY,
                            String(comingUpWeek),
                          );
                          setShowComingUp(false);
                        }
                      }}
                    >
                      View what to expect →
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-border/40 p-4">
                    <p className="text-sm text-muted-foreground">
                      We’ll surface what’s next when a new age window starts.
                    </p>
                  </div>
                )}
              </section>

              <section data-testid="home-zone-utilities" className="space-y-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Utilities
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={handleAskQuestion}>
                    Ask a question
                  </Button>
                </div>
              </section>

              <section data-testid="home-zone-chips" className="space-y-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Quick chips
                </p>
                <div className="flex flex-wrap gap-2">
                  {chipTemplates.slice(0, 6).map((chip) => (
                    <Button
                      key={chip.id}
                      variant="outline"
                      size="sm"
                      onClick={() => handleHomeChip(chip)}
                    >
                      {renderChipLabel(chip)}
                    </Button>
                  ))}
                </div>
              </section>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {activePanel === "timeline" ? (
        <Card className="havi-card-shell">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Timeline</CardTitle>
            <CardDescription className="text-muted-foreground">
              Review events for {childFirstName || "your child"}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TimelinePanel
              key={activeChildId ?? primaryChildId}
              childName={activeChildName || childFirstName || "your child"}
              timezone={childTimezone || DEFAULT_TIMEZONE}
              onOpenInChat={handleOpenTimelineMessage}
              childOptions={timelineChildOptions}
              selectedChildId={activeChildId}
              onChildChange={handleActiveChildChange}
              refreshTrigger={timelineRefreshKey}
            />
          </CardContent>
        </Card>
      ) : null}

      {activePanel === "tasks" ? (
        <Card className="havi-card-shell">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Tasks</CardTitle>
            <CardDescription className="text-muted-foreground">
              Includes family tasks and items for the selected child.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <form
              className="flex flex-col gap-2 sm:flex-row sm:items-center"
              onSubmit={handleCreateTask}
            >
              <Input
                value={newTaskTitle}
                onChange={(event) => {
                  setNewTaskTitle(event.target.value);
                  if (taskCreateError) setTaskCreateError(null);
                }}
                placeholder="Add a task..."
                className="bg-background"
                data-testid="task-input"
              />
              <Button
                type="submit"
                size="sm"
                disabled={taskCreating || !newTaskTitle.trim()}
                data-testid="task-add"
              >
                {taskCreating ? "Adding..." : "Add task"}
              </Button>
            </form>
            {taskCreateError ? (
              <p className="text-sm text-destructive">{taskCreateError}</p>
            ) : null}
            <div className="relative">
              <div
                className="flex items-center gap-2 overflow-x-auto whitespace-nowrap pr-6"
                style={{ WebkitOverflowScrolling: "touch" }}
              >
                {(
                  ["all", "open", "scheduled", "unscheduled", "completed"] as const
                ).map((view) => (
                  <Button
                    key={view}
                    size="sm"
                    variant={tasksView === view ? "secondary" : "ghost"}
                    className="shrink-0"
                    data-testid={`tasks-view-${view}`}
                    onClick={() => setTasksView(view)}
                  >
                    {view === "all"
                      ? "All Tasks"
                      : view === "open"
                        ? "Open"
                        : view === "scheduled"
                          ? "Scheduled"
                          : view === "unscheduled"
                            ? "Unscheduled"
                            : "Completed"}
                  </Button>
                ))}
              </div>
              <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-card/90 to-transparent" />
            </div>
            {remindersLoading ? (
              <p className="text-sm text-muted-foreground">Loading reminders…</p>
            ) : remindersError ? (
              <p className="text-sm text-destructive">{remindersError}</p>
            ) : dueReminders.length > 0 ? (
              <div className="space-y-2 rounded-md border border-amber-200/30 bg-amber-50/10 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-amber-200">
                    Reminders due now
                  </p>
                  <span className="text-xs text-muted-foreground">
                    {dueReminders.length} active
                  </span>
                </div>
                <div className="space-y-2">
                  {dueReminders.map((task) => (
                    <div
                      key={task.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/40 bg-background/70 p-2"
                    >
                      <div>
                        <p className="text-sm font-medium">{task.title}</p>
                        {formatReminderLabel(task.remind_at) ? (
                          <p className="text-[11px] text-muted-foreground">
                            Reminder set{" "}
                            {formatReminderLabel(task.remind_at)}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSnoozeReminder(task.id, 30)}
                        >
                          Snooze 30m
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            handleCompleteTask(task.id, "done");
                            loadDueReminders();
                          }}
                        >
                          Mark done
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {tasksLoading ? (
              <p className="text-sm text-muted-foreground">Loading tasks…</p>
            ) : tasksError ? (
              <p className="text-sm text-destructive">{tasksError}</p>
            ) : tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {getTasksTabEmptyMessage(tasksView)}
              </p>
            ) : filteredTasks.length === 0 ? (
              <ul className="space-y-2">
                <li className="text-sm text-muted-foreground">
                  {tasksAssigneeFilter !== "all"
                    ? getAssigneeEmptyMessage(tasksAssigneeFilter)
                    : getTasksTabEmptyMessage(tasksView)}
                </li>
              </ul>
            ) : (
              <ul className="space-y-2">
                {filteredTasks.map((task) => (
                  <li
                    key={task.id}
                    data-testid="task-item"
                    className="flex items-start gap-3 rounded-md border border-border/40 bg-background/60 p-3 hover:border-border cursor-pointer"
                    onClick={() => openTaskDetails(task)}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border-border/60"
                      onChange={(e) => {
                        e.stopPropagation();
                        const targetStatus =
                          task.status === "done" ? "open" : "done";
                        handleCompleteTask(task.id, targetStatus);
                      }}
                      aria-label={`Complete ${task.title}`}
                      checked={task.status === "done"}
                    />
                    <div className="space-y-1">
                      <p className="text-sm font-medium" data-testid="task-title">
                        {task.title}
                      </p>
                      {(() => {
                        const meta = buildTaskMeta(
                          task,
                          currentUserId,
                          currentUserName,
                        );
                        if (!meta) return null;
                        return (
                          <p className="text-[11px] text-muted-foreground">
                            {meta}
                          </p>
                        );
                      })()}
                      {task.due_at ? (
                        <p className="text-[11px] text-muted-foreground">
                          Due{" "}
                          {formatDueDateLabel(task.due_at)}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <Button
              variant="outline"
              size="sm"
              className="mt-1"
              onClick={() => setActivePanel("havi")}
            >
              Back to chat
            </Button>
          </CardContent>
        </Card>
      ) : null}
      {selectedTask ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 md:items-stretch md:justify-end"
          onClick={closeTaskDetails}
        >
          <div
            className="w-full max-w-[420px] rounded-t-2xl border border-border/60 bg-card p-4 shadow-xl md:h-full md:rounded-none md:rounded-l-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold">Task details</h3>
                <p className="text-xs text-muted-foreground">
                  Created {new Date(selectedTask.created_at).toLocaleString([], {
           month: "short", day: "numeric" })}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={closeTaskDetails}>
                Close
              </Button>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">Title</p>
                <input
                  className="mt-1 havi-input"
                  value={taskDetailTitle}
                  onChange={(e) => setTaskDetailTitle(e.target.value)}
                  data-testid="task-detail-title"
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Due</p>
                <div className="mt-1 space-y-2">
                  <div>
                    <p className="text-[11px] text-muted-foreground">Date</p>
                    <input
                      type="date"
                      className="mt-1 havi-input"
                      value={taskDetailDueDate}
                      onChange={(e) => setTaskDetailDueDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">Time</p>
                    <input
                      type="time"
                      className="mt-1 havi-input"
                      value={taskDetailDueTime}
                      onChange={(e) => setTaskDetailDueTime(e.target.value)}
                    />
                  </div>
                </div>
                {taskDetailDueDate || taskDetailDueTime ? (
                  <button
                    type="button"
                    className="mt-1 text-xs text-muted-foreground underline"
                    onClick={() => {
                      setTaskDetailDueDate("");
                      setTaskDetailDueTime("");
                    }}
                  >
                    Clear due
                  </button>
                ) : null}
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <Button
                size="sm"
                onClick={saveTaskDetails}
                disabled={taskSaving || !taskDetailTitle.trim()}
                data-testid="task-detail-save"
              >
                Save
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={closeTaskDetails}
                disabled={taskSaving}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="secondary"
                data-testid="task-detail-toggle"
                onClick={() => {
                  const targetStatus = selectedTask.status === "done" ? "open" :
          "done";
                  handleCompleteTask(selectedTask.id, targetStatus);
                  closeTaskDetails();
                }}
              >
                {selectedTask.status === "done" ? "Reopen" : "Mark complete"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {activePanel === "history" ? (
        <Card className="havi-card-shell">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base font-semibold">Chat history</CardTitle>
                <CardDescription className="text-muted-foreground">
                  Recent conversations auto-titled by HAVI.
                </CardDescription>
              </div>
              <Button size="sm" onClick={handleNewChat}>
                New chat
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {historyLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : historyError ? (
              <p className="text-sm text-destructive">{historyError}</p>
            ) : sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No chats yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {sessions.map((session) => (
                  <li
                    key={session.id}
                    className="flex items-center justify-between rounded-md border border-border/40 p-2"
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate">{session.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(session.last_message_at).toLocaleString()}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSelectConversation(session.id)}
                    >
                      Open
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => setActivePanel("havi")}
            >
              Back to chat
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {activePanel === "knowledge" ? (
        <Card className="havi-card-shell">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Memories</CardTitle>
            <CardDescription className="text-muted-foreground">
              Review what HAVI noticed and save the moments that matter.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {knowledgeToast ? (
              <div className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                {knowledgeToast}
              </div>
            ) : null}
            <section data-testid="memory-suggestions" className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Things HAVI noticed</p>
                  <p className="text-xs text-muted-foreground">
                    Suggested insights (not saved yet).
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {inferenceCards.length} pending
                </span>
              </div>
              {inferenceLoading ? (
                <p className="text-sm text-muted-foreground">Loading suggestions…</p>
              ) : inferenceError ? (
                <div className="text-sm text-destructive">{inferenceError}</div>
              ) : inferenceCards.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No new suggestions right now.
                </p>
              ) : (
                <div className="space-y-3">
                  {inferenceCards.map((card) => {
                    const meta = inferenceMetaFor(
                      card.inference_type,
                      card.payload,
                    );
                    const expanded = expandedInferences.has(card.id);
                    return (
                      <div
                        key={card.id}
                        data-testid={`memory-suggestion-${card.id}`}
                        className="space-y-3 rounded-lg border border-border/50 bg-background/70 p-4"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold">{meta.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {meta.summary}
                            </p>
                          </div>
                          <span className="rounded-full bg-muted px-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                            Suggested
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            onClick={() =>
                              handleInferenceAction(card.id, "confirm_general")
                            }
                          >
                            Yes, generally
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              handleInferenceAction(card.id, "confirm_sometimes")
                            }
                          >
                            Sometimes
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              handleInferenceAction(card.id, "reject")
                            }
                          >
                            Not really
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              handleInferenceAction(card.id, "archive")
                            }
                          >
                            Archive
                          </Button>
                        </div>
                        <button
                          type="button"
                          className="text-xs text-primary underline"
                          onClick={() => {
                            setExpandedInferences((prev) => {
                              const next = new Set(prev);
                              if (next.has(card.id)) {
                                next.delete(card.id);
                              } else {
                                next.add(card.id);
                              }
                              return next;
                            });
                          }}
                        >
                          {expanded ? "Hide details" : "Details"}
                        </button>
                        {expanded ? (
                          <pre className="overflow-x-auto rounded-md bg-muted/30 p-2 text-xs text-muted-foreground">
                            {JSON.stringify(card.payload, null, 2)}
                          </pre>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
            <section data-testid="memory-saved" className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Saved memories</p>
                  <p className="text-xs text-muted-foreground">
                    Confirmed and used for context.
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {savedMemories.length} saved
                </span>
              </div>
              {savedMemoriesLoading ? (
                <p className="text-sm text-muted-foreground">
                  Loading saved memories…
                </p>
              ) : savedMemoriesError ? (
                <div className="text-sm text-destructive">{savedMemoriesError}</div>
              ) : savedMemories.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No memories saved yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {savedMemories.map((memory) => {
                    const summary = memorySummaryFor(memory);
                    const qualifier = memory.qualifier
                      ? ` • ${memory.qualifier}`
                      : "";
                    return (
                      <div
                        key={memory.id}
                        data-testid={`memory-saved-${memory.id}`}
                        className="space-y-2 rounded-lg border border-border/50 bg-background/70 p-4"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold">{summary}</p>
                            <p className="text-xs text-muted-foreground">
                              {memory.confidence
                                ? `Confidence: ${memory.confidence}${qualifier}`
                                : "Saved memory"}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              data-testid="memory-share"
                              onClick={() => void handleShareMemory(memory.id)}
                            >
                              Share
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void handleArchiveMemory(memory.id)}
                            >
                              Archive
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {memoryShareMessage ? (
                <p className="text-xs text-muted-foreground">
                  {memoryShareMessage}
                </p>
              ) : null}
              {memoryShareLink ? (
                <p
                  data-testid="memory-share-link"
                  className="text-[11px] text-muted-foreground break-all"
                >
                  {memoryShareLink}
                </p>
              ) : null}
            </section>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActivePanel("havi")}
            >
              Back to chat
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {activePanel === "integrations" ? (
        <Card className="bg-card/80 shadow-lg">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Integrations & Agents</CardTitle>
            <CardDescription className="text-muted-foreground">
              Lightweight previews of what’s coming next.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3">
              {agentCards.map((agent) => (
                <button
                  key={agent.id}
                  className={cn(
                    "flex items-start justify-between rounded-lg border border-border/50 bg-background/70 p-3 text-left",
                    selectedAgentId === agent.id && "ring-1 ring-primary/40",
                  )}
                  onClick={() => setSelectedAgentId(agent.id)}
                >
                  <div className="flex gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-primary/15 to-muted">
                      <span className="text-xl">{agent.icon}</span>
                    </div>
                    <div className="space-y-1 text-left">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{agent.name}</span>
                        <span className="rounded-full bg-muted px-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                          {agent.statusBadge}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {agent.shortDescription}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Used by {agent.usedByYUsers} users
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            {selectedAgentId ? (
              <div className="rounded-lg border border-border/60 bg-background/80 p-4">
                {agentCards
                  .filter((agent) => agent.id === selectedAgentId)
                  .map((agent) => (
                    <div key={agent.id} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{agent.icon}</span>
                        <div>
                          <p className="text-lg font-semibold">{agent.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {agent.shortDescription}
                          </p>
                        </div>
                        <span className="ml-auto rounded-full bg-muted px-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                          {agent.statusBadge}
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {agent.longDescription}
                      </p>
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span>Created by {agent.createdBy}</span>
                        <span>Created {agent.createdAt}</span>
                        <span>Used {agent.usedXTimes} times</span>
                        <span>Used by {agent.usedByYUsers} users</span>
                      </div>
                      <div className="space-y-1 rounded-md border border-border/60 bg-muted/20 p-3">
                        <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                          <span>Saved prompt</span>
                          <button
                            type="button"
                            className="text-primary underline"
                            onClick={() => {
                              if (
                                typeof navigator === "undefined" ||
                                !navigator.clipboard
                              ) {
                                return;
                              }
                              navigator.clipboard
                                .writeText(agent.savedPrompt)
                                .catch(() => {});
                            }}
                          >
                            Copy
                          </button>
                        </div>
                        <pre className="whitespace-pre-wrap text-xs text-foreground">
                          {agent.savedPrompt}
                        </pre>
                      </div>
                      <Button
                        variant={
                          agent.statusBadge === "Available" ? "default" : "outline"
                        }
                        disabled={agent.statusBadge !== "Available"}
                        className="w-full"
                        onClick={() => {
                          if (agent.statusBadge === "Available") {
                            handleUseAgentPrompt(agent.savedPrompt);
                          }
                        }}
                      >
                        {agent.statusBadge === "Available"
                          ? "Use Remind Agent"
                          : "Coming soon"}
                      </Button>
                    </div>
                  ))}
            </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Select an agent to preview how it will help.
              </p>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActivePanel("havi")}
            >
              Back to chat
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {activePanel === "settings" ? (
        <Card className="havi-card-shell">
          <CardHeader>
            <CardTitle className="text-base">Settings</CardTitle>
            <CardDescription className="text-muted-foreground">
              Manage caregiver and child details.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {settingsLoading ? (
              <p className="text-sm text-muted-foreground">Loading settings…</p>
            ) : (
              <>
                {settingsError ? (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    There was a problem saving your settings. Please try again.
                    <div className="text-[11px] text-destructive/80">
                      {settingsError}
                    </div>
                  </div>
                ) : null}
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">Care Team</p>
                      <p className="text-xs text-muted-foreground">
                        Manage who gets updates and access.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid="open-invite"
                        onClick={() => setInviteOpen(true)}
                      >
                        Invite
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="hidden md:inline-flex"
                        onClick={() => setShowCaregiverForm((prev) => !prev)}
                        data-testid="caregiver-edit-toggle"
                      >
                        {showCaregiverForm ? "Close" : "Edit"}
                      </Button>
                    </div>
                  </div>
                  <div className="rounded-md border border-border/50 bg-background/60 p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-foreground">
                          {caregiverFirstName || caregiverLastName
                            ? `${caregiverFirstName} ${caregiverLastName}`.trim()
                            : "Primary caregiver"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {relationship || "Relationship not set"}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>
                          {caregiverEmail || caregiverPhone ? (
                            <>
                              {caregiverEmail}
                              {caregiverEmail && caregiverPhone ? " • " : ""}
                              {caregiverPhone}
                            </>
                          ) : (
                            "Contact not set"
                          )}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="px-2 text-xs underline md:hidden"
                          onClick={() => setShowCaregiverForm((prev) => !prev)}
                          data-testid="caregiver-edit-toggle"
                        >
                          {showCaregiverForm ? "Close" : "Edit"}
                        </Button>
                      </div>
                    </div>
                  </div>
                  {showCaregiverForm ? (
                    <div className="space-y-2 rounded-md border border-border/60 bg-background/70 p-3">
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        <EditableField
                          label="First Name"
                          value={caregiverFirstName}
                          onChange={(val) => setCaregiverFirstName(val)}
                          testId="caregiver-first-name"
                        />
                        <EditableField
                          label="Last Name"
                          value={caregiverLastName}
                          onChange={(val) => setCaregiverLastName(val)}
                          testId="caregiver-last-name"
                        />
                        <EditableField
                          label="Phone (optional)"
                          value={caregiverPhone}
                          onChange={(val) => setCaregiverPhone(val)}
                        />
                        <EditableField
                          label="Email (optional)"
                          value={caregiverEmail}
                          onChange={(val) => setCaregiverEmail(val)}
                        />
                        <div>
                          <p className="text-[11px] text-muted-foreground">
                            Relationship
                          </p>
                          <select
                            className="mt-1 w-full havi-select"
                            value={relationship}
                            onChange={(event) =>
                              setRelationship(event.target.value)
                            }
                          >
                            {["Mom", "Dad", "Family", "Caregiver", "Other"].map(
                              (option) => (
                                <option key={option}>{option}</option>
                              ),
                            )}
                          </select>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {newChildOpen ? (
                    <div className="space-y-3 rounded-md border border-border/60 bg-background/70 p-3">
                      <div>
                        <p className="text-sm font-semibold">Add a child</p>
                        <p className="text-xs text-muted-foreground">
                          Add another child profile for this family.
                        </p>
                      </div>
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        <label className="text-[11px] text-muted-foreground">
                          First Name
                          <Input
                            id="new-child-first-name"
                            className="mt-1"
                            value={newChildName}
                            onChange={(event) =>
                              setNewChildName(event.target.value)
                            }
                            placeholder="River"
                          />
                        </label>
                        <div>
                          <p className="text-[11px] text-muted-foreground">
                            Gender
                          </p>
                          <select
                            id="new-child-gender"
                            className="mt-1 w-full havi-select"
                            value={newChildGender}
                            onChange={(event) =>
                              setNewChildGender(event.target.value)
                            }
                          >
                            <option value="">Select</option>
                            <option value="unknown">Unknown</option>
                            <option value="boy">Boy</option>
                            <option value="girl">Girl</option>
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        <div>
                          <p className="text-[11px] text-muted-foreground">
                            Birth Date (if born)
                          </p>
                          <Input
                            id="new-child-birth-date"
                            type="date"
                            value={newChildBirthDate}
                            onChange={(event) =>
                              setNewChildBirthDate(event.target.value)
                            }
                          />
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground">
                            Due Date (if expected)
                          </p>
                          <Input
                            id="new-child-due-date"
                            type="date"
                            value={newChildDueDate}
                            onChange={(event) =>
                              setNewChildDueDate(event.target.value)
                            }
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        <label className="text-[11px] text-muted-foreground">
                          Birth Weight (required if born)
                          <Input
                            id="new-child-birth-weight"
                            className="mt-1"
                            value={newChildBirthWeight}
                            onChange={(event) =>
                              setNewChildBirthWeight(event.target.value)
                            }
                            placeholder="e.g., 7.5"
                          />
                        </label>
                        <div>
                          <p className="text-[11px] text-muted-foreground">
                            Birth Weight Unit
                          </p>
                          <select
                            className="mt-1 w-full rounded-md border border-border/40 bg-background/60 p-2 text-sm"
                            value={newChildBirthWeightUnit}
                            onChange={(event) =>
                              setNewChildBirthWeightUnit(event.target.value)
                            }
                          >
                            {["oz", "lb", "kg"].map((unit) => (
                              <option key={unit} value={unit}>
                                {unit}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div>
                        <p className="text-[11px] text-muted-foreground">
                          Timezone
                        </p>
                        <select
                          id="new-child-timezone"
                          className="w-full havi-select"
                          value={newChildTimezone || "America/Los_Angeles"}
                          onChange={(e) => setNewChildTimezone(e.target.value)}
                        >
                          <option value="America/Los_Angeles">Pacific (PT)</option>
                          <option value="America/Denver">Mountain (MT)</option>
                          <option value="America/Chicago">Central (CT)</option>
                          <option value="America/New_York">Eastern (ET)</option>
                        </select>
                      </div>
                      {newChildError ? (
                        <p className="text-sm text-destructive">{newChildError}</p>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          id="new-child-save"
                          size="sm"
                          onClick={() => handleCreateNewChild()}
                          disabled={newChildSaving}
                        >
                          {newChildSaving ? "Saving..." : "Save child"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setNewChildOpen(false);
                            resetNewChildForm();
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </section>

                <section className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">Children</p>
                      <p className="text-xs text-muted-foreground">
                        Keep key details up to date.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid="add-child"
                        onClick={() => {
                          resetNewChildForm();
                          setNewChildOpen(true);
                        }}
                      >
                        Add child
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="hidden md:inline-flex"
                        onClick={() => setShowChildForm((prev) => !prev)}
                        data-testid="settings-child-edit"
                      >
                        {showChildForm ? "Close" : "Edit"}
                      </Button>
                    </div>
                  </div>
                  <div className="rounded-md border border-border/50 bg-background/60 p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-foreground">
                          {childFirstName || childLastName
                            ? `${childFirstName} ${childLastName}`.trim()
                            : "Child profile"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {childDob
                            ? `DOB: ${childDob}`
                            : childDueDate
                              ? `Due: ${childDueDate}`
                              : "Add birth or due date"}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{childTimezone || DEFAULT_TIMEZONE}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="px-2 text-xs underline md:hidden"
                          onClick={() => setShowChildForm((prev) => !prev)}
                          data-testid="settings-child-edit"
                        >
                          {showChildForm ? "Close" : "Edit"}
                        </Button>
                      </div>
                    </div>
                    {childrenList.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {childrenList.map((child) => (
                          <Button
                            key={child.id}
                            size="sm"
                            variant={
                              child.id === activeChildId ? "default" : "outline"
                            }
                            onClick={() => handleChildChange(child.id)}
                          >
                            {child.first_name || child.name || "Child"}
                          </Button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {showChildForm ? (
                    <div className="space-y-2 rounded-md border border-border/60 bg-background/70 p-3">
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        <EditableField
                          label="First Name"
                          value={childFirstName}
                          onChange={(val) => setChildFirstName(val)}
                        />
                        <EditableField
                          label="Last Name (optional)"
                          value={childLastName}
                          onChange={(val) => setChildLastName(val)}
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant={
                            birthStatus === "born" ? "default" : "outline"
                          }
                          onClick={() => {
                            setBirthStatus("born");
                          }}
                          data-testid="settings-child-born"
                        >
                          Born
                        </Button>
                        <Button
                          size="sm"
                          variant={
                            birthStatus === "expected" ? "default" : "outline"
                          }
                          onClick={() => {
                            setBirthStatus("expected");
                          }}
                          data-testid="settings-child-expected"
                        >
                          Expected
                        </Button>
                      </div>
                      {birthStatus === "born" ? (
                        <div>
                          <EditableField
                            label="Date of Birth"
                            value={childDob}
                            onChange={(val) => setChildDob(val)}
                            placeholder="MM-DD-YYYY"
                            testId="settings-child-dob"
                          />
                          {fieldErrors.childDob ? (
                            <p className="text-xs text-destructive">
                              {fieldErrors.childDob}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <div>
                          <EditableField
                            label="Due Date"
                            value={childDueDate}
                            onChange={(val) => setChildDueDate(val)}
                            placeholder="MM-DD-YYYY"
                            testId="settings-child-due-date"
                          />
                          {fieldErrors.childDueDate ? (
                            <p className="text-xs text-destructive">
                              {fieldErrors.childDueDate}
                            </p>
                          ) : null}
                        </div>
                      )}
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        <div>
                          <p className="text-[11px] text-muted-foreground">
                            Gender
                          </p>
                          <select
                            className="mt-1 w-full havi-select"
                            value={childGender}
                            onChange={(event) =>
                              setChildGender(event.target.value)
                            }
                            data-testid="settings-child-gender"
                          >
                            <option value="">Select</option>
                            <option value="unknown">Unknown</option>
                            <option value="boy">Boy</option>
                            <option value="girl">Girl</option>
                          </select>
                          {fieldErrors.childGender ? (
                            <p className="text-xs text-destructive">
                              {fieldErrors.childGender}
                            </p>
                          ) : null}
                        </div>
                        <div>
                          <EditableField
                            label="Birth Weight (required if born)"
                            value={childBirthWeight}
                            onChange={(val) => setChildBirthWeight(val)}
                            placeholder="e.g., 7.5"
                            testId="settings-child-birth-weight"
                          />
                          {fieldErrors.childBirthWeight ? (
                            <p className="text-xs text-destructive">
                              {fieldErrors.childBirthWeight}
                            </p>
                          ) : null}
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground">
                            Birth Weight Unit
                          </p>
                          <select
                            className="mt-1 w-full rounded-md border border-border/40 bg-background/60 p-2 text-sm"
                            value={childBirthWeightUnit}
                            onChange={(event) =>
                              setChildBirthWeightUnit(event.target.value)
                            }
                          >
                            {["oz", "lb", "kg"].map((unit) => (
                              <option key={unit} value={unit}>
                                {unit}
                              </option>
                            ))}
                          </select>
                        </div>
                        <EditableField
                          label="Latest Weight (optional)"
                          value={childLatestWeight}
                          onChange={(val) => setChildLatestWeight(val)}
                          placeholder="e.g., 11.2"
                        />
                        <EditableField
                          label="Latest Weight Date (optional)"
                          value={childLatestWeightDate}
                          onChange={(val) => setChildLatestWeightDate(val)}
                          placeholder="MM-DD-YYYY"
                        />
                        {fieldErrors.childLatestWeightDate ? (
                          <p className="text-xs text-destructive">
                            {fieldErrors.childLatestWeightDate}
                          </p>
                        ) : null}
                        <div>
                          <p className="text-[11px] text-muted-foreground">
                            Timezone
                          </p>
                          <select
                            className="w-full havi-select"
                            value={childTimezone || "America/Los_Angeles"}
                            onChange={(e) => setChildTimezone(e.target.value)}
                          >
                            <option value="America/Los_Angeles">
                              Pacific (PT)
                            </option>
                            <option value="America/Denver">Mountain (MT)</option>
                            <option value="America/Chicago">Central (CT)</option>
                            <option value="America/New_York">
                              Eastern (ET)
                            </option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <p className="text-[11px] text-muted-foreground">
                          Current age
                        </p>
                        <p className="rounded-md border border-border/40 bg-background/60 px-2 py-1 text-sm">
                          {formatAdjustedAge(childDob, childDueDate)}
                        </p>
                      </div>
                    </div>
                  ) : null}
                </section>

                <div className="flex flex-col gap-2">
                  <Button
                    className="w-full"
                    onClick={saveSettings}
                    disabled={settingsSaving}
                    data-testid="settings-save"
                  >
                    {settingsSaving ? (
                      <span className="flex items-center justify-center gap-2">
                        <InlineSpinner />
                        Saving…
                      </span>
                    ) : (
                      "Save changes"
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setActivePanel("havi")}
                  >
                    Back to chat
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleSignOut}
                    data-testid="sign-out"
                  >
                    Sign out
                  </Button>
                </div>
              </>
            )}
            {hasUnsaved ? (
              <div className="sticky bottom-0 mt-4 flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-background/80 px-3 py-2">
                <span className="text-sm font-medium">Unsaved changes</span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setCaregiverFirstName(caregiverSnapshot.first_name);
                      setCaregiverLastName(caregiverSnapshot.last_name);
                      setCaregiverPhone(caregiverSnapshot.phone);
                      setCaregiverEmail(caregiverSnapshot.email);
                      setRelationship(caregiverSnapshot.relationship);
                      setChildFirstName(childSnapshot.first_name);
                      setChildLastName(childSnapshot.last_name);
                      setChildDob(childSnapshot.birth_date);
                      setChildDueDate(childSnapshot.due_date);
                      setChildGender(childSnapshot.gender);
                      setChildBirthWeight(childSnapshot.birth_weight);
                      setChildBirthWeightUnit(childSnapshot.birth_weight_unit);
                      setChildLatestWeight(childSnapshot.latest_weight);
                      setChildLatestWeightDate(childSnapshot.latest_weight_date);
                      setChildTimezone(childSnapshot.timezone);
                      setBirthStatus(
                        childSnapshot.birth_date ? "born" : "expected",
                      );
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={saveSettings}
                    disabled={settingsSaving}
                  >
                    Save changes
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {activePanel === "havi" ? (
        <>
          <Card className="flex-1 havi-card-shell">
            <CardHeader className="flex items-center justify-between gap-2 pb-2">
              <div className="min-w-0">
                {chatTitle ? (
                  <CardTitle className="text-sm font-semibold truncate">
                    {chatTitle}
                  </CardTitle>
                ) : null}
                <p className="text-xs text-muted-foreground" data-testid="timezone-label">
                  Times shown in {timezoneLabel}
                </p>
              </div>
              <div className="relative">
                <ShareButton
                  disabled={!shareEnabled}
                  title={
                    shareEnabled
                      ? "Copy a shareable link."
                      : "Start a chat to enable sharing."
                  }
                  onClick={() => void handleShareConversation()}
                  aria-label="Share conversation"
                  data-testid="share-conversation"
                />
                {shareMessage ? (
                  <span className="absolute left-1/2 top-full z-10 -translate-x-1/2 mt-1 rounded-md bg-popover px-2 py-1 text-xs text-muted-foreground shadow">
                    Copied
                  </span>
                ) : null}
                {shareLink ? (
                  <div
                    data-testid="share-link"
                    className="absolute left-1/2 top-full z-10 mt-8 w-64 -translate-x-1/2 rounded-md border border-border/60 bg-popover px-2 py-1 text-[11px] text-muted-foreground shadow"
                  >
                    {shareLink}
                  </div>
                ) : null}
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea
                ref={handleScrollViewportRef}
                className="h-[360px] rounded-md border border-border/40 bg-background/30 p-3 space-y-3"
              >
                {chatEntries.map((entry, index) => {
                  const currentSender =
                    entry.senderType ??
                    (entry.role === "havi" ? "assistant" : "self");
                  const prevSender =
                    index > 0
                      ? chatEntries[index - 1].senderType ??
                        (chatEntries[index - 1].role === "havi"
                          ? "assistant"
                          : "self")
                      : null;
                  const gap =
                    index === 0 ? 0 : prevSender === currentSender ? 6 : 12;
                  return (
                    <div
                      key={entry.id}
                      style={{ marginTop: gap }}
                      className="w-full"
                    >
                      <MessageBubble
                        entry={entry}
                        isPinned={pinnedTimestampId === entry.id}
                        onToggleTimestamp={(id) =>
                          setPinnedTimestampId((prev) =>
                            prev === id ? null : id,
                          )
                        }
                        onCopy={(text, id) => {
                          if (!text) return;
                          if (
                            typeof navigator === "undefined" ||
                            !navigator.clipboard
                          ) {
                            return;
                          }
                          navigator.clipboard
                            .writeText(text)
                            .then(() => {
                              setCopiedMessageId(id);
                              setTimeout(
                                () => setCopiedMessageId(null),
                                1500,
                              );
                            })
                            .catch(() => setCopiedMessageId(null));
                        }}
                        copiedMessageId={copiedMessageId}
                        highlightedMessageId={highlightedMessageId}
                        feedbackByMessageId={messageFeedbackById}
                        conversationId={activeConversationId}
                        timezone={childTimezone || DEFAULT_TIMEZONE}
                      />
                    </div>
                  );
                })}
                {["thinking_short", "thinking_rich"].includes(conversationState) ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <InlineSpinner />
                    <span>{loadingMessage}</span>
                  </div>
                ) : null}
              </ScrollArea>
            </CardContent>
          </Card>

          <div className="mt-4 space-y-3">
            <div className="flex flex-col gap-2">
              <div className="flex items-end gap-2 rounded-2xl border border-border/60 bg-card/70 px-2 py-2">
                <div className="flex-1 min-w-0">
                  {voiceState === "recording" ? (
                    <div className="flex items-center gap-2 rounded-xl bg-background/60 px-3 py-2 text-sm text-muted-foreground">
                      <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-red-500" />
                      <span className="font-medium text-foreground">
                        Recording…
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatVoiceTime(voiceSeconds)}
                      </span>
                    </div>
                  ) : voiceState === "transcribing" ? (
                    <div className="flex items-center gap-2 rounded-xl bg-background/60 px-3 py-2 text-sm text-muted-foreground">
                      <InlineSpinner />
                      <span>Transcribing…</span>
                    </div>
                  ) : (
                    <AutoResizeTextarea
                      id="activity-input"
                      data-testid="chat-input"
                      placeholder="Ask a question, log a moment, or track anything…"
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                      onKeyDown={handleKeyDown}
                      disabled={isComposerLocked || voiceState !== "idle"}
                      className="flex-1 bg-transparent"
                      inputRef={composerRef}
                    />
                  )}
                </div>
                <DictateButton
                  isRecording={voiceState === "recording"}
                  onClick={() =>
                    voiceState === "recording" ? stopVoice() : startVoice()
                  }
                  disabled={isComposerLocked || voiceState === "transcribing"}
                  className={cn(
                    "h-10 w-10 rounded-xl border border-border/60",
                    voiceState === "recording"
                      ? "bg-red-500/10 text-red-500"
                      : "bg-background",
                  )}
                />
                <Button
                  type="button"
                  aria-label="Send message"
                  data-testid="chat-send"
                  onClick={() => sendMessage()}
                  disabled={
                    !message.trim() ||
                    isComposerLocked ||
                    voiceState !== "idle"
                  }
                  className="flex h-10 w-10 items-center justify-center rounded-xl"
                >
                  <ArrowUpRight className="h-4 w-4" />
                </Button>
              </div>
              {voiceError ? (
                <p className="text-xs text-destructive">{voiceError}</p>
              ) : null}
            </div>
          </div>
        </>
      ) : null}

      {inviteOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md space-y-3 rounded-lg border border-border/60 bg-card p-4 shadow-xl">
            <div className="space-y-1">
              <p className="text-base font-semibold">Invite a caregiver</p>
              <p className="text-sm text-muted-foreground">
                Share a private link to join your family.
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Email
                <Input
                  id="invite-email"
                  className="mt-2"
                  type="email"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="caregiver@email.com"
                />
              </label>
              <label className="text-sm font-medium">
                Role
                <select
                  id="invite-role"
                  className="mt-2 w-full havi-select"
                  value={inviteRole}
                  onChange={(event) => setInviteRole(event.target.value)}
                >
                  {["Parent", "Caregiver", "Family"].map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </label>
              {inviteLink ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Invite link
                  </p>
                  <div
                    data-testid="invite-link"
                    className="rounded-md border border-border/50 bg-background/70 px-2 py-2 text-xs break-all"
                  >
                    {inviteLink}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (typeof navigator !== "undefined" && navigator.clipboard) {
                        navigator.clipboard.writeText(inviteLink);
                      }
                    }}
                  >
                    Copy link
                  </Button>
                </div>
              ) : null}
              {inviteError ? (
                <p className="text-sm text-destructive">{inviteError}</p>
              ) : null}
            </div>
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setInviteOpen(false);
                  setInviteError(null);
                  setInviteLink(null);
                }}
              >
                Close
              </Button>
              <Button size="sm" onClick={handleSendInvite} disabled={inviteSending}>
                {inviteSending ? "Creating..." : "Create invite"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {showSignupPrompt && activePanel !== "settings" ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          data-testid="setup-required-modal"
        >
          <div className="w-full max-w-md space-y-3 rounded-lg border border-border/60 bg-card p-4 shadow-xl">
            <div className="space-y-1">
              <p className="text-base font-semibold">
                Finish setup to personalize HAVI
              </p>
              <p className="text-sm text-muted-foreground">
                Add child details so HAVI can personalize guidance and reminders.
              </p>
            </div>
            {missingProfileFields.length ? (
              <p className="text-xs text-muted-foreground">
                Missing: {missingProfileFields.join(", ")}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                onClick={openSignupPanel}
                data-testid="finish-setup"
              >
                Finish setup
              </Button>
            </div>
          </div>
        </div>
      ) : null}
            </div>
          </section>
        </main>
      </div>

      {navOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close navigation overlay"
            className="absolute inset-0 bg-black/60"
            onClick={() => setNavOpen(false)}
          />
          <aside className="relative z-10 h-full w-72 border-r border-border/60 bg-sidebar p-4">
            <div className="flex items-center justify-between pb-4">
              <span className="text-sm font-semibold">HAVI</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setNavOpen(false)}
              >
                Close
              </Button>
            </div>
            <nav className="flex flex-col gap-1">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`nav-${item.id}`}
                  onClick={() => {
                    setActivePanel(item.id);
                    setNavOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition",
                    activePanel === item.id
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function describeActions(actions: Action[]): string {
  if (!actions.length) {
    return "Captured. I’ll keep an eye out for more detail.";
  }
  const summaries = actions.slice(0, 3).map((action) => {
    const when = new Date(action.timestamp).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
    switch (action.action_type) {
      case "activity": {
        const oz = action.metadata.amount_value
          ? `${action.metadata.amount_value} ${
              action.metadata.amount_unit ?? "units"
            }`
          : "activity";
        return action.note ? `${action.note}` : `${oz} at ${when}`;
      }
      case "sleep": {
        const mins = action.metadata.duration_minutes;
        if (mins && mins > 0) {
          return `Sleep ${Math.round(mins)} min ending ${when}`;
        }
        if (action.note) {
          return action.note;
        }
        return `Sleep event around ${when}`;
      }
      case "dirty_diaper_poop":
      case "dirty_diaper_pee":
      case "dirty_diaper_pee_and_poop":
        return `Diaper (${action.action_type
          .replace("dirty_diaper_", "")
          .replace(/_/g, " ")})`;
      case "bath":
        return `Bath around ${when}`;
      default:
        return `${action.action_type} at ${when}`;
    }
  });
  const tail = actions.length > 3 ? ` +${actions.length - 3} more` : "";
  return `Captured ${actions.length} event(s): ${summaries.join(", ")}${tail}.`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function formatVoiceTime(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${pad(mins)}:${pad(secs)}`;
}

function extractDateParts(value?: string | null): { year: number; month: number;
          day: number } | null {
  const str = value?.trim();
  if (!str) return null;
  const mmddyyyy = str.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (mmddyyyy) {
    const [, mm, dd, yyyy] = mmddyyyy;
    return { year: Number(yyyy), month: Number(mm), day: Number(dd) };
  }
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const [, yyyy, mm, dd] = iso;
    return { year: Number(yyyy), month: Number(mm), day: Number(dd) };
  }
  return null;
}

function formatDisplayDate(value?: string | null): string {
  const parts = extractDateParts(value);
  if (!parts) return value ?? "";
  return `${pad(parts.month)}-${pad(parts.day)}-${parts.year}`;
}

function parseDateToDate(value?: string | null): Date | null {
  const parts = extractDateParts(value);
  if (!parts) return null;
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function toApiDate(value: string): string | null {
  const parts = extractDateParts(value);
  if (!parts) return null;
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

// due_at is stored as an ISO timestamp; render it in the user's local time
// so the calendar day matches expectations (avoids off-by-one-day surprises).
function formatDueDateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function mapHomeEvent(event: HomeApiEvent): HomeEvent {
  const type = event.type as HomeEvent["type"];
  return {
    id: event.id,
    type: ["sleep", "bottle", "diaper", "activity", "growth"].includes(type)
      ? type
      : "activity",
    title: event.title,
    detail: event.detail ?? undefined,
    amountLabel: event.amount_label ?? undefined,
    start: event.start,
    end: event.end ?? undefined,
    originMessageId: event.origin_message_id
      ? String(event.origin_message_id)
      : undefined,
  };
}

function buildTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function formatHomeAgeLabel(dob: string, dueDate: string): string {
  const birth = parseDateToDate(dob);
  const due = parseDateToDate(dueDate);
  const anchor = birth ?? due;
  if (!anchor) return "Age not set";
  const now = new Date();
  const diffDays = Math.floor(
    (now.getTime() - anchor.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (!birth && diffDays < 0) {
    const weeks = Math.max(1, Math.ceil(Math.abs(diffDays) / 7));
    return `Due in ${weeks} ${weeks === 1 ? "week" : "weeks"}`;
  }
  const weeks = Math.max(1, Math.floor(Math.abs(diffDays) / 7));
  return `${weeks} ${weeks === 1 ? "week" : "weeks"} old`;
}

function filterEventsByWindow(events: HomeEvent[], hours: number): HomeEvent[] {
  const now = Date.now();
  const windowMs = hours * 60 * 60 * 1000;
  return events.filter((event) => {
    const time = new Date(event.start).getTime();
    return Number.isNaN(time) ? false : now - time <= windowMs;
  });
}

function formatEventTypeLabel(type: HomeEvent["type"]): string {
  switch (type) {
    case "sleep":
      return "Sleep";
    case "bottle":
      return "Feeds";
    case "diaper":
      return "Diapers";
    case "growth":
      return "Growth";
    case "activity":
    default:
      return "Activities";
  }
}

function formatEventWindow(events: HomeEvent[]): string {
  if (!events.length) return "";
  const times = events
    .map((event) => new Date(event.start))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  if (!times.length) return "";
  const start = times[0];
  const end = times[times.length - 1];
  const formatter = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  });
  if (start.toDateString() === end.toDateString()) {
    return formatter.format(start);
  }
  return `${formatter.format(start)}–${formatter.format(end)}`;
}

function countEventTypes(events: HomeEvent[]): Record<HomeEvent["type"], number> {
  return events.reduce(
    (acc, event) => {
      acc[event.type] += 1;
      return acc;
    },
    { sleep: 0, bottle: 0, diaper: 0, activity: 0, growth: 0 },
  );
}

function buildChapterSummary(events: HomeEvent[]): string {
  if (!events.length) return "";
  const uniqueDays = new Set(
    events
      .map((event) => new Date(event.start))
      .filter((date) => !Number.isNaN(date.getTime()))
      .map((date) => date.toDateString()),
  );
  const typeCounts = countEventTypes(events);
  const activeTypes = (Object.keys(typeCounts) as HomeEvent["type"][]).filter(
    (type) => typeCounts[type] > 0,
  );
  const typeLabels = activeTypes.map(formatEventTypeLabel);
  const typeSummary = typeLabels.length
    ? `${typeLabels.slice(0, 3).join(" + ")}`
    : `${events.length} events`;
  const dayCount = uniqueDays.size || 1;
  return `${typeSummary} logged over ${dayCount} ${dayCount === 1 ? "day" : "days"}`;
}

function buildLastSummary(event: HomeEvent): string {
  const detail = event.amountLabel || event.detail;
  return `Most recent: ${event.title}${detail ? ` ${detail}` : ""}`;
}

function buildChapterSeedMessage(events: HomeEvent[], childName: string): string {
  const windowLabel = formatEventWindow(events);
  const typeCounts = countEventTypes(events);
  const typeLines = (Object.keys(typeCounts) as HomeEvent["type"][])
    .filter((type) => typeCounts[type] > 0)
    .map((type) => `${formatEventTypeLabel(type)}: ${typeCounts[type]}`);
  return [
    `Recent summary (Last chapter) for ${childName}:`,
    windowLabel ? `- Window: ${windowLabel}` : null,
    typeLines.length ? `- Events: ${typeLines.join(", ")}` : null,
    "- Based on what you logged.",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildLastSeedMessage(event: HomeEvent, childName: string): string {
  const timeLabel = new Date(event.start).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const detail = event.amountLabel || event.detail;
  return [
    `Recent summary (Last) for ${childName}:`,
    `- Event: ${event.title}${detail ? ` (${detail})` : ""}`,
    `- Time: ${timeLabel}`,
    "- Based on what you logged.",
  ].join("\n");
}

function buildComingUpSeedMessage(week: number, childName: string): string {
  return [
    `What to expect next for ${childName}:`,
    `- Age window: Week ${week}`,
    "- Based on what you logged.",
  ].join("\n");
}

function EditableField({
  label,
  value,
  onChange,
  placeholder,
  testId,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  testId?: string;
}) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <input
        className="mt-1 havi-input"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        data-testid={testId}
      />
    </div>
  );
}

function formatAdjustedAge(dob: string, dueDate: string): string {
  const birth = parseDateToDate(dob);
  const due = parseDateToDate(dueDate);
  if (birth && due) {
    const now = new Date();
    const diffMs = now.getTime() - birth.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const years = Math.floor(diffDays / 365);
    const days = diffDays % 365;
    const adjustedDiffDays = Math.floor(
      (now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24),
    );
    return `${years}y ${days}d (adjusted ${Math.max(adjustedDiffDays, 0)}d)`;
  }
  const anchor = birth ?? due;
  if (!anchor) {
    return "—";
  }
  const now = new Date();
  const diffDays = Math.floor(
    (now.getTime() - anchor.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays < 0) {
    const weeks = Math.max(1, Math.ceil(Math.abs(diffDays) / 7));
    return `Due in ${weeks}w`;
  }
  const weeks = Math.max(1, Math.floor(diffDays / 7));
  const days = diffDays % 7;
  return `${weeks}w ${days}d`;
}

function computeWeekFromDob(dateStr: string): number | null {
  const date = parseDateToDate(dateStr);
  if (!date) return null;
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  if (diff < 0) return null;
  return Math.max(1, Math.floor(diff / (1000 * 60 * 60 * 24 * 7)));
}
