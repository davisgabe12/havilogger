import type { Metadata } from "next";
import Link from "next/link";

import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Havi Blog | Calm parenting insights",
  description:
    "Short, calm reads on reducing mental load, building shared memory, and staying aligned.",
};

const posts = [
  {
    title: "The mental load is real",
    description: "Why parenting feels heavy—and how another brain can help.",
  },
  {
    title: "From advice to clarity",
    description: "Turning fragmented guidance into decisions you can trust.",
  },
  {
    title: "Runway for real life",
    description: "How foresight reduces uncertainty for modern families.",
  },
];

export default function BlogPage() {
  return (
    <MarketingLayout>
      <section>
        <div className="mx-auto w-full max-w-5xl px-6 py-16">
          <div className="max-w-2xl space-y-4">
            <h1 className="text-3xl font-semibold md:text-4xl">Havi blog</h1>
            <p className="text-base text-muted-foreground">
              Calm, thoughtful reads on memory, mental load, and staying aligned as a
              family.
            </p>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {posts.map((post) => (
              <Card key={post.title} className="h-full">
                <CardContent className="space-y-3 p-6 text-sm text-muted-foreground">
                  <h2 className="text-base font-semibold text-foreground">{post.title}</h2>
                  <p>{post.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="mt-10">
            <Link
              href="/resources"
              className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
            >
              Back to resources
            </Link>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
