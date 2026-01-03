"use client";

import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Copy, Menu, Mic, Share2, Square } from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { TimelinePanel } from "@/components/timeline/timeline-panel";
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
import { cn } from "@/lib/utils";

const CHAT_BODY_TEXT = "text-sm leading-relaxed font-normal";

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

type ConversationSession = {
  id: number;
  title: string;
  is_active: boolean;
  last_message_at: string;
};

type InferenceCard = {
  id: number;
  inference_type: string;
  payload: Record<string, unknown>;
  confidence: number;
  created_at: string;
};

type TaskItem = {
  id: number;
  title: string;
  status: "open" | "done";
  due_at?: string | null;
  created_at: string;
  user_id?: number | null;
  child_id?: number | null;
  created_by_user_id?: number | null;
  assigned_to_user_id?: number | null;
  assigned_to_name?: string | null;
};

const filterTasksByAssignee = (
  tasks: TaskItem[],
  filter: "all" | "me" | "others",
  currentUserId: number | null,
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
  currentUserId: number | null,
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
  session_id?: number;
  user_message_id?: number;
  assistant_message_id?: number;
  intent?: string;
};

type ChatEntry = {
  id: string;
  role: "user" | "havi";
  text: string;
  messageId?: string;
  createdAt: string;
  senderType?: "self" | "assistant" | "caregiver";
  senderName?: string;
};

