"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";

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

const ForgotPasswordPage = () => {
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      setHasSession(Boolean(data.session));
    };
    void checkSession();
  }, []);

  const handleSignOut = async () => {
    setError(null);
    setIsSigningOut(true);
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setError(signOutError.message);
      setIsSigningOut(false);
      return;
    }
    setHasSession(false);
    setIsSigningOut(false);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setIsSubmitting(true);

    const redirectTo = `${window.location.origin}/auth/reset-password`;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email,
      { redirectTo },
    );

    if (resetError) {
      setError(resetError.message);
      setIsSubmitting(false);
      return;
    }

    setNotice(
      "Check your email for the reset link. If it doesn’t arrive, verify your Supabase email settings.",
    );
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
              {hasSession ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto px-0 py-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground"
                  onClick={handleSignOut}
                  disabled={isSigningOut}
                >
                  {isSigningOut ? "Signing out..." : "Sign out"}
                </Button>
              ) : (
                <Link href="/auth/sign-in" className="hover:text-foreground">
                  Sign in
                </Link>
              )}
            </div>
            <CardTitle className="havi-type-page-title">Reset your password</CardTitle>
            <CardDescription className="havi-type-body">
              Enter the email you used to sign up. We’ll send a reset link.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <Field>
                <FieldLabel htmlFor="forgot-password-email" required>
                  Email
                </FieldLabel>
                <Input
                  id="forgot-password-email"
                  className="mt-2"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </Field>
              {error ? (
                <NoticeBanner tone="danger">
                  {error}
                </NoticeBanner>
              ) : null}
              {notice ? (
                <NoticeBanner tone="info">
                  {notice}
                </NoticeBanner>
              ) : null}
              <Button className="w-full" type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Sending..." : "Send reset link"}
              </Button>
              <p className="havi-type-meta text-center">
                Remembered your password?{" "}
                <Link href="/auth/sign-in" className="text-foreground hover:underline">
                  Sign in
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
};

export default ForgotPasswordPage;
