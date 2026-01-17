import React from "react";
import { render, screen } from "@testing-library/react";

import { MessageBubble } from "../message-bubble";
import type { ChatEntry } from "../types";

describe("MessageBubble width and spacing", () => {
  const noop = () => {};

  it("applies max width classes for user and assistant roles", () => {
    const userEntry: ChatEntry = {
      id: "user-1",
      role: "user",
      text: "Hello",
      createdAt: new Date().toISOString(),
      senderType: "self",
    };
    const assistantEntry: ChatEntry = {
      id: "assistant-1",
      role: "havi",
      text: "Hi there",
      createdAt: new Date().toISOString(),
      senderType: "assistant",
    };

    const { rerender } = render(
      <MessageBubble
        entry={userEntry}
        onToggleTimestamp={noop}
        isPinned={false}
        onCopy={noop}
        copiedMessageId={null}
        highlightedMessageId={null}
      />,
    );

    expect(screen.getByTestId("message-bubble").className).toContain(
      "max-w-user",
    );

    rerender(
      <MessageBubble
        entry={assistantEntry}
        onToggleTimestamp={noop}
        isPinned={false}
        onCopy={noop}
        copiedMessageId={null}
        highlightedMessageId={null}
      />,
    );

    expect(
      screen.getByTestId("message-bubble-wrapper").className,
    ).toContain("max-w-assistant");
  });

  it("renders long assistant messages without truncation", () => {
    const longText = "A".repeat(10000);
    const assistantEntry: ChatEntry = {
      id: "assistant-long",
      role: "havi",
      text: longText,
      createdAt: new Date().toISOString(),
      senderType: "assistant",
    };

    const { container } = render(
      <MessageBubble
        entry={assistantEntry}
        onToggleTimestamp={noop}
        isPinned={false}
        onCopy={noop}
        copiedMessageId={null}
        highlightedMessageId={null}
      />,
    );

    const content = container.textContent ?? "";
    expect(content).toContain(longText.slice(0, 100));
    expect(content).toContain(longText.slice(-100));
  });

  it("preserves paragraph spacing in markdown", () => {
    const assistantEntry: ChatEntry = {
      id: "assistant-paragraphs",
      role: "havi",
      text: "First paragraph.\n\nSecond paragraph.",
      createdAt: new Date().toISOString(),
      senderType: "assistant",
    };

    const { container } = render(
      <MessageBubble
        entry={assistantEntry}
        onToggleTimestamp={noop}
        isPinned={false}
        onCopy={noop}
        copiedMessageId={null}
        highlightedMessageId={null}
      />,
    );

    const paragraphs = container.querySelectorAll("p");
    expect(paragraphs).toHaveLength(2);
  });

  it("does not apply vertical scroll styles to bubbles", () => {
    const assistantEntry: ChatEntry = {
      id: "assistant-scroll",
      role: "havi",
      text: "No scroll",
      createdAt: new Date().toISOString(),
      senderType: "assistant",
    };

    render(
      <MessageBubble
        entry={assistantEntry}
        onToggleTimestamp={noop}
        isPinned={false}
        onCopy={noop}
        copiedMessageId={null}
        highlightedMessageId={null}
      />,
    );

    const bubbleClass = screen.getByTestId("message-bubble").className;
    expect(bubbleClass).not.toContain("overflow-y");
    expect(bubbleClass).not.toContain("max-h");
  });
});
