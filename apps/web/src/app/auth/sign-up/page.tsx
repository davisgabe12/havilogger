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
  const shouldAutoContinueInvite = nextPath.startsWith("/app/invite");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const searchParams = new URLSearchParams(window.location.search);
    const nextRaw = searchParams.get("next");
    if (nextRaw && nextRaw.startsWith("/")) {
      setNextPath(nextRaw);
      setSignInHref(`/auth/sign-in?next=${encodeURIComponent(nextRaw)}`);
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
      router.replace(resolveNextPathFromLocation() ?? nextPath);
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session) {
      router.replace(resolveNextPathFromLocation() ?? nextPath);
      return;
    }

    setNotice("Check your email to confirm your account.");
    setIsSubmitting(false);
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
              <Link href={signInHref} className="hover:text-foreground">
                Sign in
              </Link>
            </div>
            <CardTitle className="havi-type-page-title">Create your account</CardTitle>
            <CardDescription className="havi-type-body">
              {shouldAutoContinueInvite
                ? "You were invited to join a family. Continue to invited account setup."
                : "Step 1: Enter your email and password to get started."}
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
              shouldAutoContinueInvite ? (
                <div className="space-y-4">
                  <NoticeBanner tone="info">
                    Use the invite setup form to set your password plus required caregiver details.
                  </NoticeBanner>
                  <Button
                    className="w-full"
                    type="button"
                    onClick={() => router.replace(resolveNextPathFromLocation() ?? nextPath)}
                  >
                    Continue
                  </Button>
                  <p className="havi-type-meta text-center">
                    Already have an account?{" "}
                    <Link href={signInHref} className="text-foreground hover:underline">
                      Sign in
                    </Link>
                  </p>
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
                  {error ? <NoticeBanner tone="danger">{error}</NoticeBanner> : null}
                  {notice ? <NoticeBanner tone="info">{notice}</NoticeBanner> : null}
                  <Button className="w-full" type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Creating account..." : "Continue"}
                  </Button>

                  <p className="havi-type-meta text-center">
                    Already have an account?{" "}
                    <Link href={signInHref} className="text-foreground hover:underline">
                      Sign in
                    </Link>
                  </p>
                </form>
              )
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
};

export default SignupPage;
