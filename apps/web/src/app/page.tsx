import Link from "next/link";

import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function MarketingHomePage() {
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
                <Link href="/auth/sign-up">Get started</Link>
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
    </MarketingLayout>
  );
}
