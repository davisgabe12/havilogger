"use client";

import { useEffect, useMemo, useState } from "react";
import { ActivitySquare, Droplets, Milk, Moon, Ruler } from "lucide-react";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { mockTimelineEvents } from "./timeline-data";
import {
  TimelineEvent,
  TimelineEventType,
  TimelineFilter,
  TimelineFilterId,
} from "./timeline-types";

const FILTERS: TimelineFilter[] = [
  { id: "all", label: "All" },
  // "feeding" is a synthetic filter that maps to bottle events.
  { id: "feeding" as TimelineFilterId, label: "Feeding" },
  { id: "bottle", label: "Bottle" },
  { id: "sleep", label: "Sleep" },
  { id: "diaper", label: "Diaper" },
  { id: "activity", label: "Activity" },
  { id: "growth", label: "Growth" },
];

const TYPE_LABELS: Record<TimelineEventType, string> = {
  sleep: "Sleep",
  bottle: "Bottle",
  diaper: "Diaper",
  activity: "Activity",
  growth: "Growth",
};

const TYPE_ICONS: Record<TimelineEventType, React.ElementType> = {
  sleep: Moon,
  bottle: Milk,
  diaper: Droplets,
  activity: ActivitySquare,
  growth: Ruler,
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

type TimelinePanelProps = {
  childName?: string;
  timezone?: string | null;
  events?: TimelineEvent[];
  childOptions?: { id: string; name: string }[];
  selectedChildId?: string | null;
  onChildChange?: (childId: string | null, childName?: string) => void;
  onOpenInChat?: (messageId: string) => void;
  refreshTrigger?: number;
};

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, amount: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + amount);
  return d;
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function filterEventsByType(
  events: TimelineEvent[],
  filterId: TimelineFilterId,
): TimelineEvent[] {
  if (filterId === "all") return events;
  if (filterId === ("feeding" as TimelineFilterId)) {
    return events.filter((event) => event.type === "bottle");
  }
  return events.filter((event) => event.type === filterId);
}

type TimelineApiEvent = {
  id: string;
  child_id: string;
  type: string;
  title: string;
  detail?: string;
  amount_label?: string;
  start: string;
  end?: string;
  has_note?: boolean;
  is_custom?: boolean;
  source?: string;
  origin_message_id?: string;
};

function mapApiEvent(event: TimelineApiEvent): TimelineEvent {
  const type = event.type as TimelineEventType;
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
    hasNote: event.has_note ?? false,
    isCustom: event.is_custom ?? false,
    source: (event.source as TimelineEvent["source"]) ?? undefined,
    originMessageId: event.origin_message_id
      ? String(event.origin_message_id)
      : undefined,
  };
}

