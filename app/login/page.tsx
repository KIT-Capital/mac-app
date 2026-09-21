"use client";

import type { DeskRole } from "@/lib/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowLeft, Eye, EyeOff, Lock, Mail, Phone } from "lucide-react";
import { MacLockup } from "@/components/mac-logo";
import { LOGIN_EMAIL_NOTICE, LOGIN_SMS_NOTICE } from "@/lib/login-copy.mjs";
import { useStore } from "@/lib/store";

export default function LoginPage() {
  const router = useRouter();
  const { signIn, settings, user } = useStore();
  const [channel, setChannel] = useState<"email" | "phone">("email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const light = (user?.preferences.appearance ?? settings.appearance) === "light";

  async function completeDesk(session: Response) {
    const authenticated = await session.json() as {
      role: DeskRole;
      mustRotate?: boolean;
      needsCode?: boolean;
    };
    if (authenticated.needsCode) {
      setAwaitingCode(true);
      setNotice("Check your email to continue. It lasts 15 minutes and works once.");
      setBusy(false);
      return;
    }
    if (authenticated.mustRotate) {
      router.replace("/admin/password");
      return;
    }
    signIn({ email: email.trim(), role: authenticated.role });
    router.replace("/admin");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);

    if (password.trim()) {
      const session = await fetch("/api/desk-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, code: code.trim() || undefined }),
        cache: "no-store",
        credentials: "include",
      }).catch(() => null);
      if (session?.status === 202) {
        await completeDesk(session);
        return;
      }
      if (!session?.ok) {
        setError("Desk session could not start.");
        setBusy(false);
        return;
      }
      await completeDesk(session);
      return;
    }

    if (awaitingCode || code.trim()) {
      const verified = await fetch("/api/collector-session/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          channel === "phone"
            ? { phone, code }
            : { email, code },
        ),
        cache: "no-store",
        credentials: "include",
      }).catch(() => null);
      if (!verified?.ok) {
        setError("That code could not be used.");
        setBusy(false);
        return;
      }
      const result = await verified.json().catch(() => null) as {
        redirect?: string;
        email?: string;
      } | null;
      signIn({
        email: (result?.email || email).trim(),
        role: "collector",
      });
      router.replace(result?.redirect || "/collection");
      return;
    }

    if (channel === "phone") {
      if (!phone.trim()) {
        setError("Enter a phone number.");
        setBusy(false);
        return;
      }
      const access = await fetch("/api/collector-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", phone }),
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
        setAwaitingCode(true);
        setNotice(LOGIN_SMS_NOTICE);
        setBusy(false);
        return;
      }
      setError("Use your email to sign in.");
      setBusy(false);
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
      setAwaitingCode(true);
      setNotice(LOGIN_EMAIL_NOTICE);
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

      <form onSubmit={onSubmit} className="space-y-4">
        {channel === "email" ? (
          <div className="rounded-xl border border-mac-line bg-mac-card p-3 transition focus-within:border-mac-gold focus-within:ring-1 focus-within:ring-mac-gold/50">
            <div className="flex items-center justify-between">
              <label htmlFor="login-email" className="text-[10px] font-semibold tracking-[0.14em] text-mac-champagne uppercase">
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
        ) : (
          <div className="rounded-xl border border-mac-line bg-mac-card p-3 transition focus-within:border-mac-gold focus-within:ring-1 focus-within:ring-mac-gold/50">
            <div className="flex items-center justify-between">
              <label htmlFor="login-phone" className="text-[10px] font-semibold tracking-[0.14em] text-mac-champagne uppercase">
                Phone Number
              </label>
              <Phone className="h-3.5 w-3.5 text-mac-faint" />
            </div>
            <input
              id="login-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 w-full bg-transparent text-[15px] text-mac-fg outline-none placeholder:text-mac-faint"
              placeholder="+1 212 555 0100"
              autoComplete="tel"
              required
            />
          </div>
        )}

        {channel === "email" ? (
          <div className="rounded-xl border border-mac-line bg-mac-card p-3 transition focus-within:border-mac-gold focus-within:ring-1 focus-within:ring-mac-gold/50">
            <div className="flex items-center justify-between">
              <label htmlFor="login-password" className="text-[10px] font-semibold tracking-[0.14em] text-mac-champagne uppercase">
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
                placeholder="Desk only"
                autoComplete="current-password"
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

        {awaitingCode ? (
          <div className="rounded-xl border border-mac-line bg-mac-card p-3 transition focus-within:border-mac-gold focus-within:ring-1 focus-within:ring-mac-gold/50">
            <label htmlFor="login-code" className="text-[10px] font-semibold tracking-[0.14em] text-mac-champagne uppercase">
              Sign-in code
            </label>
            <input
              id="login-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="mt-1 w-full bg-transparent text-[15px] tracking-[0.3em] text-mac-fg outline-none placeholder:text-mac-faint"
              placeholder="000000"
              required
            />
          </div>
        ) : null}

        <p className="text-center text-[12px] text-mac-muted">
          <button
            type="button"
            className="font-semibold text-mac-gold underline underline-offset-4"
            onClick={() => {
              setChannel((current) => (current === "email" ? "phone" : "email"));
              setAwaitingCode(false);
              setCode("");
              setNotice("");
              setError("");
            }}
          >
            {channel === "email" ? "Use phone" : "Use email"}
          </button>
        </p>

        {notice ? <p className="text-center text-sm leading-relaxed text-mac-fg">{notice}</p> : null}
        {error ? <p className="text-center text-xs text-red-400">{error}</p> : null}

        <button
          type="submit"
          disabled={busy}
          className="mac-tap mt-2 flex h-12 w-full items-center justify-center rounded-none bg-mac-navy text-[13px] font-bold tracking-[0.18em] text-white uppercase shadow-md transition hover:bg-[#133758] active:scale-[0.99]"
        >
          {busy ? "Please wait…" : password.trim() || awaitingCode ? "Sign in" : "Send code"}
        </button>
      </form>

      <div className="pt-6 pb-2 text-center">
        <p className="text-[12px] text-mac-muted">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-semibold text-mac-gold underline underline-offset-4">
            Sign up
          </Link>
        </p>
      </div>
    </main>
  );
}
