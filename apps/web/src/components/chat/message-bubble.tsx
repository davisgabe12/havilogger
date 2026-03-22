import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import {
  CHAT_ACTION_BUTTON_CLASS,
  CHAT_ACTION_ICON_CLASS,
  MessageFeedback,
  type FeedbackRating,
} from "@/components/chat/message-feedback";
import { CopyButton } from "@/components/ui/action-buttons";
import { API_BASE_URL } from "@/lib/api-base-url";
import { cn } from "@/lib/utils";

import type { ChatEntry } from "./types";

export const CHAT_BODY_TEXT = "text-sm leading-relaxed font-normal";
const MOBILE_ACTION_LONG_PRESS_MS = 450;
const MOBILE_ACTION_AUTO_HIDE_MS = 3200;

function isFinePointerDevice(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return true;
  }
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

function formatTimestamp(value: string, timezone?: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone ?? undefined,
      timeZoneName: "short",
    }).format(date);
  } catch {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

type MessageBubbleProps = {
  entry: ChatEntry;
  showSenderLabel?: boolean;
  onToggleTimestamp: (id: string) => void;
  isPinned: boolean;
  onCopy: (text: string, id: string) => void;
  copiedMessageId: string | null;
  highlightedMessageId: string | null;
  feedbackByMessageId?: Record<
    string,
    { rating: FeedbackRating; comment: string }
  >;
  conversationId?: string | null;
  timezone?: string | null;
};

export function MessageBubble({
  entry,
  showSenderLabel = false,
  onToggleTimestamp,
  isPinned,
  onCopy,
  copiedMessageId,
  highlightedMessageId,
  feedbackByMessageId,
  conversationId,
  timezone,
}: MessageBubbleProps) {
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
  const feedbackLookup = feedbackByMessageId ?? {};
  const feedback = entry.messageId ? feedbackLookup[entry.messageId] : undefined;

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
    "relative rounded-lg px-3 py-2 ring-offset-2 group border shadow-[0_2px_8px_rgba(42,34,26,0.08)]",
    isSelf
      ? "bg-[var(--havi-chat-bubble-user,var(--color-primary))] text-[var(--havi-chat-text,var(--color-primary-foreground))] border-[color:var(--havi-chat-border,var(--color-border))]"
      : isAssistant
        ? "bg-[var(--havi-chat-bubble-assistant,var(--color-muted))] text-[var(--havi-chat-text,var(--color-foreground))] border-[color:var(--havi-chat-border,var(--color-border))]"
        : "bg-[var(--havi-chat-surface,var(--color-background))] text-[var(--havi-chat-text,var(--color-foreground))] border-[color:var(--havi-chat-border,var(--color-border))]",
    isHighlighted && "ring-2 ring-primary/40",
  );

  const actionButtonBase = CHAT_ACTION_BUTTON_CLASS;
  const [mobileActionsVisible, setMobileActionsVisible] = useState(false);
  const longPressTimerRef = useRef<number | null>(null);
  const autoHideTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        window.clearTimeout(longPressTimerRef.current);
      }
      if (autoHideTimerRef.current) {
        window.clearTimeout(autoHideTimerRef.current);
      }
    };
  }, []);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const scheduleAutoHide = () => {
    if (autoHideTimerRef.current) {
      window.clearTimeout(autoHideTimerRef.current);
    }
    autoHideTimerRef.current = window.setTimeout(() => {
      setMobileActionsVisible(false);
    }, MOBILE_ACTION_AUTO_HIDE_MS);
  };

  const handleAssistantPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isAssistant || isFinePointerDevice()) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, a, input, textarea, select, [role='button']")) {
      return;
    }
    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      setMobileActionsVisible(true);
      scheduleAutoHide();
    }, MOBILE_ACTION_LONG_PRESS_MS);
  };

  const handleAssistantPointerRelease = () => {
    clearLongPressTimer();
  };

  const assistantActionRowClassName = cn(
    "pt-2 transition-opacity duration-150",
    mobileActionsVisible
      ? "opacity-100 pointer-events-auto"
      : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto",
  );

  const gutter = (
    <div className="w-[28px] flex-shrink-0 flex items-start justify-center">
      {isAssistant ? (
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--havi-chat-bubble-assistant,var(--color-muted))] text-[11px] font-semibold text-[var(--havi-chat-muted,var(--color-foreground))]">
          HAVI
        </span>
      ) : isCaregiver ? (
        showSenderLabel ? (
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--havi-chat-surface,var(--color-primary))] text-[11px] font-semibold text-[var(--havi-chat-muted,var(--color-primary))]">
            {getInitials(entry.senderName ?? "Caregiver")}
          </span>
        ) : (
          <span className="inline-flex h-7 w-7" aria-hidden="true" />
        )
      ) : null}
    </div>
  );

  const copyAction = (
    <>
      <CopyButton
        onClick={() => onCopy(entry.text, entry.id)}
        aria-label="Copy message"
        title="Copy"
        className={actionButtonBase}
        iconClassName={CHAT_ACTION_ICON_CLASS}
      />
    </>
  );

  if (isSelf) {
    return (
      <div className="flex w-full justify-end" data-testid="chat-message" data-sender="self">
        <div
          data-message-id={entry.messageId ?? undefined}
          data-testid="message-bubble"
          className={bubbleClasses}
          style={bubbleMaxWidth}
        >
          <p className={cn("whitespace-pre-wrap pr-10", CHAT_BODY_TEXT)}>
            {entry.text}
          </p>
          {showTimestamp ? (
            <div className="mt-1 flex items-center gap-2 text-[11px] uppercase tracking-wide text-[var(--havi-chat-muted,var(--color-muted-foreground))]">
              <button
                type="button"
                className="rounded px-1"
                onClick={() => onToggleTimestamp(entry.id)}
              >
                {isPinned ? "Hide time" : formatTimestamp(createdAt, timezone ?? undefined)}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full items-start gap-2" data-testid="chat-message" data-sender={senderType}>
      {gutter}
      <div
        className="group flex flex-col"
        style={bubbleMaxWidth}
        data-testid="message-bubble-wrapper"
        onPointerDown={isAssistant ? handleAssistantPointerDown : undefined}
        onPointerUp={isAssistant ? handleAssistantPointerRelease : undefined}
        onPointerLeave={isAssistant ? handleAssistantPointerRelease : undefined}
        onPointerCancel={isAssistant ? handleAssistantPointerRelease : undefined}
      >
        {isCaregiver && showSenderLabel && entry.senderName ? (
          <p className="mb-1 ml-1 text-xs font-medium text-[var(--havi-chat-muted,var(--color-muted-foreground))]">
            {entry.senderName}
          </p>
        ) : null}
        <div
          data-message-id={entry.messageId ?? undefined}
          data-testid="message-bubble"
          className={bubbleClasses}
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
            <div className="mt-1 flex items-center gap-2 text-[11px] uppercase tracking-wide text-[var(--havi-chat-muted,var(--color-muted-foreground))]">
              <button
                type="button"
                className="rounded px-1"
                onClick={() => onToggleTimestamp(entry.id)}
              >
                {isPinned ? "Hide time" : formatTimestamp(createdAt, timezone ?? undefined)}
              </button>
              {entry.senderName ? (
                <span className="inline-flex items-center gap-1 rounded bg-[var(--havi-chat-surface,var(--color-background))] px-2 py-1 text-[10px] uppercase">
                  {getInitials(entry.senderName)}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        {isAssistant ? (
          <MessageFeedback
            conversationId={conversationId ?? null}
            messageId={entry.messageId}
            apiBaseUrl={API_BASE_URL}
            modelVersion={entry.model ?? null}
            responseMetadata={
              entry.routeMetadata
                ? { route_metadata: entry.routeMetadata }
                : null
            }
            initialRating={feedback?.rating ?? null}
            initialComment={feedback?.comment ?? ""}
            layout="stacked"
            beforeButtons={copyAction}
            afterButtons={
              copiedMessageId === entry.id ? (
                <span className="text-[11px] text-muted-foreground">Copied</span>
              ) : null
            }
            buttonClassName={actionButtonBase}
            actionRowClassName={assistantActionRowClassName}
          />
        ) : null}
      </div>
    </div>
  );
}
