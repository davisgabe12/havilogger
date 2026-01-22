import type { Metadata } from "next";
import Link from "next/link";

import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Insights | Clarity instead of noise",
  description:
    "Havi turns fragmented advice into clear, contextual guidance for your child and your situation.",
};

export default function InsightsPage() {
  return (
    <MarketingLayout>
      <section>
        <div className="mx-auto w-full max-w-4xl px-6 py-16">
          <div className="space-y-6">
            <h1 className="text-3xl font-semibold md:text-4xl">Clarity instead of noise</h1>
            <p className="text-base text-muted-foreground">
              Parents are surrounded by information—often conflicting, rarely contextual.
              Havi helps you make sense of guidance in the context of your child and your
              situation, so you can decide with confidence.
            </p>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li>• Pull advice into one calm, searchable place.</li>
              <li>• Connect questions to the moments that matter.</li>
              <li>• Move from uncertainty to clear next steps.</li>
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
