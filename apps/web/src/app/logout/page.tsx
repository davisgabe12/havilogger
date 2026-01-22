import Link from "next/link";

import { HaviWordmark } from "@/components/brand/HaviWordmark";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LogoutPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="havi-card-shell w-full max-w-md">
        <CardHeader className="space-y-3 text-center">
          <div className="flex justify-center text-muted-foreground">
            <HaviWordmark />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-xl">Ready to sign out?</CardTitle>
            <CardDescription>We&apos;ll keep your logs safe until you return.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button className="w-full" type="button">
            Sign out
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href="/">Return to dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
