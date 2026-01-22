import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// JSDOM does not implement scrollTo on elements by default; noop it for tests.
if (!("scrollTo" in window.HTMLElement.prototype)) {
  Object.defineProperty(window.HTMLElement.prototype, "scrollTo", {
    value: () => {},
    writable: true,
  });
}

import Home from "../page";

const baseSettings = {
  caregiver: {
    first_name: "Alex",
    last_name: "Davis",
    email: "alex@example.com",
    phone: "(555) 555-1212",
    relationship: "Parent",
  },
  child: {
    id: 1,
    first_name: "Ava",
    last_name: "Davis",
    birth_date: "2024-05-01",
    due_date: "",
    gender: "girl",
    timezone: "America/Los_Angeles",
  },
};

const buildEvent = (overrides: Partial<Record<string, string>> = {}) => ({
  id:
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2),
  child_id: "1",
  type: "sleep",
  title: "Sleep",
  detail: "42m",
  amount_label: null,
  start: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  end: null,
  has_note: false,
  is_custom: false,
  source: "chat",
  origin_message_id: null,
  ...overrides,
});

const mockFetch = (events: Array<Record<string, unknown>> = []) => {
  const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/v1/settings")) {
      return new Response(JSON.stringify(baseSettings), { status: 200 });
    }
    if (url.includes("/events")) {
      return new Response(JSON.stringify(events), { status: 200 });
    }
    if (url.includes("/api/v1/conversations") && init?.method === "POST") {
      return new Response(
        JSON.stringify({
          id: 42,
          title: "New chat",
          last_message_at: new Date().toISOString(),
        }),
        { status: 200 },
      );
    }
    if (url.includes("/api/v1/conversations")) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (url.includes("/api/v1/activities")) {
      return new Response(
        JSON.stringify({
          actions: [],
          raw_message: "",
          model: "test",
          latency_ms: 10,
        }),
        { status: 200 },
      );
    }
    if (url.includes("/api/v1/messages/feedback")) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    return new Response(JSON.stringify([]), { status: 200 });
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
};

const renderHome = async (events: Array<Record<string, unknown>> = []) => {
  const fetchMock = mockFetch(events);
  const utils = render(<Home />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  return { fetchMock, ...utils };
};

describe("App layout – desktop padding and nav", () => {
  it("applies sidebar and main padding classes", async () => {
    const { container } = await renderHome();

    const aside = container.querySelector("aside");
    const main = container.querySelector("main");

    expect(aside).not.toBeNull();
    expect(main).not.toBeNull();

    const asideClass = aside?.className ?? "";
    const mainClass = main?.className ?? "";

    // Sidebar: fixed width, padding, border on desktop
    expect(asideClass).toContain("md:w-60");
    expect(asideClass).toContain("p-3");
    expect(asideClass).toContain("border-r");

    // Main column: outer horizontal padding
    expect(mainClass).toContain("px-4");
    expect(mainClass).toContain("md:px-6");
    expect(mainClass).toContain("lg:px-8");
  });

  it("renders Home first in the sidebar menu", async () => {
    const { container } = await renderHome();

    const nav = container.querySelector("aside nav");
    expect(nav).not.toBeNull();

    const buttons = nav ? Array.from(nav.querySelectorAll("button")) : [];
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons[0]?.textContent).toBe("Home");
  });
});

describe("App layout – mobile overlay behaviour", () => {
  it("mounts and unmounts overlay and backdrop while keeping the frame", async () => {
    await renderHome();

    // Canonical content frame should always be present
    const frame = screen.getByTestId("app-frame");
    expect(frame).toBeInTheDocument();

    // Initially overlay/backdrop should not be present
    expect(
      screen.queryByLabelText("Close navigation overlay"),
    ).not.toBeInTheDocument();

    // Open mobile nav via hamburger button (md:hidden in real CSS but present in DOM here)
    const menuButtons = screen.getAllByRole("button", { name: "Menu" });
    fireEvent.click(menuButtons[0]);

    // Backdrop should now be mounted
    const backdrop = screen.getByLabelText("Close navigation overlay");
    expect(backdrop).toBeInTheDocument();

    // Frame must still be present while overlay is open
    expect(screen.getByTestId("app-frame")).toBeInTheDocument();

    // Close via backdrop click
    fireEvent.click(backdrop);

    // Backdrop and overlay should unmount
    expect(
      screen.queryByLabelText("Close navigation overlay"),
    ).not.toBeInTheDocument();

    // Frame must remain mounted
    expect(screen.getByTestId("app-frame")).toBeInTheDocument();
  });
});

describe("Home zones – V1 foundations", () => {
  it("defaults to Chat/HAVI on load", async () => {
    await renderHome();
    expect(
      screen.getByPlaceholderText(
        "Ask a question, log a moment, or track anything…",
      ),
    ).toBeInTheDocument();
  });

  it("renders Zones 1–5 when Home is selected", async () => {
    await renderHome();
    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    await waitFor(() => {
      expect(screen.getByTestId("home-zone-status")).toBeInTheDocument();
      expect(screen.getByTestId("home-zone-recent")).toBeInTheDocument();
      expect(screen.getByTestId("home-zone-coming-up")).toBeInTheDocument();
      expect(screen.getByTestId("home-zone-utilities")).toBeInTheDocument();
      expect(screen.getByTestId("home-zone-chips")).toBeInTheDocument();
    });
  });

  it("shows the empty state when there is no recent data", async () => {
    await renderHome([]);
    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    expect(
      await screen.findByText(
        "You’re up to date. Log something to see it here.",
      ),
    ).toBeInTheDocument();
  });

  it("shows only Last when minimal data is available", async () => {
    await renderHome([buildEvent()]);
    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    expect(await screen.findByText("Last")).toBeInTheDocument();
    expect(screen.queryByText("Last chapter")).not.toBeInTheDocument();
  });

  it("shows Last chapter and Last when enough data is available", async () => {
    await renderHome([
      buildEvent({ type: "sleep" }),
      buildEvent({ type: "bottle", title: "Bottle" }),
      buildEvent({ type: "diaper", title: "Diaper" }),
      buildEvent({ type: "sleep", start: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() }),
      buildEvent({ type: "bottle", start: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString() }),
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    expect(await screen.findByText("Last chapter")).toBeInTheDocument();
    expect(screen.getByText("Last")).toBeInTheDocument();
  });

  it("routes quick chips into chat", async () => {
    await renderHome([]);
    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    const chip = await screen.findByRole("button", {
      name: "Changed a dirty diaper",
    });
    fireEvent.click(chip);
    await waitFor(() => {
      expect(
        screen.getByPlaceholderText(
          "Ask a question, log a moment, or track anything…",
        ),
      ).toBeInTheDocument();
    });
  });
});
