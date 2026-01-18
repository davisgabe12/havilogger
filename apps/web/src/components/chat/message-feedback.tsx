"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";

import { cn } from "@/lib/utils";

export type FeedbackRating = "up" | "down" | null;

type MessageFeedbackProps = {
  conversationId: number | null;
  messageId: string | null | undefined;
  apiBaseUrl: string;
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
};

const RETRY_DELAYS_MS = [1200, 2400];

export function MessageFeedback({
  conversationId,
  messageId,
  apiBaseUrl,
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
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
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
      if (!isRetry) {
        retryCountRef.current = 0;
      }
      setStatus("saving");
      try {
        const res = await fetch(`${apiBaseUrl}/api/v1/messages/feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("Unable to save feedback");
        setStatus("idle");
      } catch {
        setStatus("error");
        if (retryCountRef.current < RETRY_DELAYS_MS.length) {
          const delay = RETRY_DELAYS_MS[retryCountRef.current];
          retryCountRef.current += 1;
          if (retryTimerRef.current) {
            window.clearTimeout(retryTimerRef.current);
          }
          retryTimerRef.current = window.setTimeout(() => {
            if (pendingPayloadRef.current) {
              void persistFeedback(pendingPayloadRef.current, true);
            }
          }, delay);
        }
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
      void persistFeedback(payload);
    },
    [conversationId, messageId, persistFeedback],
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

  const buttonBase =
    buttonClassName ??
    "inline-flex items-center gap-1 rounded-md bg-muted/40 px-1.5 py-0.5 text-[11px] text-muted-foreground ring-1 ring-border/40 transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60";
  const activeClass = "bg-muted/70 text-foreground";
  const isStacked = layout === "stacked";
  const wrapperClasses = isStacked
    ? "flex flex-col gap-2"
    : "absolute bottom-2 left-2 right-2 flex items-center justify-end gap-2 text-muted-foreground";
  const actionClasses = cn(
    "flex items-center gap-2 text-muted-foreground",
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
              className={cn(buttonBase, rating === "up" && activeClass)}
            >
              <ThumbsUp className="h-3 w-3" />
            </button>
            <button
              type="button"
              aria-label="Thumbs down"
              aria-pressed={rating === "down"}
              onClick={() => handleRatingSelect("down")}
              className={cn(buttonBase, rating === "down" && activeClass)}
            >
              <ThumbsDown className="h-3 w-3" />
            </button>
            {status === "error" ? (
              <span className="text-[10px] text-muted-foreground">Retrying…</span>
            ) : null}
          </>
        ) : null}
        {afterButtons}
      </div>
    </div>
  );
}
