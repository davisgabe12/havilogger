"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const LogoutPage = (): JSX.Element => {
  const router = useRouter();
  const [message, setMessage] = useState("Signing you out...");

  useEffect(() => {
    const runSignOut = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace("/login");
        return;
      }

      const { error } = await supabase.auth.signOut();
      if (error) {
        setMessage(`Unable to sign out: ${error.message}`);
        return;
      }

      router.replace("/login");
    };

    void runSignOut();
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-12 text-slate-100">
      <Card className="w-full max-w-md border-slate-800 bg-slate-900/70 text-slate-100">
        <CardHeader>
          <CardTitle>Signing out</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-300">{message}</p>
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
};

export default LogoutPage;
}
