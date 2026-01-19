import type { Metadata } from "next";
import Link from "next/link";

import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Shared Memory | A family brain that stays aligned",
  description:
    "Havi keeps partners, grandparents, and caregivers aligned with a shared family memory built for real life.",
};

export default function PersonalPage() {
  return (
    <MarketingLayout>
      <section>
        <div className="mx-auto w-full max-w-4xl px-6 py-16">
          <div className="space-y-6">
            <h1 className="text-3xl font-semibold md:text-4xl">Shared memory for the whole family</h1>
            <p className="text-base text-muted-foreground">
              Care is shared, but information isn’t. Havi keeps everyone on the same
              page without more messages or meetings, so the family brain stays aligned.
            </p>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li>• Centralize key moments, decisions, and context.</li>
              <li>• Share updates without endless text threads.</li>
              <li>• Make it easier for new caregivers to get oriented fast.</li>
            </ul>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/signup">Get started</Link>
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
