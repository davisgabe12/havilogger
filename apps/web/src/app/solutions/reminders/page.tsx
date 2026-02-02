import type { Metadata } from "next";
import Link from "next/link";

import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Reminders | Remember what matters",
  description:
    "Havi remembers for you so nothing valuable disappears, especially when sleep deprivation makes recall hard.",
};

export default function RemindersPage() {
  return (
    <MarketingLayout>
      <section>
        <div className="mx-auto w-full max-w-4xl px-6 py-16">
          <div className="space-y-6">
            <h1 className="text-3xl font-semibold md:text-4xl">Remember what matters</h1>
            <p className="text-base text-muted-foreground">
              When sleep is broken, memory and decision-making suffer. Havi remembers
              for you—so you don’t have to rely on recall when you’re exhausted.
            </p>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li>• Keep important moments from slipping away.</li>
              <li>• Pair reminders with the context behind them.</li>
              <li>• Stay prepared without another logging ritual.</li>
            </ul>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/auth/sign-up">Get started</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/solutions">Back to solutions</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
