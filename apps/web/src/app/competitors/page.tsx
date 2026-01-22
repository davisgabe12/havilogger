import type { Metadata } from "next";
import Link from "next/link";

import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Havi vs. Competitors | Memory, conversation, foresight",
  description:
    "Compare Havi with trackers, notes apps, and family organizers to see how memory, conversation, and Runway foresight reduce mental load.",
};

const competitors = [
  {
    name: "Huckleberry (sleep / routines)",
    job: "Manage sleep schedules & predictions",
    strengths: "Strong routine views; sleep focus",
    breaks: "Logging-heavy; narrow scope outside sleep",
    havi: "Conversation-first capture plus broader family memory",
  },
  {
    name: "Nara Baby (tracking)",
    job: "Log feeds/diapers/sleep",
    strengths: "Simple tracking UI",
    breaks: "High logging burden; limited meaning/search",
    havi: "Learns from moments and questions; searchable memory",
  },
  {
    name: "Baby Connect / generic trackers",
    job: "Comprehensive baby tracking",
    strengths: "Lots of categories",
    breaks: "Complexity grows; coordination is hard",
    havi: "Clarity + context with shared family brain",
  },
  {
    name: "Apple Notes / Google Keep",
    job: "Capture notes quickly",
    strengths: "Ubiquitous; fast",
    breaks: "Hard to retrieve at the right moment",
    havi: "Purpose-built retrieval + Runway foresight",
  },
  {
    name: "Notion (workspace)",
    job: "Organize information & docs",
    strengths: "Powerful structure",
    breaks: "Setup overhead; not designed for sleepy moments",
    havi: "Lightweight, conversational, parent-native",
  },
  {
    name: "Google Calendar / reminders",
    job: "Schedule and remind",
    strengths: "Reliable reminders",
    breaks: "Context and history get lost",
    havi: "Couples reminders with memory + guidance",
  },
  {
    name: "WhatsApp / iMessage threads",
    job: "Coordinate caregivers",
    strengths: "Fast communication",
    breaks: "Decisions get buried; info fragments",
    havi: "Shared source of truth instead of another thread",
  },
  {
    name: "Cozi / family organizer",
    job: "Family schedules & lists",
    strengths: "Household coordination",
    breaks: "Limited intelligence; doesn’t adapt",
    havi: "Combines coordination + understanding + foresight",
  },
];

export default function CompetitorsPage() {
  return (
    <MarketingLayout>
      <section>
        <div className="mx-auto w-full max-w-6xl px-6 py-16">
          <div className="max-w-2xl space-y-4">
            <h1 className="text-3xl font-semibold md:text-4xl">Competitive landscape</h1>
            <p className="text-base text-muted-foreground">
              Most tools optimize tracking or notes. Havi’s wedge is memory + conversation
              + Runway foresight across the whole family—without turning parenting into
              data entry.
            </p>
          </div>

          <div className="mt-10 space-y-6 md:hidden">
            {competitors.map((item) => (
              <Card key={item.name}>
                <CardHeader>
                  <CardTitle className="text-lg">{item.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <p>
                    <span className="font-semibold text-foreground">Job:</span> {item.job}
                  </p>
                  <p>
                    <span className="font-semibold text-foreground">Strengths:</span> {item.strengths}
                  </p>
                  <p>
                    <span className="font-semibold text-foreground">Where it breaks:</span> {item.breaks}
                  </p>
                  <p>
                    <span className="font-semibold text-foreground">Havi advantage:</span> {item.havi}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="mt-10 hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border/60 text-muted-foreground">
                  <th className="py-3 pr-4">Tool / Category</th>
                  <th className="py-3 pr-4">Primary job-to-be-done</th>
                  <th className="py-3 pr-4">Strengths</th>
                  <th className="py-3 pr-4">Where it breaks for parents</th>
                  <th className="py-3">Havi advantage</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                {competitors.map((item) => (
                  <tr key={item.name} className="border-b border-border/40 align-top">
                    <td className="py-4 pr-4 font-medium text-foreground">{item.name}</td>
                    <td className="py-4 pr-4">{item.job}</td>
                    <td className="py-4 pr-4">{item.strengths}</td>
                    <td className="py-4 pr-4">{item.breaks}</td>
                    <td className="py-4">{item.havi}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-12 space-y-4">
            <h2 className="text-2xl font-semibold">Why Havi is different</h2>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• Parents stitch together trackers, notes, calendars, and texts.</li>
              <li>• No single family brain remembers, explains, and anticipates.</li>
              <li>• Havi combines conversation-first capture, durable memory, and Runway foresight.</li>
              <li>• The result is less cognitive load and calmer decisions.</li>
            </ul>
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Button asChild>
              <Link href="/signup">Get started</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/solutions">Explore solutions</Link>
            </Button>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
