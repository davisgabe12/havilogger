import React from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MessageFeedback } from "../message-feedback";

describe("MessageFeedback", () => {
  const apiBaseUrl = "http://localhost";

  const mockFetch = () =>
    jest
      .spyOn(global, "fetch")
      .mockResolvedValue({ ok: true, json: async () => ({}) } as Response);

  afterEach(() => {
    jest.restoreAllMocks();
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
      session_id: "42",
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
      session_id: "42",
    });
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
    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockRejectedValue(new Error("network"));
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

  it("recovers when user retries from terminal error", async () => {
    jest.useFakeTimers();
    const fetchSpy = jest
      .spyOn(global, "fetch")
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
