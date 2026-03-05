import Link from "next/link";
import Image from "next/image";

import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type HomepageProofPoint = {
  value: string;
  label: string;
  detail: string;
  tone: "warm" | "fresh" | "focus";
};

type HomepageBenefit = {
  title: string;
  body: string;
};

type HomepageContent = {
  problemTitle: string;
  problemBody: string;
  comparisonWithout: string[];
  comparisonWith: string[];
  headline: string;
  subhead: string;
  proofPoints: HomepageProofPoint[];
  productShots: Array<{
    src: string;
    alt: string;
    title: string;
    caption: string;
    crop: "chat" | "timeline" | "task";
  }>;
  benefits: HomepageBenefit[];
  closingTitle: string;
  closingBody: string;
  primaryCtaLabel: string;
  secondaryCtaLabel: string;
  howItWorks?: Array<{
    title: string;
    detail: string;
  }>;
};

const homepageContent: HomepageContent = {
  problemTitle: "Caring is not the hard part. Keeping everyone aligned is.",
  problemBody:
    "When updates are scattered, families spend time reconstructing what happened instead of deciding what to do next.",
  comparisonWithout: [
    "Updates are scattered across texts and apps.",
    "Parents repeat the same context again and again.",
    "Changes are spotted late.",
  ],
  comparisonWith: [
    "Updates stay in one shared thread.",
    "Parents and helpers work from the same context.",
    "Changes are spotted early with clear next steps.",
  ],
  headline: "Parenthood moves fast. Stay ahead and present with Havi.",
  subhead:
    "Havi captures what happens, remembers it, and keeps your care team aligned so you can focus on your child.",
  proofPoints: [
    {
      value: "Shared right away",
      label: "Everyone sees the same update",
      detail:
        "From feeding notes to behavior questions, everyone works from one thread.",
      tone: "warm",
    },
    {
      value: "Remembered for you",
      label: "No one repeats the same story",
      detail:
        "Havi keeps family context ready when you need it.",
      tone: "fresh",
    },
    {
      value: "Actionable next steps",
      label: "Patterns turn into clear plans",
      detail:
        "Move from a moment to the next decision with less guesswork.",
      tone: "focus",
    },
  ],
  productShots: [
    {
      src: "/brand/product/chat-messages.png",
      alt: "Havi chat capturing a family update",
      title: "Capture in chat",
      caption: "Track moments naturally through conversation.",
      crop: "chat",
    },
    {
      src: "/brand/product/timeline-event.png",
      alt: "Havi timeline showing saved family events",
      title: "See the timeline",
      caption: "Keep family memory visible as patterns emerge.",
      crop: "timeline",
    },
    {
      src: "/brand/product/task-created.png",
      alt: "Havi task view with a created task",
      title: "Act with clarity",
      caption: "Turn insights into shared tasks in seconds.",
      crop: "task",
    },
  ],
  benefits: [
    {
      title: "Capture moments in conversation",
      body: "Log what happened as you talk. No forms to fill.",
    },
    {
      title: "Keep family context in one place",
      body: "Havi remembers key details so everyone starts from the same picture.",
    },
    {
      title: "Spot changes early",
      body: "See patterns sooner and decide next steps with more confidence.",
    },
    {
      title: "Coordinate care with less back-and-forth",
      body: "Share reminders and plans so everyone knows what to do.",
    },
  ],
  closingTitle: "Stop carrying every detail on your own.",
  closingBody:
    "Start with one conversation. Havi keeps context and next steps in one place each day.",
  primaryCtaLabel: "Start now",
  secondaryCtaLabel: "Read stories",
  // Reserved seam for Phase B. Do not render in this phase.
  howItWorks: [
    {
      title: "Capture",
      detail: "Log moments fast through natural conversation.",
    },
    {
      title: "Understand",
      detail: "Havi connects context and surfaces what changed.",
    },
    {
      title: "Coordinate",
      detail: "Share plans and reminders with your care team.",
    },
  ],
};

