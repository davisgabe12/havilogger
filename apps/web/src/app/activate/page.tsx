import Link from "next/link";

import { HaviWordmark } from "@/components/brand/HaviWordmark";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ActivatePage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="havi-card-shell w-full max-w-md">
        <CardHeader className="space-y-3 text-center">
          <div className="flex justify-center text-muted-foreground">
            <HaviWordmark />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-xl">Activate your invite</CardTitle>
            <CardDescription>Enter the code shared by your family or caregiver team.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="invite-code">
                Invite code
              </label>
              <input
                id="invite-code"
                name="invite-code"
                type="text"
                placeholder="HAVI-2024"
                className="havi-input"
                autoComplete="one-time-code"
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Button className="w-full sm:w-auto" type="submit">
                Activate
              </Button>
              <Button asChild variant="outline" className="w-full sm:w-auto">
                <Link href="/signup">Need an account</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