type SpeechRecognitionEventLike = {
  results: Array<{
    0: {
      transcript: string;
    };
  }>;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: () => void;
  onerror: () => void;
  onresult: (event: SpeechRecognitionEventLike) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionGlobal = {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

type Panel =
  | "havi"
  | "timeline"
  | "tasks"
  | "history"
  | "knowledge"
  | "integrations"
  | "settings";

type ChipTemplate = {
  id: string;
  label: string;
  text: string;
  requiresHistory?: boolean;
  onlyWhenNoHistory?: boolean;
  requiresSymptom?: boolean;
  requiresProfile?: boolean;
  requiresRoutine?: boolean;
};

const chipLibrary: ChipTemplate[] = [
  {
    id: "diaper_now",
    label: "Changed a dirty diaper",
    text: "I just changed a dirty diaper for {child}—please log it.",
  },
  {
    id: "bath_wrap",
    label: "Finished bath routine",
    text: "{child} just finished a bath and diaper change about 10 minutes ago.",
  },
  {
    id: "feed_combo",
    label: "Feed and diaper change 10 minutes ago",
    text: "Finished a feed and diaper change for {child} about 10 minutes ago.",
  },
  {
    id: "symptom_followup",
    label: "Cough check-in",
    text: "{child} has a cough—what should I watch for?",
    requiresSymptom: true,
  },
  {
    id: "milestones_today",
    label: "What’s Ahead Today",
    text: "Tell me about the next milestone for {child}.",
    requiresProfile: true,
  },
  {
    id: "week_intro",
    label: "What happens in week {week}?",
    text: "What development milestones are expected for week {week}?",
    onlyWhenNoHistory: true,
    requiresProfile: true,
  },
  {
    id: "routine_setup",
    label: "Routine setup",
    text: "Can you help me build a routine for {child} based on recent days?",
    requiresRoutine: true,
  },
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

const LOADING_MESSAGES: Record<
  LoadingCategory,
  { short: string; rich: string[] }
> = {
  generic: {
    short: "Havi is on it…",
    rich: [
      "I’m taking a moment to review what you just shared.",
      "Let me pull a clear, calm answer together for you.",
    ],
  },
  sleep: {
    short: "Havi is on it…",
    rich: [
      "I’m reviewing recent naps, wake windows, and bedtime notes.",
      "I’m lining up what’s typical for babies this age and sleep patterns like yours.",
    ],
  },
  routine: {
    short: "Havi is on it…",
    rich: [
      "I’m checking recent feeds, diapers, and patterns to see what stands out.",
      "I’m reviewing your baby’s recent days to spot any trends.",
    ],
  },
  health: {
    short: "Havi is on it…",
    rich: [
      "I'm comparing what you shared with common patterns for babies this age.",
      "I'm organizing what might be normal, what to watch, and when to call your doctor.",
    ],
  },
};

const CHIP_CATEGORY_HINTS: Record<string, LoadingCategory> = {
  milestones_today: "sleep",
  week_intro: "sleep",
  routine_setup: "routine",
  symptom_followup: "health",
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";
const DEMO_CHILD_NAME = process.env.NEXT_PUBLIC_CHILD_NAME ?? "baby";
const DEFAULT_TIMEZONE = "America/Los_Angeles";

const newId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

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
    ref.current.style.height = "0px";
    ref.current.style.height = `${ref.current.scrollHeight}px`;
  };

  useEffect(() => {
    resize();
  }, [props.value]);

  return (
    <Textarea
      ref={ref}
      {...props}
      className={cn(
        "min-h-[52px] resize-none bg-card placeholder:text-muted-foreground placeholder:opacity-80",
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

export default function Home() {
  const [message, setMessage] = useState("");
  const [chatEntries, setChatEntries] = useState<ChatEntry[]>([]);
  const [activePanel, setActivePanel] = useState<Panel>("havi");
  const [navOpen, setNavOpen] = useState(false);
  const [conversationState, setConversationState] =
    useState<ConversationState>("idle");
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);
  const [scrollViewport, setScrollViewport] = useState<HTMLDivElement | null>(
    null,
  );
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const [primaryChildId, setPrimaryChildId] = useState<string>("demo-child");
  const [activeChildId, setActiveChildId] = useState<string | null>(null);
  const [activeChildName, setActiveChildName] =
    useState<string>(DEMO_CHILD_NAME);
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
  const activeSessionIdRef = useRef<number | null>(null);
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
  const shareTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const [knowledgeToast, setKnowledgeToast] = useState<string | null>(null);
  const [expandedInferences, setExpandedInferences] = useState<Set<number>>(
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
  const [tasksView, setTasksView] = useState<
    "all" | "open" | "scheduled" | "unscheduled" | "completed"
  >("open");
  const [tasksAssigneeFilter, setTasksAssigneeFilter] = useState<
    "all" | "me" | "others"
  >("all");
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [taskDetailTitle, setTaskDetailTitle] = useState("");
  const [taskDetailDueDate, setTaskDetailDueDate] = useState<string>("");
  const [taskDetailDueTime, setTaskDetailDueTime] = useState<string>("");
  const [taskSaving, setTaskSaving] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  const [relationship, setRelationship] = useState("Mom");
  const [caregiverFirstName, setCaregiverFirstName] = useState("Alex");
  const [caregiverLastName, setCaregiverLastName] = useState("Davis");
  const [caregiverPhone, setCaregiverPhone] = useState("(555) 555-1212");
  const [caregiverEmail, setCaregiverEmail] = useState("alex@example.com");
  const [childFirstName, setChildFirstName] = useState("Lev");
  const [childLastName, setChildLastName] = useState("Davis");
  const [currentUserId, setCurrentUserId] = useState<number | null>(1);
  const [currentUserName, setCurrentUserName] = useState<string>("Alex Davis");
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
  const [childDob, setChildDob] = useState("05-01-2024");
  const [childDueDate, setChildDueDate] = useState("05-07-2024");
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
    chipLibrary.slice(0, 4),
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
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const agentCards = useMemo(
    () => [
      {
        id: "remind-agent",
        name: "Remind Agent",
        icon: "⏰",
        shortDescription: "Set lightweight reminders that stay visible.",
        longDescription:
          "Capture quick reminders and keep them handy across chat and daily routines.",
        createdBy: "Havi",
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
        createdBy: "Havi",
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
        createdBy: "Havi",
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
        createdBy: "Havi",
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
        createdBy: "Havi",
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
        createdBy: "Havi",
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

  const timelineChildOptions = useMemo(
    () =>
      activeChildId
        ? [
            {
              id: activeChildId,
              name: activeChildName || childFirstName || DEMO_CHILD_NAME,
            },
          ]
        : [],
    [activeChildId, activeChildName, childFirstName],
  );

  useEffect(() => {
    setActiveChildName(childFirstName || DEMO_CHILD_NAME);
  }, [childFirstName]);
  useEffect(() => {
    setChatEntries((prev) =>
      prev.length
        ? prev
        : [
            {
              id: newId(),
              role: "havi",
              text: `Hi! I can log ${DEMO_CHILD_NAME}'s day, tell you what's expe
          cted, or compare to yesterday.`,
              createdAt: new Date().toISOString(),
              senderType: "assistant",
              senderName: "Havi",
            },
          ],
    );
  }, []);

  const fillTemplate = useCallback(
    (template: string) => {
      const childName = childFirstName?.trim() || DEMO_CHILD_NAME;
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

  const computeMissingExpectationFields = useCallback(() => {
    const missing: string[] = [];
    if (!childDob) missing.push("date of birth");
    if (!childGender) missing.push("gender");
    if (!childBirthWeight) missing.push("birth weight");
    if (!childLatestWeight || !childLatestWeightDate) {
      missing.push("latest weight + date");
    }
    if (!childDueDate) missing.push("due date");
    return missing;
  }, [
    childBirthWeight,
    childDob,
    childDueDate,
    childGender,
    childLatestWeight,
    childLatestWeightDate,
  ]);

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
      void fetch(`${API_BASE_URL}/api/v1/metrics/loading`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          session_id: activeSessionIdRef.current,
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
    const selection = filtered.length ? filtered.slice(0, 5) : chipLibrary.slice(
          0, 5);
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
      const childId =
        activeChildId && !Number.isNaN(Number(activeChildId))
          ? activeChildId
          : null;
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
        const res = await fetch(
          `${API_BASE_URL}/api/v1/sessions?child_id=${encodeURIComponent(childId)}`,
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
    if (activePanel === "history") {
      fetchHistory();
    }
  }, [activePanel, fetchHistory]);

  useEffect(() => {
    fetchHistory({ silent: true });
  }, [fetchHistory]);

  const loadInferences = useCallback(async () => {
    const childId =
      activeChildId && !Number.isNaN(Number(activeChildId))
        ? activeChildId
        : null;
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
      const res = await fetch(`${API_BASE_URL}/api/v1/inferences?${params}`);
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

  useEffect(() => {
    loadInferences();
  }, [loadInferences]);

  useEffect(() => {
    if (activePanel === "knowledge") {
      loadInferences();
    }
  }, [activePanel, loadInferences]);

  const loadTasks = useCallback(async () => {
    setTasksLoading(true);
    setTasksError(null);
    try {
      const views: Array<"open" | "scheduled" | "completed"> = [
        "open",
        "scheduled",
        "completed",
      ];
      const byId = new Map<number, TaskItem>();
      for (const view of views) {
        const params = new URLSearchParams({ view });
        if (activeChildId && !Number.isNaN(Number(activeChildId))) {
          params.append("child_id", activeChildId);
        }
        const res = await fetch(`${API_BASE_URL}/api/v1/tasks?${params}`);
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

  useEffect(() => {
    if (activePanel === "tasks") {
      loadTasks();
    }
  }, [activePanel, loadTasks]);

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    setSettingsError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/settings`);
      if (!res.ok) {
        throw new Error("Unable to load settings");
      }
      const data = await res.json();
      const caregiver = data.caregiver ?? {};
      const child = data.child ?? {};
      const nextChildId = child.id ? String(child.id) : null;
      setPrimaryChildId(nextChildId ?? "demo-child");
      setActiveChildId(nextChildId);
      setActiveChildName(child.first_name ?? DEMO_CHILD_NAME);
      setCaregiverFirstName(caregiver.first_name ?? "");
      setCaregiverLastName(caregiver.last_name ?? "");
      setCaregiverPhone(caregiver.phone ?? "");
      setCaregiverEmail(caregiver.email ?? "");
      setRelationship(caregiver.relationship ?? "");
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
      setCaregiverSnapshot({
        first_name: caregiver.first_name ?? "",
        last_name: caregiver.last_name ?? "",
        phone: caregiver.phone ?? "",
        email: caregiver.email ?? "",
        relationship: caregiver.relationship ?? "",
      });
      setChildSnapshot({
        first_name: child.first_name ?? "",
        last_name: child.last_name ?? "",
        birth_date: formatDisplayDate(child.birth_date ?? ""),
        due_date: formatDisplayDate(child.due_date ?? ""),
        gender: child.gender ?? "",
        birth_weight: child.birth_weight ? String(child.birth_weight) : "",
        birth_weight_unit: child.birth_weight_unit ?? "oz",
        latest_weight: child.latest_weight ? String(child.latest_weight) : "",
        latest_weight_date: formatDisplayDate(child.latest_weight_date ?? ""),
        timezone: child.timezone || DEFAULT_TIMEZONE,
      });
      setBirthStatus(child.birth_date ? "born" : "expected");
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Unknown error";
      setSettingsError(reason);
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

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
      const numericChildId = [activeChildId, primaryChildId]
        .map((val) => (val && !Number.isNaN(Number(val)) ? Number(val) : null))
        .find((val) => val !== null);
      if (numericChildId === null) {
        setHardErrorMessage("Select an active child before sending.");
        setConversationState("error_hard");
        return;
      }
      if (!activeChildId && primaryChildId && numericChildId !== null) {
        setActiveChildId(String(numericChildId));
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

      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/activities`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: textToSend,
            timezone,
            source: resolvedSource,
            child_id: numericChildId,
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
        activeSessionIdRef.current =
          data.session_id ?? activeSessionIdRef.current;
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
          senderName: "Havi",
        });
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
      fetchHistory,
      activeChildId,
      message,
      pendingCategoryHint,
      postClientMetrics,
      questionCategory,
      rotateChips,
      startLoadingTimer,
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

  const handleActiveChildChange = useCallback((childId: string | null, childName?
          : string) => {
    setActiveChildId(childId);
    if (childName) {
      setActiveChildName(childName);
    }
  }, []);

  const handleReopenSession = useCallback(
    async (sessionId: number) => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/sessions/${sessionId}/reo
          pen`, {
          method: "POST",
        });
        if (!res.ok) throw new Error("Unable to reopen session");
        fetchHistory();
      } catch (err) {
        const reason = err instanceof Error ? err.message : "Unknown error";
        setHistoryError(reason);
      }
    },
    [fetchHistory],
  );

  const handleCompleteTask = useCallback(
    async (taskId: number, targetStatus: "open" | "done" = "done") => {
      setTasksError(null);
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, status: targetStatus } : t,
        ),
      );
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: targetStatus }),
        });
        if (!res.ok) throw new Error("Unable to update task");
      } catch (err) {
        const reason = err instanceof Error ? err.message : "Unknown error";
        setTasksError(reason);
        loadTasks();
      }
    },
    [loadTasks],
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
      const res = await fetch(`${API_BASE_URL}/api/v1/tasks/${selectedTask.id}`,
          {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
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
  }, [API_BASE_URL, closeTaskDetails, loadTasks, selectedTask, taskDetailDueDate, taskDetailDueTime, taskDetailTitle]);

  const handleInferenceAction = useCallback(
    async (inferenceId: number, status: "confirmed" | "rejected") => {
      setInferenceError(null);
      const previous = inferenceCards;
      setInferenceCards((cards) =>
        cards.filter((card) => card.id !== inferenceId),
      );
      const toastText = status === "confirmed" ? "Saved." : "Dismissed.";
      if (knowledgeToastTimerRef.current) {
        clearTimeout(knowledgeToastTimerRef.current);
      }
      setKnowledgeToast(toastText);
      knowledgeToastTimerRef.current = setTimeout(
        () => setKnowledgeToast(null),
        1500,
      );
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/v1/inferences/${inferenceId}/status?status=${status}`,
          { method: "POST" },
        );
        if (!res.ok) throw new Error("Failed to update insight");
      } catch (err) {
        const reason = err instanceof Error ? err.message : "Unknown error";
        setInferenceError(reason);
        setInferenceCards(previous);
        setKnowledgeToast(null);
      }
    },
    [API_BASE_URL, inferenceCards],
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
              "To personalize expectations, I’ll need date of birth, gender, birth weight, latest weight + date, and due date. Share them here or add everything in Settings.",
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

  const handleOpenTimelineMessage = useCallback((messageId: string) => {
    setActivePanel("havi");
    setFocusedMessageId(messageId);
  }, []);

  const handleShareConversation = useCallback(async () => {
    try {
      const sessionId = activeSessionIdRef.current ?? sessions[0]?.id;
      if (!sessionId) {
        setShareMessage("No conversation to share yet.");
        return;
      }
      const res = await fetch(`${API_BASE_URL}/api/v1/share/conversation`, {
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
      await navigator.clipboard.writeText(url);
      setShareMessage("Copied");
      if (shareTimerRef.current) {
        clearTimeout(shareTimerRef.current);
      }
      shareTimerRef.current = setTimeout(() => setShareMessage(null), 1500);
    } catch (err) {
      const reason =
        err instanceof Error ? err.message : "Unable to share right now.";
      setShareMessage(reason);
      if (shareTimerRef.current) {
        clearTimeout(shareTimerRef.current);
      }
      shareTimerRef.current = setTimeout(() => setShareMessage(null), 2500);
    }
  }, [sessions]);

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
    if (!validateDate(childLatestWeightDate)) {
      nextFieldErrors.childLatestWeightDate =
        "Enter a valid date in MM-DD-YYYY format.";
    }
    if (Object.keys(nextFieldErrors).length) {
      setFieldErrors(nextFieldErrors);
      setSettingsSaving(false);
      return;
    }
    setFieldErrors({});
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/settings`, {
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
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Unknown error";
      setSettingsError(reason);
    } finally {
      setSettingsSaving(false);
    }
  }, [
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

  useEffect(() => {
    return () => {
      if (settingsSuccessTimerRef.current) {
        clearTimeout(settingsSuccessTimerRef.current);
      }
    };
  }, []);

  if (!hydrated) {
    return null;
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[390px] flex-col gap-
          4 bg-background px-4 py-6">
      <div>
        <button
          type="button"
          className="text-left"
          onClick={() => {
            setActivePanel("havi");
            setNavOpen(false);
          }}
          aria-label="Back to Havi chat"
        >
          <h1 className="text-3xl font-bold tracking-[0.35em] text-muted-foregrou
          nd">HAVI</h1>
        </button>
        <p className="mt-1 text-sm text-muted-foreground">
          Log events, ask what&apos;s expected, or compare recent days—one chat,
          zero friction.
        </p>
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setNavOpen((prev) =>
           !prev)}>
            <Menu className="mr-2 h-4 w-4" />
            Menu
          </Button>
        </div>
        {navOpen ? (
          <div className="mt-2 w-48 rounded-lg border border-border/40 bg-card/90
           p-3 text-sm shadow-lg">
            {[
              { id: "havi" as Panel, label: "Havi" },
              { id: "timeline" as Panel, label: "Timeline" },
              { id: "tasks" as Panel, label: "Tasks" },
              { id: "history" as Panel, label: "History" },
              { id: "knowledge" as Panel, label: "Knowledge" },
              { id: "integrations" as Panel, label: "Integrations" },
              { id: "settings" as Panel, label: "Settings" },
            ].map((item) => (
              <button
                key={item.id}
                className={cn(
                  "w-full rounded-md px-2 py-1 text-left hover:bg-muted",
                  activePanel === item.id && "bg-muted/60",
                )}
                onClick={() => {
                  setActivePanel(item.id);
                  setNavOpen(false);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {networkOffline ? (
        <div className="rounded-md border border-amber-500/50 bg-amber-950/40 px-
          3 py-2 text-sm text-amber-100">
          <p>It looks like we’re offline. Please check your connection and tap re
          try.</p>
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                if (typeof navigator === "undefined" || navigator.onLine) {
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
          </div>
        </div>
      ) : null}

      {activePanel === "timeline" ? (
        <Card className="bg-card/70 backdrop-blur">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Timeline</CardTitle>
            <CardDescription className="text-muted-foreground">
              Review events for {childFirstName || DEMO_CHILD_NAME}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TimelinePanel
              key={activeChildId ?? primaryChildId}
              childName={activeChildName || childFirstName || DEMO_CHILD_NAME}
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
        <Card className="bg-card/70 backdrop-blur">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Tasks</CardTitle>
            <CardDescription className="text-muted-foreground">
              Includes family tasks and items for the selected child.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
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
                      <p className="text-sm font-medium">{task.title}</p>
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
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/30
           md:items-stretch md:justify-end"
          onClick={closeTaskDetails}
        >
          <div
            className="w-full max-w-[420px] rounded-t-2xl border border-border/60
           bg-card p-4 shadow-xl md:h-full md:rounded-none md:rounded-l-2xl"
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
                  className="mt-1 w-full rounded-md border border-border/60 bg-ba
          ckground/70 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  value={taskDetailTitle}
                  onChange={(e) => setTaskDetailTitle(e.target.value)}
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Due</p>
                <div className="mt-1 space-y-2">
                  <div>
                    <p className="text-[11px] text-muted-foreground">Date</p>
                    <input
                      type="date"
                      className="mt-1 w-full rounded-md border border-border/60 bg-ba
          ckground/70 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                      value={taskDetailDueDate}
                      onChange={(e) => setTaskDetailDueDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">Time</p>
                    <input
                      type="time"
                      className="mt-1 w-full rounded-md border border-border/60 bg-ba
          ckground/70 px-3 py-2 text-sm focus:border-primary focus:outline-none"
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
              <Button size="sm" onClick={saveTaskDetails} disabled={taskSaving ||
           !taskDetailTitle.trim()}>
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
        <Card className="bg-card/70 backdrop-blur">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Chat history</CardTitle>
            <CardDescription className="text-muted-foreground">
              Recent conversations auto-titled by Havi.
            </CardDescription>
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
                    className="flex items-center justify-between rounded-md borde
          r border-border/40 p-2"
                  >
                    <div>
                      <p className="font-medium">{session.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(session.last_message_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "text-[11px] uppercase tracking-wide",
                          session.is_active
                            ? "text-emerald-300"
                            : "text-muted-foreground",
                        )}
                      >
                        {session.is_active ? "active" : "archived"}
                      </span>
                      {!session.is_active ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleReopenSession(session.id)}
                        >
                          Resume
                        </Button>
                      ) : null}
                    </div>
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
        <Card className="bg-card/70 backdrop-blur">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Havi remembers</CardTitle>
            <CardDescription className="text-muted-foreground">
              Confirm or edit what Havi is learning.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {inferenceLoading ? (
              <p className="text-sm text-muted-foreground">Loading cards…</p>
            ) : inferenceError ? (
              <div className="text-sm text-destructive">{inferenceError}</div>
            ) : inferenceCards.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending insights ri
          ght now.</p>
            ) : (
              <div className="space-y-3">
                {inferenceCards.map((card) => {
                  const meta = inferenceMetaFor(card.inference_type, card.payload);
                  const expanded = expandedInferences.has(card.id);
                  return (
                      <div
                        key={card.id}
                        className="space-y-2 rounded-lg border border-border/50 bg-background/70 p-4"
                      >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">{meta.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {meta.summary}
                          </p>
                        </div>
                        <span className="rounded-full bg-muted px-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                          Pending
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="flex-1"
                          onClick={() =>
                            handleInferenceAction(card.id, "confirmed")
                          }
                        >
                          Confirm
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() =>
                            handleInferenceAction(card.id, "rejected")
                          }
                        >
                          Reject
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
        <Card className="bg-card/80 shadow-lg">
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
                        onClick={() => setInviteOpen(true)}
                      >
                        Invite
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="hidden md:inline-flex"
                        onClick={() => setShowCaregiverForm((prev) => !prev)}
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
                        />
                        <EditableField
                          label="Last Name"
                          value={caregiverLastName}
                          onChange={(val) => setCaregiverLastName(val)}
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
                            className="mt-1 w-full rounded-md border border-border/60 bg-background/70 p-2 text-sm"
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
                </section>

                <section className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap
          -2">
                    <div>
                      <p className="text-sm font-semibold">Children</p>
                      <p className="text-xs text-muted-foreground">Keep key detai
          ls up to date.</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="hidden md:inline-flex"
                      onClick={() => setShowChildForm((prev) => !prev)}
                    >
                      {showChildForm ? "Close" : "Edit"}
                    </Button>
                  </div>
                  <div className="rounded-md border border-border/50 bg-backgroun
          d/60 p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between g
          ap-2">
                      <div>
                        <p className="font-semibold text-foreground">
                          {childFirstName || childLastName ? `${childFirstName} $
          {childLastName}`.trim() : "Child profile"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {childDob
                            ? `DOB: ${childDob}`
                            : childDueDate
                              ? `Due: ${childDueDate}`
                              : "Add birth or due date"}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-
          foreground">
                        <span>{childTimezone || DEFAULT_TIMEZONE}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="px-2 text-xs underline md:hidden"
                          onClick={() => setShowChildForm((prev) => !prev)}
                        >
                          {showChildForm ? "Close" : "Edit"}
                        </Button>
                      </div>
                    </div>
                  </div>
                  {showChildForm ? (
                    <div className="space-y-2 rounded-md border border-border/60
          bg-background/70 p-3">
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
                          onClick={() => setBirthStatus("born")}
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
                            setChildDob("");
                          }}
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
                            Gender (optional)
                          </p>
                          <select
                            className="mt-1 w-full rounded-md border border-border/40 bg-background/60 p-2 text-sm"
                            value={childGender}
                            onChange={(event) =>
                              setChildGender(event.target.value)
                            }
                          >
                            <option value="">Select</option>
                            <option value="boy">Boy</option>
                            <option value="girl">Girl</option>
                            <option value="nonbinary">Non-binary</option>
                            <option value="prefer_not_say">
                              Prefer not to say
                            </option>
                          </select>
                        </div>
                        <EditableField
                          label="Birth Weight (optional)"
                          value={childBirthWeight}
                          onChange={(val) => setChildBirthWeight(val)}
                          placeholder="e.g., 7.5"
                        />
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
                            className="w-full rounded-md border border-border/40 bg-background/60 px-2 py-2 text-sm"
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
          <Card className="flex-1 bg-card/70 backdrop-blur">
            <CardHeader className="flex items-start justify-between pb-2">
              <div>
                <CardTitle className="text-base">Conversation</CardTitle>
                <CardDescription className="text-muted-foreground">
                  Havi blends logging and coaching into one stream.
                </CardDescription>
              </div>
              <div className="relative">
                <Button
                  size="icon"
                  variant="outline"
                  disabled={!shareEnabled}
                  title={
                    shareEnabled
                      ? "Copy a shareable link."
                      : "Start a chat to enable sharing."
                  }
                  onClick={() => void handleShareConversation()}
                  aria-label="Share conversation"
                >
                  <Share2 className="h-4 w-4" />
                </Button>
                {shareMessage ? (
                  <span className="absolute left-1/2 top-full z-10 -translate-x-1/2 mt-1 rounded-md bg-popover px-2 py-1 text-xs text-muted-foreground shadow">
                    Copied
                  </span>
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

          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {/* TODO: Compare-day chips removed until proper implementation returns results reliably. */}
              {chipTemplates.map((chip) => (
                <Button
                  key={chip.id}
                  variant="outline"
                  size="sm"
                  onClick={() => handleChip(chip)}
                >
                  {renderChipLabel(chip)}
                </Button>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-card/70 px-2 py-2">
                <div className="flex-1">
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
                      placeholder="Ask and track anything…"
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                      onKeyDown={handleKeyDown}
                      disabled={isComposerLocked || voiceState !== "idle"}
                      className="flex-1 bg-transparent"
                      inputRef={composerRef}
                    />
                  )}
                </div>
                <Button
                  type="button"
                  aria-label={
                    voiceState === "recording" ? "Stop recording" : "Record voice"
                  }
                  variant="outline"
                  size="icon"
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
                >
                  {voiceState === "recording" ? (
                    <Square className="h-4 w-4" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  type="button"
                  aria-label="Send message"
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

            {settingsSuccess ? (
              <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
                <div className="pointer-events-auto rounded-md border border-emerald-500/40 bg-emerald-900/30 px-4 py-2 text-sm text-emerald-50 shadow-lg">
                  {settingsSuccess}
                </div>
              </div>
            ) : null}
            {knowledgeToast ? (
              <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
                <div className="pointer-events-auto rounded-md border border-primary/40 bg-primary/15 px-4 py-2 text-sm text-primary shadow-lg">
                  {knowledgeToast}
                </div>
              </div>
            ) : null}
      {inviteOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-sm space-y-3 rounded-lg border border-border/60 bg-card p-4 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-base font-semibold">Invite a caregiver</p>
                <p className="text-sm text-muted-foreground">
                  Send a quick invite to join this care team.
                </p>
              </div>
              <button
                type="button"
                className="text-sm text-muted-foreground"
                onClick={() => setInviteOpen(false)}
                aria-label="Close invite dialog"
              >
                ✕
              </button>
            </div>
            <div className="space-y-2">
              <div>
                <p className="text-[11px] text-muted-foreground">Email</p>
                <input
                  className="mt-1 w-full rounded-md border border-border/50 bg-background/70 px-2 py-1 text-sm"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  type="email"
                  placeholder="caregiver@example.com"
                />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Role</p>
                <select
                  className="mt-1 w-full rounded-md border border-border/50 bg-background/70 p-2 text-sm"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                >
                  {["Parent", "Grandparent", "Nanny", "Relative", "Other"].map(
                    (role) => (
                      <option key={role}>{role}</option>
                    ),
                  )}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setInviteOpen(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  console.log("Invite caregiver", { inviteEmail, inviteRole });
                  setInviteOpen(false);
                  setInviteEmail("");
                  setInviteRole("Parent");
                }}
              >
                Send invite
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
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

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// due_at is stored as an ISO timestamp; render it in the user's local time
// so the calendar day matches expectations (avoids off-by-one-day surprises).
function formatDueDateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function EditableField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <input
        className="mt-1 w-full rounded-md border border-border/60 bg-background/70 px-3 py-2 text-sm focus:border-primary focus:outline-none"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function MessageBubble({
  entry,
  onToggleTimestamp,
  isPinned,
  onCopy,
  copiedMessageId,
  highlightedMessageId,
}: {
  entry: ChatEntry;
  onToggleTimestamp: (id: string) => void;
  isPinned: boolean;
  onCopy: (text: string, id: string) => void;
  copiedMessageId: string | null;
  highlightedMessageId: string | null;
}) {
  const createdAt = entry.createdAt ?? new Date().toISOString();
  const senderType =
    entry.senderType ?? (entry.role === "havi" ? "assistant" : "self");
  const isSelf = senderType === "self";
  const isAssistant = senderType === "assistant";
  const isCaregiver = senderType === "caregiver";
  const showTimestamp = isPinned;
  const bubbleMaxWidth = { maxWidth: "min(520px, 82%)" };
  const isHighlighted =
    entry.messageId && entry.messageId === highlightedMessageId;

  const markdownComponents: Components = {
    p: ({ node: _node, className, ...props }) => (
      <p
        className={cn("mb-3 leading-relaxed last:mb-0", className)}
        {...props}
      />
    ),
    h1: ({ node: _node, className, ...props }) => (
      <h1
        className={cn("mb-2 mt-1 text-base font-semibold", className)}
        {...props}
      />
    ),
    h2: ({ node: _node, className, ...props }) => (
      <h2
        className={cn("mb-2 mt-1 text-sm font-semibold", className)}
        {...props}
      />
    ),
    h3: ({ node: _node, className, ...props }) => (
      <h3
        className={cn("mb-2 mt-1 text-[13px] font-semibold", className)}
        {...props}
      />
    ),
    ul: ({ node: _node, className, ...props }) => (
      <ul
        className={cn("mb-3 ml-5 list-disc space-y-1 last:mb-0", className)}
        {...props}
      />
    ),
    ol: ({ node: _node, className, ...props }) => (
      <ol
        className={cn("mb-3 ml-5 list-decimal space-y-1 last:mb-0", className)}
        {...props}
      />
    ),
    li: ({ node: _node, className, ...props }) => (
      <li className={cn("leading-relaxed", className)} {...props} />
    ),
    a: ({ node: _node, className, ...props }) => (
      <a
        className={cn("text-primary underline underline-offset-2", className)}
        {...props}
      />
    ),
    table: ({ node: _node, className, ...props }) => (
      <div className="mb-3 overflow-x-auto">
        <table
          className={cn("min-w-full border-collapse text-sm", className)}
          {...props}
        />
      </div>
    ),
    thead: ({ node: _node, className, ...props }) => (
      <thead className={cn("border-b border-border/80", className)} {...props} />
    ),
    th: ({ node: _node, className, ...props }) => (
      <th
        className={cn("px-2 py-1 text-left font-semibold", className)}
        {...props}
      />
    ),
    td: ({ node: _node, className, ...props }) => (
      <td
        className={cn("border-b border-border/60 px-2 py-1 align-top", className)}
        {...props}
      />
    ),
    code: (codeProps) => {
      const { inline, className, children, ...props } = codeProps as {
        inline?: boolean;
        className?: string;
        children?: React.ReactNode;
      };
      if (inline) {
        return (
          <code
            className={cn(
              "rounded bg-muted/60 px-1 py-[2px] text-[12px]",
              className,
            )}
            {...props}
          >
            {children}
          </code>
        );
      }
      return (
        <code
          className={cn("text-[12px] leading-relaxed", className)}
          {...props}
        >
          {children}
        </code>
      );
    },
    pre: ({ node: _node, className, ...props }) => (
      <pre
        className={cn(
          "mb-3 overflow-x-auto rounded bg-muted/40 p-3 text-[12px]",
          className,
        )}
        {...props}
      />
    ),
  };

  const bubbleClasses = cn(
    "relative rounded-lg px-3 py-2 ring-offset-2 group",
    isSelf
      ? "bg-primary/15 text-primary"
      : isAssistant
        ? "bg-muted/30 text-muted-foreground"
        : "bg-background/80 text-foreground border border-border/40",
    isHighlighted && "ring-2 ring-primary/40",
  );

  const gutter = (
    <div className="w-[28px] flex-shrink-0 flex items-start justify-center">
      {isAssistant ? (
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-
          full bg-muted/80 text-xs font-semibold text-foreground">
          H
        </span>
      ) : isCaregiver ? (
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-
          full bg-primary/10 text-[11px] font-semibold text-primary">
          {getInitials(entry.senderName ?? "Caregiver")}
        </span>
      ) : null}
    </div>
  );

  if (isSelf) {
    return (
      <div className="flex w-full justify-end">
        <div
          data-message-id={entry.messageId ?? undefined}
          className={bubbleClasses}
          style={bubbleMaxWidth}
        >
          <p className={cn("whitespace-pre-wrap pr-10", CHAT_BODY_TEXT)}>
            {entry.text}
          </p>
          {showTimestamp ? (
            <div className="mt-1 flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
              <button
                type="button"
                className="rounded px-1"
                onClick={() => onToggleTimestamp(entry.id)}
              >
                {isPinned ? "Hide time" : formatTimestamp(createdAt)}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full items-start gap-2">
      {gutter}
      <div className="flex flex-col" style={bubbleMaxWidth}>
        <div
          data-message-id={entry.messageId ?? undefined}
          className={bubbleClasses}
          style={{ width: "fit-content", maxWidth: "100%" }}
        >
          {isAssistant ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={markdownComponents}
              className={cn("pr-10", CHAT_BODY_TEXT)}
            >
              {entry.text}
            </ReactMarkdown>
          ) : (
            <p className={cn("whitespace-pre-wrap pr-10", CHAT_BODY_TEXT)}>
              {entry.text}
            </p>
          )}
          {showTimestamp ? (
            <div className="mt-1 flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
              <button
                type="button"
                className="rounded px-1"
                onClick={() => onToggleTimestamp(entry.id)}
              >
                {isPinned ? "Hide time" : formatTimestamp(createdAt)}
              </button>
              {entry.senderName ? (
                <span className="inline-flex items-center gap-1 rounded bg-background/60 px-2 py-1 text-[10px] uppercase">
                  {getInitials(entry.senderName)}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        {isAssistant ? (
          <div
            className={cn(
              "min-h-[28px] pt-2",
              "flex items-center gap-2",
              "supports-[hover:hover]:opacity-0 supports-[hover:hover]:pointer-events-none",
              "group-hover:supports-[hover:hover]:opacity-100 group-hover:supports-[hover:hover]:pointer-events-auto",
              "transition-opacity duration-150",
            )}
          >
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md bg-background/80 px-2 py-1 text-[11px] text-muted-foreground shadow-sm ring-1 ring-border/60 transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              onClick={() => onCopy(entry.text, entry.id)}
              aria-label="Copy message"
            >
              <Copy className="h-3 w-3" />
              <span>Copy</span>
            </button>
            {copiedMessageId === entry.id ? (
              <span className="text-[11px] text-primary">Copied</span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function formatAdjustedAge(dob: string, dueDate: string): string {
  const birth = parseDateToDate(dob);
  const due = parseDateToDate(dueDate);
  if (!birth || !due) {
    return "—";
  }
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

function computeWeekFromDob(dateStr: string): number | null {
  const date = parseDateToDate(dateStr);
  if (!date) return null;
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  if (diff < 0) return null;
  return Math.max(1, Math.floor(diff / (1000 * 60 * 60 * 24 * 7)));
}
