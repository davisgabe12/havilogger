"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export type FeedbackRating = "up" | "down" | null;

type MessageFeedbackProps = {
  conversationId: number | null;
  messageId: string | null | undefined;
  apiBaseUrl: string;
  initialRating?: FeedbackRating;
  initialComment?: string;
};

type FeedbackPayload = {
  conversation_id: number;
  message_id: string;
  rating: FeedbackRating;
  comment?: string | null;
};

const RETRY_DELAYS_MS = [1200, 2400];

export function MessageFeedback({
  conversationId,
  messageId,
  apiBaseUrl,
  initialRating = null,
  initialComment = "",
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
        const res = await fetch(`${apiBaseUrl}/api/v1/feedback`, {
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
      if (!conversationId || !messageId) return;
      const payload: FeedbackPayload = {
        conversation_id: conversationId,
        message_id: messageId,
        rating: nextRating,
        comment: nextComment.trim() ? nextComment.trim() : null,
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

  if (!messageId || !conversationId) {
    return null;
  }

  const buttonBase =
    "inline-flex h-7 w-7 items-center justify-center rounded-full text-[13px] transition ring-1 ring-border/40 text-muted-foreground hover:text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60";

  return (
    <div
      className={cn(
        "absolute bottom-2 left-2 right-2 flex items-center justify-end gap-2",
        "text-muted-foreground",
      )}
    >
      {rating === "down" ? (
        <input
          className={cn(
            "h-7 w-full max-w-[220px] rounded-md border border-border/60 bg-background/70 px-2 text-[11px] text-foreground shadow-xs",
            "placeholder:text-muted-foreground/70",
            "focus:outline-none focus:ring-2 focus:ring-ring/60",
          )}
          value={comment}
          placeholder="What didn’t work? (optional)"
          onChange={(event) => handleCommentChange(event.target.value)}
        />
      ) : null}
      <button
        type="button"
        aria-label="Thumbs up"
        aria-pressed={rating === "up"}
        onClick={() => handleRatingSelect("up")}
        className={cn(
          buttonBase,
          rating === "up" && "bg-primary/10 text-primary ring-primary/30",
        )}
      >
        👍
      </button>
      <button
        type="button"
        aria-label="Thumbs down"
        aria-pressed={rating === "down"}
        onClick={() => handleRatingSelect("down")}
        className={cn(
          buttonBase,
          rating === "down" && "bg-primary/10 text-primary ring-primary/30",
        )}
      >
        👎
      </button>
      {status === "error" ? (
        <span className="text-[10px] text-muted-foreground">Retrying…</span>
      ) : null}
    </div>
  );
}
