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
        "Track sleep, feeding, diapers, behavior, and routines in one shared thread. Talk with Havi like a partner to decide what to do next.",
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
  });

  it("keeps the section narrative order fixed", () => {
    const { container } = render(<MarketingHomePage />);
    const sections = Array.from(
      container.querySelectorAll('[data-testid^="home-section-"]'),
    ).map((el) => el.getAttribute("data-testid"));

    expect(sections).toEqual([
      "home-section-hero",
      "home-section-problem",
      "home-section-comparison",
      "home-section-benefits",
      "home-section-evidence",
      "home-section-testimonials",
      "home-section-closing",
    ]);
  });

  it("renders all four required benefit pillars", () => {
    render(<MarketingHomePage />);

    expect(
      screen.getByRole("heading", {
        level: 3,
        name: "Track everything in one place",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 3,
        name: "Get support through every phase",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 3,
        name: "Get guidance tailored to your child",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 3,
        name: "Keep your village in sync",
      }),
    ).toBeInTheDocument();
  });

  it("renders the hero focal object and comparison module", () => {
    render(<MarketingHomePage />);
    expect(screen.getByTestId("home-hero-object")).toBeInTheDocument();
    expect(screen.getByTestId("home-comparison-grid")).toBeInTheDocument();
    expect(screen.getAllByText("Today without Havi").length).toBeGreaterThan(0);
    expect(screen.getAllByText("With Havi").length).toBeGreaterThan(0);
  });

  it("renders the new product screenshots and testimonial grid", () => {
    render(<MarketingHomePage />);

    expect(
      screen.getByAltText("Havi chat thread with parent updates and guidance"),
    ).toBeInTheDocument();
    expect(screen.getByAltText("Havi timeline companion view")).toBeInTheDocument();
    expect(
      screen.getByAltText("Havi timeline showing pattern clarity"),
    ).toBeInTheDocument();
    expect(
      screen.getByAltText("Havi tasks showing coordinated follow-through"),
    ).toBeInTheDocument();

    expect(screen.getByTestId("home-testimonials-grid")).toBeInTheDocument();
    expect(screen.getByText("Nina, Brooklyn, NY")).toBeInTheDocument();
    expect(screen.getByText("Ethan, Austin, TX")).toBeInTheDocument();
    expect(screen.getByText("Marisol, San Diego, CA")).toBeInTheDocument();
  });
});
