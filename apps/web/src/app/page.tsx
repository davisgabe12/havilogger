import Link from "next/link";
import Image from "next/image";

import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type HomepageBenefit = {
  title: string;
  body: string;
};

type HomepageEvidenceShot = {
  src: string;
  alt: string;
  title: string;
  caption: string;
  crop: "timeline" | "task";
};

type HomepageTestimonial = {
  quote: string;
  name: string;
  city: string;
};

type HomepageContent = {
  heroKicker: string;
  headline: string;
  subhead: string;
  problemTitle: string;
  problemBody: string;
  comparisonWithout: string[];
  comparisonWith: string[];
  comparisonCompanion: {
    src: string;
    alt: string;
    title: string;
    caption: string;
  };
  benefitsTitle: string;
  benefits: HomepageBenefit[];
  trustLine: string;
  trustBody: string;
  evidenceShots: HomepageEvidenceShot[];
  testimonials: HomepageTestimonial[];
  closingTitle: string;
  closingBody: string;
  primaryCtaLabel: string;
  secondaryCtaLabel: string;
};

const homepageContent: HomepageContent = {
  heroKicker: "The partner parents have been waiting for",
  headline: "Parenthood moves fast. Stay ahead and present with Havi.",
  subhead:
    "Track sleep, feeding, diapers, behavior, and routines in one shared thread. Talk with Havi like a partner to decide what to do next.",
  problemTitle: "The hardest part isn\'t caring. It\'s carrying every detail.",
  problemBody:
    "When updates live across texts, apps, and memory, families spend energy reconstructing what happened instead of deciding what to do next.",
  comparisonWithout: [
    "Updates are scattered across chats and notes.",
    "Parents repeat the same context over and over.",
    "Questions pile up at the worst moment.",
    "Plans drift between partners and helpers.",
  ],
  comparisonWith: [
    "Sleep, feeding, diapers, behavior, and routines stay in one thread.",
    "Havi remembers key details so everyone starts aligned.",
    "Ask in conversation and get next steps tailored to your child.",
    "Reminders, updates, and tasks stay in sync across your village.",
  ],
  comparisonCompanion: {
    src: "/brand/product/comparison-companion.png",
    alt: "Havi timeline companion view",
    title: "Shared context at a glance",
    caption: "One timeline keeps every handoff grounded in the same story.",
  },
  benefitsTitle: "How parents use Havi every day",
  benefits: [
    {
      title: "Track everything in one place",
      body: "Sleep, feeding, diapers, behavior, routines, and notes stay in one thread.",
    },
    {
      title: "Get support through every phase",
      body: "From sleepless nights to wild mornings, Havi stays with your family.",
    },
    {
      title: "Get guidance tailored to your child",
      body: "From tantrums to transitions, get next steps shaped to your child and context.",
    },
    {
      title: "Keep your village in sync",
      body: "Share updates, reminders, and plans so everyone knows what\'s happening and what\'s next.",
    },
  ],
  trustLine: "Built on child-development literature and expert-informed guidance.",
  trustBody:
    "Track daily moments in one shared place. Then talk with Havi like a partner to surface insights, bring in guidance, and decide what to do next.",
  evidenceShots: [
    {
      src: "/brand/product/proof-pattern-clarity.png",
      alt: "Havi timeline showing pattern clarity",
      title: "See what changed",
      caption: "Patterns become visible across days, not just isolated moments.",
      crop: "timeline",
    },
    {
      src: "/brand/product/proof-task-coordination.png",
      alt: "Havi tasks showing coordinated follow-through",
      title: "Turn insight into action",
      caption: "Create tasks and reminders from conversation in seconds.",
      crop: "task",
    },
  ],
  testimonials: [
    {
      quote:
        "We stopped repeating the same update in three chats. Now everyone sees the same story and we decide faster.",
      name: "Nina",
      city: "Brooklyn, NY",
    },
    {
      quote:
        "I track things in seconds while I\'m in the moment, and Havi helps me connect what changed across the week.",
      name: "Ethan",
      city: "Austin, TX",
    },
    {
      quote:
        "It feels like a calm teammate. I ask one question and get a clear next step instead of spiraling.",
      name: "Marisol",
      city: "San Diego, CA",
    },
  ],
  closingTitle: "Now parents can be present. Havi handles the mental load.",
  closingBody:
    "Start with one conversation. Havi keeps context, guidance, and next steps in one place each day.",
  primaryCtaLabel: "Start now",
  secondaryCtaLabel: "Read stories",
};

