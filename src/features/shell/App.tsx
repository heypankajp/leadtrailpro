"use client";

import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "@/lib/api";
import { getSession, logout } from "@/features/auth/client";
import AuthScreen from "@/features/auth/AuthScreen";
import type { UserAccount } from "@/features/users/model";
import AppShell from "./AppShell";

type SessionState = { status: "checking" | "signed-out" | "signed-in"; user: UserAccount | null; needsSetup: boolean; error: string };

export default function App() {
  const [session, setSession] = useState<SessionState>({ status: "checking", user: null, needsSetup: false, error: "" });

  useEffect(() => {
    let cancelled = false;
    getSession()
      .then((result) => { if (!cancelled) setSession({ status: result.user ? "signed-in" : "signed-out", user: result.user, needsSetup: result.needsSetup, error: "" }); })
      .catch((error: unknown) => { if (!cancelled) setSession({ status: "signed-out", user: null, needsSetup: false, error: errorMessage(error, "Could not verify your session.") }); });
    return () => { cancelled = true; };
  }, []);

  const signOut = useCallback(async () => {
    try { await logout(); } finally { setSession({ status: "signed-out", user: null, needsSetup: false, error: "" }); }
  }, []);

  if (session.status !== "signed-in" || !session.user) {
    return (
      <AuthScreen
        key={session.status}
        checking={session.status === "checking"}
        needsSetup={session.needsSetup}
        initialError={session.error}
        onSignedIn={(user) => setSession({ status: "signed-in", user, needsSetup: false, error: "" })}
      />
    );
  }
  return <AppShell user={session.user} setUser={(user) => setSession((current) => ({ ...current, user }))} signOut={signOut} />;
}
