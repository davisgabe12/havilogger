import Link from "next/link";

import { HaviWordmark } from "@/components/brand/HaviWordmark";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const FAMILY_OPTIONS = [
  { id: "family-1", name: "Avery & Oak", detail: "Primary household" },
  { id: "family-2", name: "Daycare Crew", detail: "Shared caregiver log" },
];

export default function SelectFamilyPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="havi-card-shell w-full max-w-md">
        <CardHeader className="space-y-3 text-center">
          <div className="flex justify-center text-muted-foreground">
            <HaviWordmark />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-xl">Choose a family</CardTitle>
            <CardDescription>Select the log you want to update right now.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {FAMILY_OPTIONS.map((family) => (
              <button
                key={family.id}
                type="button"
                className="flex w-full flex-col items-start gap-1 rounded-md border border-border bg-background/40 px-4 py-3 text-left text-sm text-foreground transition hover:bg-accent"
              >
                <span className="font-medium">{family.name}</span>
                <span className="text-xs text-muted-foreground">{family.detail}</span>
              </button>
            ))}
          </div>
          <Button className="w-full" type="button">
            Continue
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href="/login">Switch account</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