function useTimelineEvents(
  childId: string | null,
  dayStart: Date | null,
  dayEnd: Date | null,
  refreshTrigger?: number,
) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    if (!dayStart || !dayEnd || !childId) {
      console.log("[Timeline] fetch skipped", { childId, dayStart, dayEnd });
      setEvents([]);
      setIsLoading(false);
      setIsError(false);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      setIsLoading(true);
      setIsError(false);
      try {
        console.log("[Timeline] fetch init", {
          childId,
          dayStart: dayStart?.toISOString(),
          dayEnd: dayEnd?.toISOString(),
        });
        const params = new URLSearchParams({
          start: dayStart!.toISOString(),
          end: dayEnd!.toISOString(),
        });
        params.append("child_id", childId as string);
        const response = await apiFetch(`${API_BASE_URL}/events?${params}`, {
          signal: controller.signal,
          childId,
        });
        if (!response.ok) {
          throw new Error("Failed to load events");
        }
        const payload: TimelineApiEvent[] = await response.json();
        if (!cancelled) {
          const mapped = payload.map(mapApiEvent);
          console.log("[Timeline] fetch success", {
            childId,
            count: mapped.length,
            start: dayStart!.toISOString(),
            end: dayEnd!.toISOString(),
            minStart: mapped[0]?.start,
            maxStart: mapped[mapped.length - 1]?.start,
          });
          setEvents(mapped);
        }
      } catch (error) {
        if (!cancelled && (error as Error).name !== "AbortError") {
          console.log("[Timeline] fetch error", {
            childId,
            error,
          });
          setEvents([]);
          setIsError(true);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [childId, dayStart, dayEnd, refreshTrigger]);

  return { events, isLoading, isError };
}

export function TimelinePanel({
  childName,
  timezone = "America/Los_Angeles",
  events: providedEvents,
  childOptions,
  selectedChildId,
  onChildChange,
  onOpenInChat,
  refreshTrigger = 0,
}: TimelinePanelProps) {
  const [selectedFilter, setSelectedFilter] = useState<TimelineFilterId>("all");

  const timeFormatter = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
        timeZone: timezone ?? undefined,
        timeZoneName: "short",
      });
    } catch {
      return new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
      });
    }
  }, [timezone]);

  const timezoneLabel = useMemo(() => {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone ?? undefined,
        timeZoneName: "short",
      }).formatToParts(new Date());
      return parts.find((part) => part.type === "timeZoneName")?.value ?? timezone ?? "";
    } catch {
      return timezone ?? "";
    }
  }, [timezone]);

  const memoChildOptions = useMemo(() => {
    if (childOptions && childOptions.length > 0) {
      return childOptions;
    }
    return [{ id: "demo-child", name: childName || "Demo child" }];
  }, [childOptions, childName]);

  const effectiveChildId =
    selectedChildId ?? memoChildOptions[0]?.id ?? null;

  const rangeEnd = useMemo(() => addDays(startOfDay(new Date()), 1), []);
  const rangeStart = useMemo(() => addDays(rangeEnd, -7), [rangeEnd]);

  const {
    events: apiEvents,
    isLoading,
    isError,
  } = useTimelineEvents(effectiveChildId, rangeStart, rangeEnd, refreshTrigger);

  const baseEvents = apiEvents.length > 0 ? apiEvents : providedEvents ?? [];

  const sortedEvents = useMemo(
    () =>
      [...baseEvents].sort(
        (a, b) => new Date(b.start).getTime() - new Date(a.start).getTime(),
      ),
    [baseEvents],
  );

  const visibleEvents = useMemo(
    () => filterEventsByType(sortedEvents, selectedFilter),
    [selectedFilter, sortedEvents],
  );

  const groupedEvents = useMemo(() => {
    const map = new Map<string, TimelineEvent[]>();
    visibleEvents.forEach((event) => {
      const dayKey = startOfDay(new Date(event.start)).toISOString();
      const bucket = map.get(dayKey) ?? [];
      bucket.push(event);
      map.set(dayKey, bucket);
    });
    return [...map.entries()]
      .sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime())
      .map(([key, events]) => ({
        dayKey: key,
        events: events.sort(
          (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
        ),
      }));
  }, [visibleEvents]);

  const formatTime = (value: string) => {
    try {
      return timeFormatter.format(new Date(value));
    } catch {
      return value;
    }
  };

  const formatRange = (event: TimelineEvent) => {
    if (!event.end) {
      return formatTime(event.start);
    }
    return `${formatTime(event.start)} – ${formatTime(event.end)}`;
  };

  const renderEventRows = () => {
    if (!effectiveChildId) {
      return (
        <p className="text-sm text-muted-foreground">
          Select a child to load events.
        </p>
      );
    }

    if (isLoading) {
      return (
        <p className="text-sm text-muted-foreground">Loading events…</p>
      );
    }

    if (!isLoading && sortedEvents.length === 0) {
      return (
        <p className="text-sm text-muted-foreground">
          No events logged yet.
        </p>
      );
    }

    if (visibleEvents.length === 0) {
      return (
        <p className="text-sm text-muted-foreground">
          No events logged for this filter yet.
        </p>
      );
    }

    return groupedEvents.map(({ dayKey, events }) => {
      const date = new Date(dayKey);
      const today = startOfDay(new Date());
      const yesterday = startOfDay(addDays(new Date(), -1));
      const label = isSameCalendarDay(date, today)
        ? "Today"
        : isSameCalendarDay(date, yesterday)
          ? "Yesterday"
          : new Intl.DateTimeFormat(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            }).format(date);
      return (
        <div key={dayKey} className="space-y-2">
          <div className="sticky top-0 z-10 bg-card/80 backdrop-blur py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
            {label}
          </div>
          <div className="space-y-2">
            {events.map((event) => {
              const Icon = TYPE_ICONS[event.type];
              const detailText =
                event.type === "diaper"
                  ? `${event.detail ?? "Diaper change"}${event.amountLabel ? ` • ${event.amountLabel}` : ""}`
                  : event.type === "bottle"
                    ? `${event.title}${event.amountLabel ? ` • ${event.amountLabel}` : ""}`
                    : event.detail ?? TYPE_LABELS[event.type];
              return (
                <div
                  key={event.id}
                  data-testid="timeline-event"
                  className="flex flex-col gap-2 rounded-lg border border-border/40 bg-background/70 px-3 py-2"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-1 rounded-full bg-muted/50 p-2 text-muted-foreground">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <div className="flex-1 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-foreground" data-testid="timeline-event-title">
                          {event.title}
                        </span>
                        <span className="text-xs text-muted-foreground" data-testid="timeline-event-time">
                          {formatRange(event)}
                        </span>
                      </div>
                      <div className="mt-1 text-muted-foreground">
                        <p>{detailText}</p>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {event.hasNote ? (
                          <span className="rounded-full bg-muted/50 px-2 py-0.5">
                            Note
                          </span>
                        ) : null}
                        {event.isCustom ? (
                          <span className="rounded-full bg-muted/50 px-2 py-0.5">
                            Custom
                          </span>
                        ) : null}
                        {event.source ? (
                          <span className="rounded-full bg-muted/30 px-2 py-0.5 capitalize">
                            {event.source}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-2 flex w-full justify-end">
                        <button
                          type="button"
                          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                          data-testid="timeline-event-open"
                          onClick={() => {
                            if (event.originMessageId && onOpenInChat) {
                              onOpenInChat(event.originMessageId);
                            }
                          }}
                        >
                          Open in chat →
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    });
  };

  return (
    <div className="flex flex-col gap-3" data-testid="timeline-panel">
      <div className="max-h-[520px] overflow-auto pr-1 md:max-h-[620px]">
        <div className="sticky top-0 z-20 space-y-2 bg-card/85 backdrop-blur px-1 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Child</span>
            <select
              className="havi-select text-xs"
              data-testid="timeline-child-select"
              value={effectiveChildId ?? ""}
              onChange={(event) => {
                const nextId = event.target.value || null;
                const nextChild = memoChildOptions.find((child) => child.id === nextId);
                onChildChange?.(nextId, nextChild?.name);
              }}
            >
              {memoChildOptions.map((child) => (
                <option key={child.id} value={child.id}>
                  {child.name}
                </option>
              ))}
            </select>
            {timezoneLabel ? (
              <span className="text-xs text-muted-foreground" data-testid="timeline-timezone">
                Times shown in {timezoneLabel}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((filter) => (
              <Button
                key={filter.id}
                variant={selectedFilter === filter.id ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedFilter(filter.id)}
              >
                {filter.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-2 pt-2">{renderEventRows()}</div>
        {isError ? (
          <p className="text-xs text-destructive">Unable to load events.</p>
        ) : null}
      </div>
    </div>
  );
}
