import type React from "react";
import { Copy } from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { MessageFeedback, type FeedbackRating } from "@/components/chat/message-feedback";
import { cn } from "@/lib/utils";

import type { ChatEntry } from "./types";

export const CHAT_BODY_TEXT = "text-sm leading-relaxed font-normal";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
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
  onToggleTimestamp: (id: string) => void;
  isPinned: boolean;
  onCopy: (text: string, id: string) => void;
  copiedMessageId: string | null;
  highlightedMessageId: string | null;
  feedbackByMessageId?: Record<
    string,
    { rating: FeedbackRating; comment: string }
  >;
  conversationId?: number | null;
};

export function MessageBubble({
  entry,
  onToggleTimestamp,
  isPinned,
  onCopy,
  copiedMessageId,
  highlightedMessageId,
  feedbackByMessageId,
  conversationId,
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
    "relative rounded-lg px-3 py-2 ring-offset-2 group",
    isSelf
      ? "bg-primary text-primary-foreground"
      : isAssistant
        ? "bg-muted/40 text-muted-foreground"
        : "bg-background/80 text-foreground border border-border/40",
    isHighlighted && "ring-2 ring-primary/40",
  );

  const actionButtonBase =
    "inline-flex items-center gap-1 rounded-md bg-muted/40 px-1.5 py-0.5 text-[11px] text-muted-foreground ring-1 ring-border/40 transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60";

  const gutter = (
    <div className="w-[28px] flex-shrink-0 flex items-start justify-center">
      {isAssistant ? (
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-muted/80 text-[11px] font-semibold text-foreground">
          HAVI
        </span>
      ) : isCaregiver ? (
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-
          full bg-primary/10 text-[11px] font-semibold text-primary">
          {getInitials(entry.senderName ?? "Caregiver")}
        </span>
      ) : null}
    </div>
  );

  const copyAction = (
    <>
      <button
        type="button"
        className={actionButtonBase}
        onClick={() => onCopy(entry.text, entry.id)}
        aria-label="Copy message"
        title="Copy"
      >
        <Copy className="h-3 w-3" />
      </button>
    </>
  );

  if (isSelf) {
    return (
      <div className="flex w-full justify-end">
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
      <div
        className="flex flex-col"
        style={bubbleMaxWidth}
        data-testid="message-bubble-wrapper"
      >
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
          <MessageFeedback
            conversationId={conversationId ?? null}
            messageId={entry.messageId}
            apiBaseUrl={API_BASE_URL}
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
            actionRowClassName="min-h-[28px] pt-2"
          />
        ) : null}
      </div>
    </div>
  );
}
