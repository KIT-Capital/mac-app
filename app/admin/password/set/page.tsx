"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MacLockup } from "@/components/mac-logo";

function SetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    const response = await fetch("/api/desk-session/first-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, newPassword, confirmPassword }),
      credentials: "include",
      cache: "no-store",
    }).catch(() => null);
    const body = await response?.json().catch(() => null) as { error?: string } | null;
    if (!response?.ok) {
      setError(
        body?.error === "PASSWORD_TOO_WEAK"
          ? "Use at least 12 characters and do not include your email."
          : "That link could not be used.",
      );
      setBusy(false);
      return;
    }
    router.replace("/login/staff");
  }

  return (
    <main className="flex min-h-dvh flex-col justify-center bg-mac-bg px-6 py-10 text-mac-fg">
      <div className="mx-auto w-full max-w-sm">
        <div className="text-center">
          <MacLockup onDark size="hero" />
          <h1 className="mt-8 text-xl font-medium">Set your desk password</h1>
          <p className="mt-2 text-sm text-mac-muted">
            Choose a password of at least 12 characters, then sign in on the staff page with that password and a one-time email code.
          </p>
        </div>
        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <label className="block text-[10px] font-semibold tracking-[0.14em] text-mac-champagne uppercase">
            New password
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="mt-1 w-full rounded-xl border border-mac-line bg-mac-card px-3 py-3 text-[15px] text-mac-fg"
              autoComplete="new-password"
              required
            />
          </label>
          <label className="block text-[10px] font-semibold tracking-[0.14em] text-mac-champagne uppercase">
            Confirm new password
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="mt-1 w-full rounded-xl border border-mac-line bg-mac-card px-3 py-3 text-[15px] text-mac-fg"
              autoComplete="new-password"
              required
            />
          </label>
          {error ? <p className="text-center text-xs text-red-400">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="mac-tap flex h-12 w-full items-center justify-center bg-mac-navy text-[13px] font-bold tracking-[0.18em] text-white uppercase"
          >
            {busy ? "Please wait…" : "Save password"}
          </button>
        </form>
      </div>
    </main>
  );
}

export default function FirstDeskPasswordPage() {
  return (
    <Suspense>
      <SetPasswordForm />
    </Suspense>
  );
}