export default function MarketingHomePage() {
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
                  <p className="havi-text-kicker">{homepageContent.heroKicker}</p>
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
                  <p className="havi-hero-trust">Private by default. Built for real family life.</p>
                </div>
                <aside className="havi-showcase-object" data-testid="home-hero-object">
                  <div className="havi-hero-product-stage">
                    <div className="havi-product-shot-media havi-product-shot-media-hero havi-feature-focus">
                      <Image
                        src="/brand/product/hero-chat-thread.png"
                        alt="Havi chat thread with parent updates and guidance"
                        fill
                        sizes="(max-width: 768px) 100vw, 560px"
                        className="havi-feature-crop havi-feature-crop-chat"
                        priority
                      />
                    </div>
                    <p className="havi-marketing-hero-row-title">Real thread, real context</p>
                    <p className="havi-marketing-hero-row-detail">One conversation captures what happened and what to do next.</p>
                  </div>
                </aside>
              </div>
            </div>
          </div>
        </section>

        <section className="havi-section-block havi-section-plain havi-section-compact" data-testid="home-section-problem">
          <div className="havi-container-wide">
            <div className="havi-content-block havi-content-block-problem">
              <h2 className="havi-problem-title">{homepageContent.problemTitle}</h2>
              <p className="havi-text-body">{homepageContent.problemBody}</p>
            </div>
          </div>
        </section>

        <section className="havi-section-block havi-canvas-band-soft" data-testid="home-section-comparison">
          <div className="havi-container-wide">
            <div className="havi-content-block">
              <h2 className="havi-text-title">See the difference in a real day</h2>
              <p className="havi-text-body">Left is the default scramble. Right is the same day with shared context and clear next steps.</p>
            </div>
            <div className="havi-comparison-layout" data-testid="home-comparison-grid">
              <div>
                <div className="havi-comparison-columns-head">
                  <p className="havi-comparison-column-title">Today without Havi</p>
                  <p className="havi-comparison-column-title">With Havi</p>
                </div>
                <div className="havi-comparison-rows">
                  {comparisonRows.map((row) => (
                    <div key={`${row.without}-${row.with}`} className="havi-comparison-row">
                      <article className="havi-comparison-item havi-comparison-item-without">
                        <p className="havi-comparison-item-label md:hidden">Today without Havi</p>
                        <p className="havi-comparison-item-copy">{row.without}</p>
                      </article>
                      <article className="havi-comparison-item havi-comparison-item-with">
                        <p className="havi-comparison-item-label md:hidden">With Havi</p>
                        <p className="havi-comparison-item-copy">{row.with}</p>
                      </article>
                    </div>
                  ))}
                </div>
              </div>
              <aside className="havi-comparison-companion" data-testid="home-comparison-companion">
                <div className="havi-product-shot-media">
                  <Image
                    src={homepageContent.comparisonCompanion.src}
                    alt={homepageContent.comparisonCompanion.alt}
                    fill
                    sizes="(max-width: 1024px) 100vw, 420px"
                    className="havi-feature-crop havi-feature-crop-timeline"
                  />
                </div>
                <p className="havi-marketing-card-title mt-4">{homepageContent.comparisonCompanion.title}</p>
                <p className="havi-marketing-card-body">{homepageContent.comparisonCompanion.caption}</p>
              </aside>
            </div>
          </div>
        </section>

        <section className="havi-section-block havi-canvas-band-light" data-testid="home-section-benefits">
          <div className="havi-container-wide">
            <div className="havi-content-block">
              <h2 className="havi-text-title">{homepageContent.benefitsTitle}</h2>
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

        <section className="havi-section-block havi-canvas-band-soft" data-testid="home-section-evidence">
          <div className="havi-container-wide">
            <div className="havi-proof-evidence-grid">
              {homepageContent.evidenceShots.map((shot) => (
                <article key={shot.title} className="havi-product-figure">
                  <div className="havi-product-shot-media havi-feature-focus">
                    <Image
                      src={shot.src}
                      alt={shot.alt}
                      fill
                      sizes="(max-width: 768px) 100vw, 520px"
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

        <section className="havi-section-block havi-section-plain" data-testid="home-section-testimonials">
          <div className="havi-container-wide">
            <div className="havi-content-block">
              <p className="havi-text-kicker">Why parents trust Havi</p>
              <h2 className="havi-text-title">{homepageContent.trustLine}</h2>
              <p className="havi-text-body">{homepageContent.trustBody}</p>
            </div>
            <div className="havi-testimonials-grid" data-testid="home-testimonials-grid">
              {homepageContent.testimonials.map((item) => (
                <Card key={`${item.name}-${item.city}`} className="havi-showcase-card">
                  <CardContent className="p-5">
                    <p className="havi-marketing-card-body">“{item.quote}”</p>
                    <p className="havi-testimonial-meta">{item.name}, {item.city}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="havi-showcase-cta-frame">
              <p className="havi-marketing-cta-copy">Start with one conversation. Havi turns moments into clarity for your whole care team.</p>
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
