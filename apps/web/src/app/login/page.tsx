import Link from "next/link";

import { HaviWordmark } from "@/components/brand/HaviWordmark";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="havi-card-shell w-full max-w-md">
        <CardHeader className="space-y-3 text-center">
          <div className="flex justify-center text-muted-foreground">
            <HaviWordmark />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-xl">Welcome back</CardTitle>
            <CardDescription>Sign in to keep track of today&apos;s moments.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="login-email">
                Email
              </label>
              <input
                id="login-email"
                name="email"
                type="email"
                placeholder="you@example.com"
                className="havi-input"
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="login-password">
                Password
              </label>
              <input
                id="login-password"
                name="password"
                type="password"
                placeholder="••••••••"
                className="havi-input"
                autoComplete="current-password"
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Button className="w-full sm:w-auto" type="submit">
                Sign in
              </Button>
              <Button asChild variant="outline" className="w-full sm:w-auto">
                <Link href="/signup">Create account</Link>
              </Button>
            </div>
            <Button asChild variant="link" className="w-full text-muted-foreground">
              <Link href="/activate">Have an invite code?</Link>
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
