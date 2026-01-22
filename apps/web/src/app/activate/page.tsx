import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const stepsTotal = 4;

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 w-full rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-primary transition-all"
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

export default function ActivatePage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
      <header className="space-y-3">
        <p className="text-sm font-medium text-muted-foreground">
          Step {stepsTotal} of {stepsTotal}
        </p>
        <ProgressBar value={100} />
      </header>

      <Card className="bg-card">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl">Activate your workspace</CardTitle>
          <CardDescription>
            You&apos;re all set. Enter Havi to start logging and sharing updates.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border/60 bg-muted/40 p-4 text-sm text-muted-foreground">
            We&apos;ll personalize your dashboard as soon as you enter the app.
          </div>
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button asChild>
            <Link href="/">Enter the app</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
