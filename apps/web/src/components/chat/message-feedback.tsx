"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";

import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";

export type FeedbackRating = "up" | "down" | null;

type MessageFeedbackProps = {
  conversationId: string | null;
  messageId: string | null | undefined;
  apiBaseUrl: string;
  modelVersion?: string | null;
  responseMetadata?: Record<string, unknown> | null;
  initialRating?: FeedbackRating;
  initialComment?: string;
  layout?: "overlay" | "stacked";
  beforeButtons?: React.ReactNode;
  afterButtons?: React.ReactNode;
  containerClassName?: string;
  actionRowClassName?: string;
  buttonClassName?: string;
};

type FeedbackPayload = {
  conversation_id: string;
  message_id: string;
  rating: Exclude<FeedbackRating, null>;
  feedback_text?: string | null;
  session_id?: string | null;
  model_version?: string | null;
  response_metadata?: Record<string, unknown> | null;
};

const RETRY_DELAYS_MS = [1200, 2400];
type PersistStatus = "idle" | "submitting" | "retry_wait" | "retrying" | "failed";

// Shared assistant-row action tokens for copy/thumb controls.
export const CHAT_ACTION_ICON_CLASS = "h-4 w-4";
export const CHAT_ACTION_BUTTON_CLASS =
  "inline-flex h-10 w-10 items-center justify-center rounded-md border border-border/40 bg-muted/40 p-0 text-muted-foreground transition hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60";
export const CHAT_ACTION_ROW_CLASS = "min-h-10 gap-1.5";

class FeedbackPersistError extends Error {
  retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.retryable = retryable;
  }
}

