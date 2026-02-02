import type { Metadata } from "next";
import Link from "next/link";

import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Havi Pricing | Calm, shared family memory",
  description:
    "Explore Havi pricing for parents who want a calm, conversational family brain with shared memory and Runway foresight.",
};

const tiers = [
  {
    title: "Free",
    price: "$0",
    detail: "Start capturing moments and questions without friction.",
    bullets: [
      "Conversational capture",
      "Basic shared memory",
      "Runway preview",
    ],
  },
  {
    title: "Havi Plus",
    price: "Monthly / Annual",
    detail: "Unlock deeper memory, guidance, and shared alignment.",
    bullets: [
      "Full family memory",
      "Runway foresight",
      "Caregiver sharing",
    ],
  },
  {
    title: "Family Plan",
    price: "Up to 5 caregivers",
    detail: "Bring partners, grandparents, and caregivers into one calm source of truth.",
    bullets: [
      "Shared timelines",
      "Care team alignment",
      "Priority onboarding",
    ],
  },
];

export default function PricingPage() {
  return (
    <MarketingLayout>
      <section>
        <div className="mx-auto w-full max-w-6xl px-6 py-16">
          <div className="max-w-2xl space-y-4">
            <h1 className="text-3xl font-semibold md:text-4xl">Simple pricing for modern families</h1>
            <p className="text-base text-muted-foreground">
              Havi is built to reduce mental load, not add more work. Start for free and
              upgrade when you want deeper memory, Runway guidance, and shared alignment.
            </p>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {tiers.map((tier) => (
              <Card key={tier.title} className="h-full">
                <CardHeader>
                  <CardTitle className="text-lg">{tier.title}</CardTitle>
                  <p className="text-sm text-muted-foreground">{tier.price}</p>
                </CardHeader>
                <CardContent className="space-y-4 text-sm text-muted-foreground">
                  <p>{tier.detail}</p>
                  <ul className="space-y-2">
                    {tier.bullets.map((bullet) => (
                      <li key={bullet}>• {bullet}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Button asChild>
              <Link href="/auth/sign-up">Get started</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/stories">Read stories</Link>
            </Button>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
