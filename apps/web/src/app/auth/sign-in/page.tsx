"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase/client";
import { NoticeBanner } from "@/components/ui/app-shell";
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

const resolveNextPathFromLocation = (): string | null => {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const nextRaw = params.get("next");
  if (!nextRaw || !nextRaw.startsWith("/")) return null;
  return nextRaw;
};

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
  const shouldAutoContinueInvite = nextPath.startsWith("/app/invite");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const searchParams = new URLSearchParams(window.location.search);
    const nextRaw = searchParams.get("next");
    if (nextRaw && nextRaw.startsWith("/")) {
      setNextPath(nextRaw);
      setSignUpHref(`/auth/sign-up?next=${encodeURIComponent(nextRaw)}`);
      try {
        const nextUrl = new URL(nextRaw, window.location.origin);
        const inviteEmail = nextUrl.searchParams.get("email");
        if (inviteEmail) {
          setEmail(inviteEmail);
        }
      } catch {
        // ignore malformed next path
      }
    }
    const directEmail = searchParams.get("email");
    if (directEmail) {
      setEmail(directEmail);
    }
  }, []);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        setSessionEmail(data.session?.user?.email ?? null);
      } catch {
        setSessionEmail(null);
      } finally {
        setSessionChecked(true);
      }
    };

    void checkSession();
  }, []);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionEmail(session?.user?.email ?? null);
      setSessionChecked(true);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!sessionChecked || !sessionEmail || !shouldAutoContinueInvite) return;
    router.replace(resolveNextPathFromLocation() ?? nextPath);
  }, [nextPath, router, sessionChecked, sessionEmail, shouldAutoContinueInvite]);

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

    router.replace(resolveNextPathFromLocation() ?? nextPath);
  };

  return (
    <main className="havi-app-main min-h-screen">
      <div className="havi-app-shell max-w-md py-10">
        <Card className="havi-card-shell w-full">
          <CardHeader>
            <div className="havi-type-meta flex items-center justify-between">
              <Link href="/" className="havi-brand-wordmark-text">
                HAVI
              </Link>
              <Link href={signUpHref} className="hover:text-foreground">
                Create account
              </Link>
            </div>
            <CardTitle className="havi-type-page-title">Welcome back</CardTitle>
            <CardDescription className="havi-type-body">
              Sign in to continue to your Havi dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!sessionChecked ? (
              <p className="havi-type-body">Checking session…</p>
            ) : sessionEmail ? (
              <div className="space-y-4">
                <p className="havi-type-body">
                  You are already signed in as <span className="text-foreground">{sessionEmail}</span>.
                </p>
                {error ? <NoticeBanner tone="danger">{error}</NoticeBanner> : null}
                <div className="grid gap-2">
                  <Button
                    className="w-full"
                    type="button"
                    onClick={() => router.replace(resolveNextPathFromLocation() ?? nextPath)}
                  >
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
                    className="havi-type-meta hover:text-foreground"
                  >
                    Forgot password?
                  </Link>
                </div>
                {error ? <NoticeBanner tone="danger">{error}</NoticeBanner> : null}
                <Button className="w-full" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Signing in..." : "Sign in"}
                </Button>
                <p className="havi-type-meta text-center">
                  New here?{" "}
                  <Link href={signUpHref} className="text-foreground hover:underline">
                    Create an account
                  </Link>
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
};

export default LoginPage;
