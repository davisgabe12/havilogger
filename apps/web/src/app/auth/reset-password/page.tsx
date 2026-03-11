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

const ResetPasswordPage = () => {
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      setHasSession(Boolean(data.session));
      setReady(true);
    };
    void init();
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (!password || password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setIsSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });
    if (updateError) {
      setError(updateError.message);
      setIsSubmitting(false);
      return;
    }
    setNotice("Password updated. You can now sign in.");
    setIsSubmitting(false);
  };

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
            <CardTitle className="havi-type-page-title">Set a new password</CardTitle>
            <CardDescription className="havi-type-body">
              Use the link from your email to finish resetting your password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!ready ? (
              <p className="havi-type-body">Loading…</p>
            ) : !hasSession ? (
              <NoticeBanner tone="warning" className="space-y-2 text-sm">
                <p>We couldn’t find a recovery session.</p>
                <p>
                  Request a new reset link from{" "}
                  <Link href="/auth/forgot-password" className="text-foreground underline">
                    Forgot password
                  </Link>
                  .
                </p>
              </NoticeBanner>
            ) : (
              <form className="space-y-4" onSubmit={handleSubmit}>
                <Field>
                  <FieldLabel htmlFor="reset-password" required>
                    New password
                  </FieldLabel>
                  <Input
                    id="reset-password"
                    className="mt-2"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="reset-password-confirm" required>
                    Confirm password
                  </FieldLabel>
                  <Input
                    id="reset-password-confirm"
                    className="mt-2"
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
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
                  {isSubmitting ? "Updating..." : "Update password"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
};

export default ResetPasswordPage;
