import type { Metadata } from "next";
import Link from "next/link";

import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Havi Partners | Calm coordination",
  description:
    "Partner with Havi to support families through calmer coordination, shared memory, and Runway foresight.",
};

export default function PartnersPage() {
  return (
    <MarketingLayout>
      <section className="havi-section-block havi-canvas-band-soft">
        <div className="havi-container-wide max-w-4xl">
          <div className="space-y-6">
            <h1 className="havi-text-title">Partners who care about mental load</h1>
            <p className="havi-text-body">
              Havi is built to support families through calm coordination and shared
              memory. We partner with pediatric practices, doulas, sleep consultants, and
              trusted care networks to help parents close the gap to the parent they want
              to be.
            </p>
            <ul className="space-y-3 text-sm havi-text-body">
              <li>• Provide a shared brain for care teams.</li>
              <li>• Reduce overwhelm during high-intent windows.</li>
              <li>• Offer evidence-aware guidance in a calm interface.</li>
            </ul>
            <div className="flex flex-wrap gap-3">
              <Button className="havi-cta-primary" asChild>
                <Link href="/auth/sign-up">Get started</Link>
              </Button>
              <Button className="havi-cta-secondary" variant="outline" asChild>
                <Link href="/resources">Explore resources</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
