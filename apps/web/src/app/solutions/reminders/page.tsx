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
      <section className="havi-section-block havi-canvas-band-soft">
        <div className="havi-container-wide max-w-4xl">
          <div className="space-y-6">
            <h1 className="havi-text-title">Remember what matters</h1>
            <p className="havi-text-body">
              When sleep is broken, memory and decision-making suffer. Havi remembers
              for you—so you don’t have to rely on recall when you’re exhausted.
            </p>
            <ul className="space-y-3 text-sm havi-text-body">
              <li>• Keep important moments from slipping away.</li>
              <li>• Pair reminders with the context behind them.</li>
              <li>• Stay prepared without another logging ritual.</li>
            </ul>
            <div className="flex flex-wrap gap-3">
              <Button className="havi-cta-primary" asChild>
                <Link href="/auth/sign-up">Get started</Link>
              </Button>
              <Button className="havi-cta-secondary" variant="outline" asChild>
                <Link href="/solutions">Back to solutions</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
