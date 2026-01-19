import type { Metadata } from "next";
import Link from "next/link";

import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Havi Solutions | Learn as you live",
  description:
    "Explore Havi solutions for conversation-first support, Runway foresight, and shared family memory without heavy logging.",
};

const solutions = [
  {
    title: "Fast-tracking what’s next",
    description:
      "Runway gives you a clear view of what’s coming so you can stop guessing and plan with confidence.",
    href: "/solutions/fast-tracking",
  },
  {
    title: "Insight without the noise",
    description:
      "Turn fragmented advice into decisions you can trust, grounded in your child and your situation.",
    href: "/solutions/insights",
  },
  {
    title: "Reminders with context",
    description:
      "Remember the details that matter, especially when sleep deprivation makes recall harder.",
    href: "/solutions/reminders",
  },
  {
    title: "Chat and voice",
    description:
      "Ask in the moment. Havi is there 24/7 for calm, conversational support.",
    href: "/solutions/chat-and-voice",
  },
  {
    title: "Personal memory for the whole family",
    description:
      "Shared context keeps partners and caregivers aligned without endless texts.",
    href: "/solutions/personal",
  },
];

export default function SolutionsPage() {
  return (
    <MarketingLayout>
      <section>
        <div className="mx-auto w-full max-w-6xl px-6 py-16">
          <div className="max-w-2xl space-y-4">
            <h1 className="text-3xl font-semibold md:text-4xl">Solutions for real family life</h1>
            <p className="text-base text-muted-foreground">
              Havi combines conversation-first capture, durable memory, and Runway
              foresight so families can stay present and prepared.
            </p>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {solutions.map((solution) => (
              <Card key={solution.title} className="h-full">
                <CardHeader>
                  <CardTitle className="text-lg">{solution.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <p>{solution.description}</p>
                  <Link
                    href={solution.href}
                    className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    Learn more
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