export default function MarketingHomePage() {
  const heroShot = homepageContent.productShots[0] ?? {
    src: "/brand/product/chat-messages.png",
    alt: "Havi product interface",
    title: "Capture in chat",
    caption: "Track moments naturally through conversation.",
    crop: "chat" as const,
  };

  const comparisonRows = homepageContent.comparisonWithout.map((without, index) => ({
    without,
    with: homepageContent.comparisonWith[index] ?? "",
  }));

  return (
    <MarketingLayout>
      <div className="havi-showcase-page">
        <section className="havi-section-block havi-canvas-band-light" data-testid="home-section-hero">
          <div className="havi-container-wide">
            <div className="havi-hero-frame">
              <div className="havi-showcase-grid">
                <div className="havi-content-stack">
                  <h1 className="havi-text-hero">{homepageContent.headline}</h1>
                  <p className="havi-text-subhead">{homepageContent.subhead}</p>
                  <div className="havi-actions-row">
                    <Button className="havi-cta-primary" asChild>
                      <Link data-testid="home-cta-primary-hero" href="/auth/sign-up">
                        {homepageContent.primaryCtaLabel}
                      </Link>
                    </Button>
                    <Button className="havi-cta-secondary" variant="outline" asChild>
                      <Link data-testid="home-cta-secondary-hero" href="/stories">
                        {homepageContent.secondaryCtaLabel}
                      </Link>
                    </Button>
                  </div>
                  <p className="havi-hero-trust">
                    Private by default. Built for real family life.
                  </p>
                </div>
                <aside className="havi-showcase-object" data-testid="home-hero-object">
                  <div className="havi-hero-product-stage">
                    <div className="havi-product-shot-media havi-product-shot-media-hero havi-feature-focus">
                      <Image
                        src={heroShot.src}
                        alt={heroShot.alt}
                        fill
                        sizes="(max-width: 768px) 100vw, 560px"
                        className="havi-feature-crop havi-feature-crop-chat"
                        priority
                      />
                    </div>
                    <p className="havi-marketing-hero-row-title">{heroShot.title}</p>
                    <p className="havi-marketing-hero-row-detail">{heroShot.caption}</p>
                  </div>
                </aside>
              </div>
            </div>
          </div>
        </section>

        <section
          className="havi-section-block havi-section-plain havi-section-compact"
          data-testid="home-section-problem"
        >
          <div className="havi-container-wide">
            <div className="havi-content-block">
              <h2 className="havi-problem-title">{homepageContent.problemTitle}</h2>
              <p className="havi-text-body">{homepageContent.problemBody}</p>
            </div>
          </div>
        </section>

        <section className="havi-section-block havi-canvas-band-light havi-section-feature-gallery" data-testid="home-section-features">
          <div className="havi-container-wide">
            <div className="havi-product-shot-grid">
              {homepageContent.productShots.map((shot) => (
                <article key={shot.title} className="havi-product-figure">
                  <div className="havi-product-shot-media havi-feature-focus">
                    <Image
                      src={shot.src}
                      alt={shot.alt}
                      fill
                      sizes="(max-width: 768px) 100vw, 460px"
                      className={`havi-feature-crop havi-feature-crop-${shot.crop}`}
                    />
                  </div>
                  <p className="havi-marketing-card-title mt-4">{shot.title}</p>
                  <p className="havi-marketing-card-body">{shot.caption}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          className="havi-section-block havi-canvas-band-soft"
          data-testid="home-section-comparison"
        >
          <div className="havi-container-wide">
            <div className="havi-content-block">
              <h2 className="havi-text-title">See the difference in a real day</h2>
            </div>
            <div className="havi-comparison-rows" data-testid="home-comparison-grid">
              {comparisonRows.map((row) => (
                <div key={`${row.without}-${row.with}`} className="havi-comparison-row">
                  <article className="havi-comparison-item havi-comparison-item-without">
                    <p className="havi-comparison-item-label">Without Havi</p>
                    <p className="havi-comparison-item-copy">{row.without}</p>
                  </article>
                  <article className="havi-comparison-item havi-comparison-item-with">
                    <p className="havi-comparison-item-label">With Havi</p>
                    <p className="havi-comparison-item-copy">{row.with}</p>
                  </article>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          className="havi-section-block havi-section-plain"
          data-testid="home-section-proof"
        >
          <div className="havi-container-wide">
            <div className="havi-proof-grid">
              {homepageContent.proofPoints.map((proof) => (
                <Card
                  key={proof.label}
                  className={`havi-showcase-card ${
                    proof.tone === "warm"
                      ? "havi-proof-tone-warm"
                      : proof.tone === "fresh"
                        ? "havi-proof-tone-fresh"
                        : "havi-proof-tone-focus"
                  }`}
                >
                  <CardContent className="p-5">
                    <p className="havi-marketing-proof-value">{proof.value}</p>
                    <p className="havi-marketing-proof-label">{proof.label}</p>
                    <p className="havi-marketing-proof-detail">{proof.detail}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="havi-showcase-cta-frame">
              <p className="havi-marketing-cta-copy">
                Start with one conversation. Havi will build your family memory from there.
              </p>
              <div className="havi-actions-row">
                <Button className="havi-cta-primary" asChild>
                  <Link data-testid="home-cta-primary-proof" href="/auth/sign-up">
                    {homepageContent.primaryCtaLabel}
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section
          className="havi-section-block havi-canvas-band-soft"
          data-testid="home-section-benefits"
        >
          <div className="havi-container-wide">
            <div className="havi-content-block">
              <h2 className="havi-text-title">What you can do with Havi each day</h2>
            </div>
            <div className="havi-benefits-grid">
              {homepageContent.benefits.map((benefit) => (
                <Card key={benefit.title} className="havi-showcase-card">
                  <CardContent className="p-5">
                    <h3 className="havi-marketing-card-title">{benefit.title}</h3>
                    <p className="havi-marketing-card-body">{benefit.body}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="havi-section-block havi-canvas-band-light" data-testid="home-section-closing">
          <div className="havi-container-wide">
            <div className="havi-content-stack max-w-3xl">
              <h2 className="havi-text-title">{homepageContent.closingTitle}</h2>
              <p className="havi-text-body">{homepageContent.closingBody}</p>
              <div className="havi-actions-row">
                <Button className="havi-cta-primary" asChild>
                  <Link data-testid="home-cta-primary-closing" href="/auth/sign-up">
                    {homepageContent.primaryCtaLabel}
                  </Link>
                </Button>
                <Button className="havi-cta-secondary" variant="outline" asChild>
                  <Link data-testid="home-cta-secondary-closing" href="/stories">
                    {homepageContent.secondaryCtaLabel}
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </MarketingLayout>
  );
}
