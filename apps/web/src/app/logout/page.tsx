"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const LogoutPage = () => {
  const router = useRouter();
  const [message, setMessage] = useState("Signing you out...");

  useEffect(() => {
    const runSignOut = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace("/auth/sign-in");
        return;
      }

      const { error } = await supabase.auth.signOut();
      if (error) {
        setMessage(`Unable to sign out: ${error.message}`);
        return;
      }

      router.replace("/auth/sign-in");
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
        </CardContent>
      </Card>
    </main>
  );
};

export default LogoutPage;
