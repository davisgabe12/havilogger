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
const SignupPage = () => {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [nextPath, setNextPath] = useState("/app");
  const [signInHref, setSignInHref] = useState("/auth/sign-in");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const nextRaw = new URLSearchParams(window.location.search).get("next");
    if (nextRaw && nextRaw.startsWith("/")) {
      setNextPath(nextRaw);
      setSignInHref(`/auth/sign-in?next=${encodeURIComponent(nextRaw)}`);
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
    setNotice(null);
    setIsSubmitting(true);

    const emailRedirectTo = `${window.location.origin}/auth/sign-in`;
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo },
    });

    if (signUpError) {
      const message = signUpError.message.toLowerCase();
      if (message.includes("already registered") || message.includes("user already")) {
        setError("That email is already registered. Sign in instead.");
      } else {
        setError(signUpError.message);
      }
      setIsSubmitting(false);
      return;
    }

    if (data.session) {
      router.replace(nextPath);
      return;
    }

    setNotice("Check your email to confirm your account.");
    setIsSubmitting(false);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12 text-foreground">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <Link href="/" className="font-semibold tracking-[0.2em] text-foreground">
              HAVI
            </Link>
            <Link href={signInHref} className="hover:text-foreground">
              Sign in
            </Link>
          </div>
          <CardTitle>Create your account</CardTitle>
          <CardDescription>
            Step 1: Enter your email and password to get started.
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
              <FieldLabel htmlFor="signup-email" required>
                Email
              </FieldLabel>
              <Input
                id="signup-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="signup-password" required>
                Password
              </FieldLabel>
              <Input
                id="signup-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </Field>
            {error ? (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
            {notice ? (
              <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                {notice}
              </p>
            ) : null}
            <Button className="w-full" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating account..." : "Continue"}
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              Already have an account?{" "}
              <Link href={signInHref} className="text-foreground hover:underline">
                Sign in
              </Link>
            </p>
          </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
};

export default SignupPage;