export function MessageFeedback({
  conversationId,
  messageId,
  apiBaseUrl,
  modelVersion = null,
  responseMetadata = null,
  initialRating = null,
  initialComment = "",
  layout = "overlay",
  beforeButtons,
  afterButtons,
  containerClassName,
  actionRowClassName,
  buttonClassName,
}: MessageFeedbackProps) {
  const [rating, setRating] = useState<FeedbackRating>(initialRating);
  const [comment, setComment] = useState(initialComment);
  const [status, setStatus] = useState<PersistStatus>("idle");
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<number | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const pendingPayloadRef = useRef<FeedbackPayload | null>(null);
  const touchedRef = useRef(false);

  useEffect(() => {
    if (touchedRef.current) return;
    setRating(initialRating);
    setComment(initialComment);
  }, [initialRating, initialComment]);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) {
        window.clearTimeout(retryTimerRef.current);
      }
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const persistFeedback = useCallback(
    async (payload: FeedbackPayload, isRetry = false) => {
      pendingPayloadRef.current = payload;
      if (retryTimerRef.current) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (!isRetry) {
        retryCountRef.current = 0;
      }
      setStatus(isRetry ? "retrying" : "submitting");
      try {
        const res = await apiFetch(`${apiBaseUrl}/api/v1/messages/feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const retryable = res.status >= 500 || res.status === 429;
          throw new FeedbackPersistError("Unable to save feedback", retryable);
        }
        setStatus("idle");
      } catch (error) {
        const retryable =
          error instanceof FeedbackPersistError ? error.retryable : true;
        if (retryable && retryCountRef.current < RETRY_DELAYS_MS.length) {
          const delay = RETRY_DELAYS_MS[retryCountRef.current];
          retryCountRef.current += 1;
          setStatus("retry_wait");
          retryTimerRef.current = window.setTimeout(() => {
            if (pendingPayloadRef.current) {
              void persistFeedback(pendingPayloadRef.current, true);
            }
          }, delay);
          return;
        }
        setStatus("failed");
      }
    },
    [apiBaseUrl],
  );

  const submitFeedback = useCallback(
    (nextRating: FeedbackRating, nextComment: string) => {
      if (!conversationId || !messageId || !nextRating) return;
      const payload: FeedbackPayload = {
        conversation_id: String(conversationId),
        message_id: String(messageId),
        rating: nextRating,
        feedback_text: nextComment.trim() ? nextComment.trim() : null,
        session_id: String(conversationId),
      };
      if (modelVersion) {
        payload.model_version = modelVersion;
      }
      if (responseMetadata && Object.keys(responseMetadata).length > 0) {
        payload.response_metadata = responseMetadata;
      }
      void persistFeedback(payload);
    },
    [conversationId, messageId, modelVersion, persistFeedback, responseMetadata],
  );

  const handleRatingSelect = (nextRating: FeedbackRating) => {
    touchedRef.current = true;
    setRating(nextRating);
    submitFeedback(nextRating, comment);
  };

  const handleCommentChange = (value: string) => {
    touchedRef.current = true;
    setComment(value);
    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
    }
    if (rating !== "down") return;
    debounceTimerRef.current = window.setTimeout(() => {
      submitFeedback("down", value);
    }, 500);
  };

  const iconButtonBase = buttonClassName ?? CHAT_ACTION_BUTTON_CLASS;
  const retryButtonBase =
    "inline-flex items-center rounded-md bg-muted/40 px-2 py-1 text-[10px] text-muted-foreground ring-1 ring-border/40 transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60";
  const activeClass = "bg-muted/70 text-foreground";
  const isStacked = layout === "stacked";
  const wrapperClasses = isStacked
    ? "flex flex-col gap-2"
    : "absolute bottom-2 left-2 right-2 flex items-center justify-end gap-2 text-muted-foreground";
  const actionClasses = cn(
    "flex items-center text-muted-foreground",
    CHAT_ACTION_ROW_CLASS,
    !isStacked && "justify-end",
    actionRowClassName,
  );
  const inputClasses = cn(
    "h-7 rounded-md border border-border/60 bg-background/70 px-2 text-[11px] text-foreground shadow-xs",
    "placeholder:text-muted-foreground/70",
    "focus:outline-none focus:ring-2 focus:ring-ring/60",
    isStacked ? "w-full" : "w-full max-w-[220px]",
  );
  const hasFeedbackTarget = Boolean(messageId && conversationId);
  const showRetryingHint = status === "retry_wait" || status === "retrying";
  const showTerminalError = status === "failed";

  if (!hasFeedbackTarget && !beforeButtons) {
    return null;
  }

  return (
    <div className={cn(wrapperClasses, containerClassName)}>
      {hasFeedbackTarget && rating === "down" ? (
        <input
          className={inputClasses}
          value={comment}
          placeholder="What didn’t work? (optional)"
          onChange={(event) => handleCommentChange(event.target.value)}
        />
      ) : null}
      <div className={actionClasses}>
        {beforeButtons}
        {hasFeedbackTarget ? (
          <>
            <button
              type="button"
              aria-label="Thumbs up"
              aria-pressed={rating === "up"}
              onClick={() => handleRatingSelect("up")}
              className={cn(iconButtonBase, rating === "up" && activeClass)}
            >
              <ThumbsUp className={CHAT_ACTION_ICON_CLASS} />
            </button>
            <button
              type="button"
              aria-label="Thumbs down"
              aria-pressed={rating === "down"}
              onClick={() => handleRatingSelect("down")}
              className={cn(iconButtonBase, rating === "down" && activeClass)}
            >
              <ThumbsDown className={CHAT_ACTION_ICON_CLASS} />
            </button>
            {showRetryingHint ? (
              <span className="text-[10px] text-muted-foreground">Retrying…</span>
            ) : null}
            {showTerminalError ? (
              <>
                <span className="text-[10px] text-muted-foreground">
                  Couldn’t save feedback.
                </span>
                <button
                  type="button"
                  aria-label="Retry feedback"
                  className={retryButtonBase}
                  onClick={() => {
                    if (pendingPayloadRef.current) {
                      void persistFeedback(pendingPayloadRef.current);
                    }
                  }}
                >
                  Try again
                </button>
              </>
            ) : null}
          </>
        ) : null}
        {afterButtons}
      </div>
    </div>
  );
}
