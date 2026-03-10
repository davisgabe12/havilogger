import React from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CHAT_ACTION_BUTTON_CLASS, CHAT_ACTION_ICON_CLASS, MessageFeedback } from "../message-feedback";

const mockApiFetch = jest.fn();

jest.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

describe("MessageFeedback", () => {
  const apiBaseUrl = "http://localhost";

  const mockFetch = () =>
    mockApiFetch.mockResolvedValue({ ok: true, json: async () => ({}) } as Response);

  afterEach(() => {
    mockApiFetch.mockReset();
    jest.useRealTimers();
  });

  it("clicking 👍 sets state and calls API", async () => {
    const fetchSpy = mockFetch();
    const user = userEvent.setup();

    render(
      <MessageFeedback
        conversationId={42}
        messageId="123"
        apiBaseUrl={apiBaseUrl}
      />,
    );

    await user.click(screen.getByLabelText("Thumbs up"));

    expect(screen.getByLabelText("Thumbs up")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      `${apiBaseUrl}/api/v1/messages/feedback`,
    );
    const body = JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string);
    expect(body).toEqual({
      conversation_id: "42",
      message_id: "123",
      rating: "up",
      feedback_text: null,
    });
  });

  it("clicking 👎 reveals input and saves text", async () => {
    jest.useFakeTimers();
    const fetchSpy = mockFetch();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    render(
      <MessageFeedback
        conversationId={42}
        messageId="123"
        apiBaseUrl={apiBaseUrl}
      />,
    );

    await user.click(screen.getByLabelText("Thumbs down"));
    const input = screen.getByPlaceholderText("What didn’t work? (optional)");
    expect(input).toBeInTheDocument();

    await user.type(input, "Too vague");
    await act(async () => {
      jest.advanceTimersByTime(600);
    });

    const lastCall = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1];
    const body = JSON.parse(lastCall?.[1]?.body as string);
    expect(body).toEqual({
      conversation_id: "42",
      message_id: "123",
      rating: "down",
      feedback_text: "Too vague",
    });
  });

  it("submits thumbs-down feedback immediately on Enter", async () => {
    const fetchSpy = mockFetch();
    const user = userEvent.setup();

    render(
      <MessageFeedback
        conversationId={42}
        messageId="123"
        apiBaseUrl={apiBaseUrl}
      />,
    );

    await user.click(screen.getByLabelText("Thumbs down"));
    const input = screen.getByPlaceholderText("What didn’t work? (optional)");
    await user.type(input, "Please be more specific");
    await user.keyboard("{Enter}");

    const lastCall = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1];
    const body = JSON.parse(lastCall?.[1]?.body as string);
    expect(body).toEqual({
      conversation_id: "42",
      message_id: "123",
      rating: "down",
      feedback_text: "Please be more specific",
    });
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("switching from 👎 to 👍 hides input and updates server record", async () => {
    jest.useFakeTimers();
    const fetchSpy = mockFetch();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    render(
      <MessageFeedback
        conversationId={42}
        messageId="123"
        apiBaseUrl={apiBaseUrl}
      />,
    );

    await user.click(screen.getByLabelText("Thumbs down"));
    const input = screen.getByPlaceholderText("What didn’t work? (optional)");
    await user.type(input, "Missing context");
    await act(async () => {
      jest.advanceTimersByTime(600);
    });

    await user.click(screen.getByLabelText("Thumbs up"));

    expect(
      screen.queryByPlaceholderText("What didn’t work? (optional)"),
    ).not.toBeInTheDocument();

    const lastCall = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1];
    const body = JSON.parse(lastCall?.[1]?.body as string);
    expect(body.rating).toBe("up");
  });

  it("includes model and route metadata when provided", async () => {
    const fetchSpy = mockFetch();
    const user = userEvent.setup();

    render(
      <MessageFeedback
        conversationId={42}
        messageId="123"
        apiBaseUrl={apiBaseUrl}
        modelVersion="gpt-4o-mini"
        responseMetadata={{
          route_metadata: { route_kind: "ask", decision_source: "model" },
        }}
      />,
    );

    await user.click(screen.getByLabelText("Thumbs up"));
    const body = JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string);
    expect(body.model_version).toBe("gpt-4o-mini");
    expect(body.response_metadata).toEqual({
      route_metadata: { route_kind: "ask", decision_source: "model" },
    });
  });

  it("shows terminal error after retry budget is exhausted", async () => {
    jest.useFakeTimers();
    const fetchSpy = mockApiFetch.mockRejectedValue(new Error("network"));
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    render(
      <MessageFeedback
        conversationId={42}
        messageId="123"
        apiBaseUrl={apiBaseUrl}
      />,
    );

    await user.click(screen.getByLabelText("Thumbs up"));
    await act(async () => {
      jest.advanceTimersByTime(1200);
    });
    await act(async () => {
      jest.advanceTimersByTime(2400);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(screen.getByText("Couldn’t save feedback.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry feedback" })).toBeInTheDocument();
    expect(screen.queryByText("Retrying…")).not.toBeInTheDocument();
  });

  it("keeps shared icon sizing and hit-target tokens for thumbs buttons", async () => {
    const fetchSpy = mockFetch();
    const user = userEvent.setup();

    render(
      <MessageFeedback
        conversationId={42}
        messageId="123"
        apiBaseUrl={apiBaseUrl}
      />,
    );

    const upButton = screen.getByLabelText("Thumbs up");
    const downButton = screen.getByLabelText("Thumbs down");

    for (const token of ["h-10", "w-10", "items-center", "justify-center"]) {
      expect(upButton.className).toContain(token);
      expect(downButton.className).toContain(token);
    }
    expect(upButton.className).toContain(CHAT_ACTION_BUTTON_CLASS.split(" ")[0] ?? "");

    const upIcon = upButton.querySelector("svg") as SVGElement | null;
    const downIcon = downButton.querySelector("svg") as SVGElement | null;
    expect(upIcon).not.toBeNull();
    expect(downIcon).not.toBeNull();
    for (const token of CHAT_ACTION_ICON_CLASS.split(" ")) {
      if (!token) continue;
      expect(upIcon?.getAttribute("class") ?? "").toContain(token);
      expect(downIcon?.getAttribute("class") ?? "").toContain(token);
    }

    await user.click(upButton);
    expect(screen.getByLabelText("Thumbs up")).toHaveAttribute("aria-pressed", "true");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    for (const token of ["h-10", "w-10"]) {
      expect(screen.getByLabelText("Thumbs up").className).toContain(token);
      expect(screen.getByLabelText("Thumbs down").className).toContain(token);
    }
  });

  it("recovers when user retries from terminal error", async () => {
    jest.useFakeTimers();
    const fetchSpy = mockApiFetch
      .mockRejectedValueOnce(new Error("network"))
      .mockRejectedValueOnce(new Error("network"))
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    render(
      <MessageFeedback
        conversationId={42}
        messageId="123"
        apiBaseUrl={apiBaseUrl}
      />,
    );

    await user.click(screen.getByLabelText("Thumbs up"));
    await act(async () => {
      jest.advanceTimersByTime(1200);
    });
    await act(async () => {
      jest.advanceTimersByTime(2400);
    });

    await user.click(screen.getByRole("button", { name: "Retry feedback" }));

    expect(fetchSpy).toHaveBeenCalledTimes(4);
    expect(screen.queryByText("Couldn’t save feedback.")).not.toBeInTheDocument();
  });
});
