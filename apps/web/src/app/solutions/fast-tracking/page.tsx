import type { Metadata } from "next";
import Link from "next/link";

import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Runway | Fast-tracking what’s next",
  description:
    "Runway gives families a clear path forward with foresight on what matters now and what’s coming next.",
};

export default function FastTrackingPage() {
  return (
    <MarketingLayout>
      <section>
        <div className="mx-auto w-full max-w-4xl px-6 py-16">
          <div className="space-y-6">
            <h1 className="text-3xl font-semibold md:text-4xl">Runway: a clear path forward</h1>
            <p className="text-base text-muted-foreground">
              Havi provides Runway—a simple view of family growth and what’s coming next.
              Stop guessing. Reduce the toll of uncertainty. Be ready for the next phase
              without drowning in tabs and notes.
            </p>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li>• See what matters now, not everything at once.</li>
              <li>• Share a clear plan with partners and caregivers.</li>
              <li>• Turn memory into foresight without extra logging.</li>
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
