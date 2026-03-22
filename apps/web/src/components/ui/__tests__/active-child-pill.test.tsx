import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import { ActiveChildPill } from "@/components/ui/active-child-pill";

describe("ActiveChildPill", () => {
  const options = [
    { id: "1", name: "Levi" },
    { id: "2", name: "Sebastian" },
  ];

  it("renders left-aligned 90px pill with truncated name container", () => {
    render(
      <ActiveChildPill
        activeChildId="2"
        activeChildName="Sebastian"
        children={options}
        onChange={() => {}}
      />,
    );

    const pill = screen.getByTestId("active-child-pill");
    expect(pill.className).toContain("havi-active-child-pill");
    expect(screen.getByText("Sebastian").className).toContain("havi-active-child-pill-name");
  });

  it("opens and selects a child", () => {
    const onChange = jest.fn();
    render(
      <ActiveChildPill
        activeChildId="1"
        activeChildName="Levi"
        children={options}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByTestId("active-child-pill"));
    expect(screen.getByTestId("active-child-popover")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("option", { name: "Sebastian" }));
    expect(onChange).toHaveBeenCalledWith("2");
  });

  it("stays disabled when no options are available", () => {
    render(
      <ActiveChildPill
        activeChildId={null}
        activeChildName="No child"
        children={[]}
        onChange={() => {}}
      />,
    );

    const pill = screen.getByTestId("active-child-pill");
    expect(pill).toBeDisabled();
  });

  it("supports keyboard open, navigation, selection, and escape", () => {
    const onChange = jest.fn();
    render(
      <ActiveChildPill
        activeChildId="1"
        activeChildName="Levi"
        children={options}
        onChange={onChange}
      />,
    );

    const pill = screen.getByTestId("active-child-pill");
    fireEvent.keyDown(pill, { key: "ArrowDown" });

    const listbox = screen.getByRole("listbox", { name: "Select active child" });
    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    fireEvent.keyDown(listbox, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("2");

    fireEvent.click(pill);
    const reopened = screen.getByRole("listbox", { name: "Select active child" });
    fireEvent.keyDown(reopened, { key: "Escape" });
    expect(screen.queryByRole("listbox", { name: "Select active child" })).not.toBeInTheDocument();
  });
});
