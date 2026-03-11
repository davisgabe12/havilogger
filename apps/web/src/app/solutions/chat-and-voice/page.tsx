import type { Metadata } from "next";
import Link from "next/link";

import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Chat and Voice | Always there, conversationally",
  description:
    "Havi is there 24/7 by chat or voice with calm, conversational support for parents.",
};

export default function ChatAndVoicePage() {
  return (
    <MarketingLayout>
      <section className="havi-section-block havi-canvas-band-soft">
        <div className="havi-container-wide max-w-4xl">
          <div className="space-y-6">
            <h1 className="havi-text-title">Always there, conversationally</h1>
            <p className="havi-text-body">
              Havi is there 24/7—by chat, voice, or quick prompts. Call Havi for a calm
              answer in the moment, without searching through blogs or threads.
            </p>
            <ul className="space-y-3 text-sm havi-text-body">
              <li>• Capture information naturally through conversation.</li>
              <li>• Ask questions day or night and get grounded guidance.</li>
              <li>• Keep the focus on being present, not logging.</li>
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
