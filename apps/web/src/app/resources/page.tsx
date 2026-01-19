import type { Metadata } from "next";
import Link from "next/link";

import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Havi Resources | Calm guidance",
  description:
    "Resources and guidance for parents seeking clarity, shared memory, and calm decision-making.",
};

const resourceLinks = [
  {
    title: "Blog",
    description: "Short, calm reads on mental load, shared memory, and modern parenting.",
    href: "/resources/blog",
  },
  {
    title: "Stories",
    description: "Real parent moments that show what another brain feels like.",
    href: "/stories",
  },
  {
    title: "Solutions",
    description: "Explore Runway, conversation-first capture, and shared memory.",
    href: "/solutions",
  },
];

export default function ResourcesPage() {
  return (
    <MarketingLayout>
      <section>
        <div className="mx-auto w-full max-w-6xl px-6 py-16">
          <div className="max-w-2xl space-y-4">
            <h1 className="text-3xl font-semibold md:text-4xl">Resources for calmer parenting</h1>
            <p className="text-base text-muted-foreground">
              Explore guidance, stories, and frameworks that help reduce mental load and
              keep families aligned.
            </p>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {resourceLinks.map((resource) => (
              <Card key={resource.title} className="h-full">
                <CardHeader>
                  <CardTitle className="text-lg">{resource.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <p>{resource.description}</p>
                  <Link
                    href={resource.href}
                    className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    Explore
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
