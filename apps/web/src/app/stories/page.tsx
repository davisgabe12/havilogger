import type { Metadata } from "next";
import Link from "next/link";

import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Havi Stories | Real parent moments",
  description:
    "Stories from parents who want a calmer, more confident way to carry the mental load.",
};

const stories = [
  {
    title: "The 3 a.m. answer",
    body: "At 3 a.m., I don’t need a blog post. I need a clear next step. Havi meets me with calm guidance.",
  },
  {
    title: "The alignment moment",
    body: "We stopped arguing about who said what. We finally feel aligned because the context is shared.",
  },
  {
    title: "The memory relief",
    body: "It’s like having another brain that actually remembers what happened, even when I’m running on fumes.",
  },
  {
    title: "The mental load lift",
    body: "I’m not failing—I’m overloaded. Havi makes it feel manageable without adding more work.",
  },
];

export default function StoriesPage() {
  return (
    <MarketingLayout>
      <section className="havi-section-block havi-canvas-band-soft">
        <div className="havi-container-wide">
          <div className="max-w-2xl space-y-4">
            <h1 className="havi-text-title">Stories from real parents</h1>
            <p className="havi-text-body">
              These early stories capture what it feels like to have another brain for
              your family—calm, private, and always there.
            </p>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {stories.map((story) => (
              <Card key={story.title} className="h-full havi-showcase-card">
                <CardContent className="space-y-3 p-6 text-sm havi-text-body">
                  <h2 className="havi-marketing-card-title">{story.title}</h2>
                  <p>{story.body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Button className="havi-cta-primary" asChild>
              <Link href="/auth/sign-up">Get started</Link>
            </Button>
            <Button className="havi-cta-secondary" variant="outline" asChild>
              <Link href="/resources">Explore resources</Link>
            </Button>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
