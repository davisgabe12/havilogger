import Link from "next/link";

import { HaviWordmark } from "@/components/brand/HaviWordmark";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SignupPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="havi-card-shell w-full max-w-md">
        <CardHeader className="space-y-3 text-center">
          <div className="flex justify-center text-muted-foreground">
            <HaviWordmark />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-xl">Create your HAVI account</CardTitle>
            <CardDescription>Start a shared baby log for your family.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="signup-name">
                Full name
              </label>
              <input
                id="signup-name"
                name="name"
                type="text"
                placeholder="Alex Johnson"
                className="havi-input"
                autoComplete="name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="signup-email">
                Email
              </label>
              <input
                id="signup-email"
                name="email"
                type="email"
                placeholder="you@example.com"
                className="havi-input"
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="signup-password">
                Password
              </label>
              <input
                id="signup-password"
                name="password"
                type="password"
                placeholder="Create a password"
                className="havi-input"
                autoComplete="new-password"
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Button className="w-full sm:w-auto" type="submit">
                Create account
              </Button>
              <Button asChild variant="outline" className="w-full sm:w-auto">
                <Link href="/login">Already have an account</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
