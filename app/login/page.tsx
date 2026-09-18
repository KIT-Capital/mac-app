"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowLeft, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { MacLockup } from "@/components/mac-logo";
import { authenticate } from "@/lib/auth";
import { useStore } from "@/lib/store";

export default function LoginPage() {
  const router = useRouter();
  const { signIn, settings, user } = useStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [deskMode, setDeskMode] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const light = (user?.preferences.appearance ?? settings.appearance) === "light";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    if (deskMode) {
      const result = authenticate(email, password);
      if (!result.ok || result.role === "collector") {
        setError(result.ok ? "That address is not a desk account." : result.error);
        setBusy(false);
        return;
      }
      const session = await fetch("/api/desk-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        cache: "no-store",
        credentials: "include",
      }).catch(() => null);
      if (!session?.ok) {
        setError("Desk session could not start.");
        setBusy(false);
        return;
      }
      signIn({ email: email.trim(), role: result.role });
      router.replace("/admin");
      return;
    }

    if (!email.trim().includes("@")) {
      setError("Enter a valid email address.");
      setBusy(false);
      return;
    }
    const access = await fetch("/api/collector-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", email }),
      cache: "no-store",
      credentials: "include",
    }).catch(() => null);
    const accessResult = (await access?.json().catch(() => null)) as
      | { mode?: "browser" | "live"; accepted?: boolean }
      | null;
    if (!access?.ok) {
      setError("Collector access could not start.");
      setBusy(false);
      return;
    }
    if (accessResult?.mode === "live" && accessResult.accepted) {
      setNotice("Check your email for a secure sign-in link. It lasts 15 minutes and works once.");
      setBusy(false);
      return;
    }
    if (accessResult?.mode !== "browser") {
      setError("Collector access could not start.");
      setBusy(false);
      return;
    }
    signIn({ email: email.trim(), role: "collector" });
    router.replace("/collection");
  }

  function showDeskSignIn() {
    setDeskMode(true);
    setNotice("");
    setError("");
  }

  return (
    <main className="flex flex-1 flex-col justify-between px-6 py-4">
      <div className="flex items-center justify-between pb-3">
        <Link
          href="/"
          className="mac-tap -ml-2 flex items-center gap-1.5 px-2 text-mac-muted transition hover:text-mac-fg"
          aria-label="Back to welcome"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2} />
          <span className="text-[11px] font-medium tracking-[0.16em] uppercase">Back</span>
        </Link>
      </div>

      <div className="my-auto pt-2 pb-6 text-center">
        <div className="mx-auto">
          <MacLockup onDark={!light} size="hero" />
        </div>
        <h1 className="mt-4 text-[20px] font-medium tracking-tight text-mac-fg">
          Sign In to Your Collection
        </h1>
        <p className="mt-1 text-[12px] text-mac-muted">
          Confidential appraisals & sale-and-repurchase desk
        </p>
      </div>

      {notice ? (
        <div className="rounded-xl border border-[#FCB040]/40 bg-mac-card px-5 py-6 text-center">
          <Mail className="mx-auto h-6 w-6 text-[#FCB040]" />
          <p className="mt-3 text-sm leading-relaxed text-mac-fg">{notice}</p>
        </div>
      ) : (
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="rounded-xl border border-mac-line bg-mac-card p-3 transition focus-within:border-[#FCB040] focus-within:ring-1 focus-within:ring-[#FCB040]/50">
          <div className="flex items-center justify-between">
            <label htmlFor="login-email" className="text-[10px] font-semibold tracking-[0.14em] text-[#E8D5C0] uppercase">
              Email Address
            </label>
            <Mail className="h-3.5 w-3.5 text-mac-faint" />
          </div>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full bg-transparent text-[15px] text-mac-fg outline-none placeholder:text-mac-faint"
            placeholder="collector@example.com"
            autoComplete="email"
            required
          />
        </div>

        {deskMode ? (
        <div className="rounded-xl border border-mac-line bg-mac-card p-3 transition focus-within:border-[#FCB040] focus-within:ring-1 focus-within:ring-[#FCB040]/50">
          <div className="flex items-center justify-between">
            <label htmlFor="login-password" className="text-[10px] font-semibold tracking-[0.14em] text-[#E8D5C0] uppercase">
              Password
            </label>
            <Lock className="h-3.5 w-3.5 text-mac-faint" />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="login-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full bg-transparent text-[15px] text-mac-fg outline-none placeholder:text-mac-faint"
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="text-mac-faint hover:text-mac-fg"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        ) : null}

        {error ? <p className="text-center text-xs text-red-400">{error}</p> : null}

        <button
          type="submit"
          disabled={busy}
          className="mac-tap mt-2 flex h-12 w-full items-center justify-center rounded-none bg-[#0E2A44] text-[13px] font-bold tracking-[0.18em] text-white uppercase shadow-md transition hover:bg-[#133758] active:scale-[0.99]"
        >
          {busy ? "Please wait…" : deskMode ? "Sign in" : "Send sign-in link"}
        </button>
      </form>
      )}

      {!deskMode && !notice ? (
        <button
          type="button"
          onClick={showDeskSignIn}
          className="mac-tap pt-5 text-center text-[12px] font-medium text-mac-muted underline underline-offset-4"
        >
          MAC desk staff
        </button>
      ) : null}

      <div className="pt-6 pb-2 text-center">
        <p className="text-[12px] text-mac-muted">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-semibold text-[#FCB040] underline underline-offset-4">
            Sign up
          </Link>
        </p>
      </div>
    </main>
  );
}
