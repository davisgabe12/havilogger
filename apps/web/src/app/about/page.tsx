import type { Metadata } from "next";
import Link from "next/link";

import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "About Havi | Another brain for families",
  description:
    "Learn why Havi exists, what it is, and the calm design philosophy behind the family brain.",
};

export default function AboutPage() {
  return (
    <MarketingLayout>
      <section className="havi-section-block havi-canvas-band-light">
        <div className="havi-container-wide max-w-4xl">
          <div className="space-y-6">
            <h1 className="havi-text-title">About Havi</h1>
            <p className="havi-text-body">
              Havi is a family brain that learns as you live—helping parents reduce
              mental load and close the gap to the parent they want to be.
            </p>
            <div className="space-y-4">
              <h2 className="havi-marketing-card-title">What Havi is</h2>
              <p className="havi-text-body">
                Havi captures moments, questions, and reminders naturally through
                conversation. It remembers what matters and surfaces it when you need it
                most.
              </p>
            </div>
            <div className="space-y-4">
              <h2 className="havi-marketing-card-title">Why it exists</h2>
              <p className="havi-text-body">
                Parenting is cognitively demanding. Information is fragmented, sleep is
                broken, and care is shared across multiple people. Havi brings clarity
                to the chaos with a calm, shared memory.
              </p>
            </div>
            <div className="space-y-4">
              <h2 className="havi-marketing-card-title">Design philosophy</h2>
              <p className="havi-text-body">
                Calm, evidence-aware, and respectful. Havi is designed to feel premium
                and restrained—keeping focus on what matters, not on more noise.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button className="havi-cta-primary" asChild>
                <Link href="/auth/sign-up">Get started</Link>
              </Button>
              <Button className="havi-cta-secondary" variant="outline" asChild>
                <Link href="/stories">Read stories</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
