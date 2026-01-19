import type { Metadata } from "next";
import Link from "next/link";

import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Havi | Another brain for your family",
  description:
    "Havi helps parents carry the mental load with calm, conversational support, shared memory, and Runway foresight.",
};

const featureHighlights = [
  {
    title: "Conversation-first support",
    description:
      "Ask questions by chat or voice and get calm guidance fast, without digging through tabs or threads.",
  },
  {
    title: "Runway: a clear path ahead",
    description:
      "See what’s coming next and reduce guesswork with a simple, shared view of family growth.",
  },
  {
    title: "Shared family memory",
    description:
      "Keep moments, decisions, and context in one place so partners and caregivers stay aligned.",
  },
];

const whyHavi = [
  {
    title: "Too much to remember",
    body: "Havi keeps moments, notes, and questions in one calm place, so nothing valuable disappears.",
  },
  {
    title: "Advice everywhere. Clarity nowhere.",
    body: "Havi helps you make sense of guidance in the context of your child and your situation.",
  },
  {
    title: "Less logging. More living.",
    body: "Capture information naturally through conversation and quick moments—then let Havi make it useful later.",
  },
];

const quotes = [
  "I’m not failing—I’m overloaded. Havi makes it feel manageable.",
  "It’s like having another brain that actually remembers what happened.",
  "We stopped arguing about who said what. We finally feel aligned.",
  "At 3 a.m., I don’t need a blog post. I need a clear next step.",
];

export default function HomePage() {
  return (
    <MarketingLayout>
      <section className="border-b border-border/60">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-16 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl space-y-6">
            <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">
              Havi — another brain for your family
            </p>
            <h1 className="text-3xl font-semibold leading-tight md:text-5xl">
              Havi is another brain for your family—designed to help you be the parent
              you want to be.
            </h1>
            <p className="text-lg text-muted-foreground">
              Parenting isn’t hard because parents aren’t trying hard enough. It’s hard
              because there’s too much to hold in your head—often on very little sleep.
            </p>
            <p className="text-base text-muted-foreground">
              Havi helps carry the mental load. It learns as you live, not as you log,
              bringing moments, questions, reminders, and insights into one calm place.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/signup">Get started</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/stories">Read stories</Link>
              </Button>
            </div>
          </div>
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-lg">Built for the mental load</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <p>
                Havi remembers for you when sleep deprivation changes everything, and it
                keeps care teams aligned without more meetings or message threads.
              </p>
              <p>
                The goal is simple: be present now, and prepared for what’s next—without
                turning parenting into data entry.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="border-b border-border/60">
        <div className="mx-auto w-full max-w-6xl px-6 py-16">
          <div className="grid gap-6 md:grid-cols-3">
            {featureHighlights.map((feature) => (
              <Card key={feature.title} className="h-full">
                <CardHeader>
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {feature.description}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-border/60">
        <div className="mx-auto w-full max-w-6xl px-6 py-16">
          <div className="mb-10 max-w-2xl space-y-4">
            <h2 className="text-2xl font-semibold md:text-3xl">Why Havi</h2>
            <p className="text-base text-muted-foreground">
              Built for real families. Designed to reduce the cognitive load of modern
              parenting.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {whyHavi.map((item) => (
              <div key={item.title} className="space-y-3 rounded-lg border border-border/60 p-6">
                <h3 className="text-base font-semibold">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-border/60">
        <div className="mx-auto w-full max-w-6xl px-6 py-16">
          <div className="mb-10 max-w-2xl space-y-4">
            <h2 className="text-2xl font-semibold md:text-3xl">What parents say</h2>
            <p className="text-base text-muted-foreground">
              Early reactions from parents who want a calmer, clearer way to keep up.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {quotes.map((quote) => (
              <blockquote
                key={quote}
                className="rounded-lg border border-border/60 p-6 text-sm text-muted-foreground"
              >
                “{quote}”
              </blockquote>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-4 px-6 py-16 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl space-y-3">
            <h2 className="text-2xl font-semibold md:text-3xl">
              Ready for a calmer way to parent?
            </h2>
            <p className="text-base text-muted-foreground">
              Havi is a family brain that learns as you live—helping you reduce mental
              load and stay ready for what’s next.
            </p>
          </div>
          <Button asChild>
            <Link href="/signup">Get started</Link>
          </Button>
        </div>
      </section>
    </MarketingLayout>
  );
}
