import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

jest.mock("react-markdown", () => ({
  __esModule: true,
  default: (props: any) => <div {...props} />,
}));

jest.mock("remark-gfm", () => ({
  __esModule: true,
  default: () => null,
}));

// JSDOM does not implement scrollTo on elements by default; noop it for tests.
if (!("scrollTo" in window.HTMLElement.prototype)) {
  Object.defineProperty(window.HTMLElement.prototype, "scrollTo", {
    value: () => {},
    writable: true,
  });
}

import Home from "../page";

describe("App layout – desktop padding and nav", () => {
  it("applies sidebar and main padding classes", () => {
    const { container } = render(<Home />);

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
});

describe("App layout – mobile overlay behaviour", () => {
  it("mounts and unmounts overlay and backdrop while keeping the frame", () => {
    render(<Home />);

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
