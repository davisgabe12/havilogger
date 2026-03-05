import React from "react";
import { render, screen } from "@testing-library/react";

import MarketingHomePage from "../page";

describe("Marketing homepage", () => {
  it("renders the locked hero copy and CTA targets", () => {
    render(<MarketingHomePage />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Parenthood moves fast. Stay ahead and present with Havi.",
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        "Havi captures what happens, remembers it, and keeps your care team aligned so you can focus on your child.",
      ),
    ).toBeInTheDocument();

    expect(screen.getByTestId("home-cta-primary-hero")).toHaveAttribute(
      "href",
      "/auth/sign-up",
    );
    expect(screen.getByTestId("home-cta-secondary-hero")).toHaveAttribute(
      "href",
      "/stories",
    );
    expect(screen.getByTestId("home-cta-primary-proof")).toHaveAttribute(
      "href",
      "/auth/sign-up",
    );
    expect(screen.getByTestId("home-cta-primary-closing")).toHaveAttribute(
      "href",
      "/auth/sign-up",
    );
    expect(screen.getByTestId("home-cta-secondary-closing")).toHaveAttribute(
      "href",
      "/stories",
    );
    expect(screen.queryByText("The pace of parenthood")).not.toBeInTheDocument();
    expect(
      screen.queryByText("One memory. One plan. One calmer day."),
    ).not.toBeInTheDocument();
  });

  it("keeps the section narrative order fixed", () => {
    const { container } = render(<MarketingHomePage />);
    const sections = Array.from(
      container.querySelectorAll('[data-testid^="home-section-"]'),
    ).map((el) => el.getAttribute("data-testid"));

    expect(sections).toEqual([
      "home-section-hero",
      "home-section-problem",
      "home-section-features",
      "home-section-comparison",
      "home-section-proof",
      "home-section-benefits",
      "home-section-closing",
    ]);
  });

  it("renders all four required benefit pillars", () => {
    render(<MarketingHomePage />);

    expect(
      screen.getByRole("heading", {
        level: 3,
        name: "Capture moments in conversation",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 3,
        name: "Keep family context in one place",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 3,
        name: "Spot changes early",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 3,
        name: "Coordinate care with less back-and-forth",
      }),
    ).toBeInTheDocument();
  });

  it("renders the hero focal object", () => {
    render(<MarketingHomePage />);
    expect(screen.getByTestId("home-hero-object")).toBeInTheDocument();
  });

  it("renders the before-and-with comparison module", () => {
    render(<MarketingHomePage />);
    expect(screen.getByTestId("home-comparison-grid")).toBeInTheDocument();
    expect(screen.getByText("Without Havi")).toBeInTheDocument();
    expect(screen.getByText("With Havi")).toBeInTheDocument();
    expect(screen.queryByText("Thread-hopping for updates")).not.toBeInTheDocument();
  });

  it("renders real product screenshots", () => {
    render(<MarketingHomePage />);
    expect(
      screen.getAllByAltText("Havi chat capturing a family update").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByAltText("Havi timeline showing saved family events").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByAltText("Havi task view with a created task").length,
    ).toBeGreaterThan(0);
  });
});
