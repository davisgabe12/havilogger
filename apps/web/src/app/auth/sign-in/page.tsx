"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const LoginPage = () => {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [nextPath, setNextPath] = useState("/app");
  const [signUpHref, setSignUpHref] = useState("/auth/sign-up");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const nextRaw = new URLSearchParams(window.location.search).get("next");
    if (nextRaw && nextRaw.startsWith("/")) {
      setNextPath(nextRaw);
      setSignUpHref(`/auth/sign-up?next=${encodeURIComponent(nextRaw)}`);
    }
  }, []);

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      setSessionEmail(data.session?.user?.email ?? null);
      setSessionChecked(true);
    };

    void checkSession();
  }, []);

  const handleSessionSignOut = async () => {
    setError(null);
    setIsSigningOut(true);
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setError(signOutError.message);
      setIsSigningOut(false);
      return;
    }
    setSessionEmail(null);
    setIsSigningOut(false);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      const message = signInError.message.toLowerCase();
      if (message.includes("invalid login credentials")) {
        setError("Invalid email or password. If you just signed up, confirm your email first.");
      } else {
        setError(signInError.message);
      }
      setIsSubmitting(false);
      return;
    }

    router.replace(nextPath);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12 text-foreground">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <Link href="/" className="font-semibold tracking-[0.2em] text-foreground">
              HAVI
            </Link>
            <Link href={signUpHref} className="hover:text-foreground">
              Create account
            </Link>
          </div>
          <CardTitle>Welcome back</CardTitle>
          <CardDescription>
            Sign in to continue to your Havi dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!sessionChecked ? (
            <p className="text-sm text-muted-foreground">Checking session…</p>
          ) : sessionEmail ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                You are already signed in as <span className="text-foreground">{sessionEmail}</span>.
              </p>
              {error ? (
                <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              <div className="grid gap-2">
                <Button className="w-full" type="button" onClick={() => router.replace(nextPath)}>
                  Continue to app
                </Button>
                <Button
                  className="w-full"
                  variant="outline"
                  type="button"
                  onClick={handleSessionSignOut}
                  disabled={isSigningOut}
                >
                  {isSigningOut ? "Signing out..." : "Sign out to switch account"}
                </Button>
              </div>
            </div>
          ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <Field>
              <FieldLabel htmlFor="signin-email" required>
                Email
              </FieldLabel>
              <Input
                id="signin-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="signin-password" required>
                Password
              </FieldLabel>
              <Input
                id="signin-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </Field>
            <div className="flex justify-end">
              <Link
                href="/auth/forgot-password"
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Forgot password?
              </Link>
            </div>
            {error ? (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <Button className="w-full" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Signing in..." : "Sign in"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              New here?{" "}
              <Link href={signUpHref} className="text-foreground hover:underline">
                Create an account
              </Link>
            </p>
          </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
};

export default LoginPage;
