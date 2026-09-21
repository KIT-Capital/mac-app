"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ScreenHeader } from "@/components/screen-header";
import { isReservedDeskEmail } from "@/lib/auth";
import type { RetailRole } from "@/lib/types";
import { sendAppEmail } from "@/lib/send-mail";
import { useStore } from "@/lib/store";

export default function SignupPage() {
  const router = useRouter();
  const { signUp, signIn } = useStore();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [partyKind, setPartyKind] = useState<RetailRole>("collector");
  const [code, setCode] = useState("");
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [adult, setAdult] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (awaitingCode) {
      setBusy(true);
      const verified = await fetch("/api/collector-session/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
        cache: "no-store",
        credentials: "include",
      }).catch(() => null);
      if (!verified?.ok) {
        setError("That code could not be used.");
        setBusy(false);
        return;
      }
      const result = await verified.json().catch(() => null) as { redirect?: string } | null;
      const redirect = result?.redirect || "/collection/setup";
      if (redirect === "/collection") {
        signIn({ email: email.trim(), role: "collector" });
      } else {
        signUp({
          name,
          email,
          phone: phone || "+1 (212) 555-0100",
          member: false,
          role: partyKind,
        });
      }
      setBusy(false);
      router.push(redirect);
      return;
    }
    if (!name || !email.includes("@")) {
      setError("Please enter your name and a valid email address.");
      return;
    }
    if (isReservedDeskEmail(email)) {
      setError("That address is reserved.");
      return;
    }
    if (!adult) {
      setError("You must confirm you are at least 18 years old.");
      return;
    }
    if (!privacy) {
      setError("Please accept the privacy policy to continue.");
      return;
    }
    setBusy(true);
    setNotice("");
    const registration = await fetch("/api/collector-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "register", name, email, phone, role: partyKind }),
      cache: "no-store",
      credentials: "include",
    }).catch(() => null);
    if (!registration?.ok) {
      setError("Your account could not be created. Please try again.");
      setBusy(false);
      return;
    }
    const access = (await registration.json().catch(() => null)) as
      | { mode?: "browser" | "live"; accepted?: boolean }
      | null;
    if (access?.mode === "live" && access.accepted) {
      setAwaitingCode(true);
      setNotice("Check your email for a sign-in code. It lasts 15 minutes and works once.");
      setBusy(false);
      return;
    }
    if (access?.mode !== "browser") {
      setError("Your account could not be created. Please try again.");
      setBusy(false);
      return;
    }
    signUp({
      name,
      email,
      phone: phone || "+1 (212) 555-0100",
      member: false,
      role: partyKind,
    });
    await sendAppEmail({ kind: "welcome", name, email, phone });
    setBusy(false);
    router.push("/collection/setup");
  }

  return (
    <main className="flex flex-1 flex-col bg-mac-bg text-mac-fg">
      <ScreenHeader title="Create Account" backHref="/" menu={false} />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mb-6 space-y-1">
          <span className="text-[10px] font-semibold tracking-[0.2em] text-mac-gold uppercase">
            New Client Registration
          </span>
          <h2 className="text-[20px] font-medium text-mac-fg">Open Your Collection</h2>
          <p className="text-[13px] leading-relaxed text-mac-muted">
            Register timepieces for unbiased valuations. After you apply, MAC may purchase
            qualifying pieces and you may buy them back on a preset scale. This is not a loan.
          </p>
        </div>

        {notice ? (
          <div className="rounded-xl border border-mac-gold/40 bg-mac-card px-5 py-6 text-center">
            <p className="text-sm leading-relaxed text-mac-fg">{notice}</p>
            {awaitingCode ? (
              <form onSubmit={onSubmit} className="mt-6 space-y-4 text-left">
                <label htmlFor="reg-code" className="block text-[10px] font-semibold tracking-[0.14em] text-mac-champagne uppercase">
                  Sign-in code
                  <input
                    id="reg-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-mac-line bg-mac-bg px-3 py-3 text-[15px] tracking-[0.3em] text-mac-fg"
                    placeholder="000000"
                    required
                  />
                </label>
                {error ? <p className="text-center text-xs text-red-400">{error}</p> : null}
                <button
                  type="submit"
                  disabled={busy}
                  className="mac-tap flex h-12 w-full items-center justify-center rounded-xl bg-mac-gold text-[13px] font-bold tracking-[0.18em] text-[#0A0D14] uppercase"
                >
                  {busy ? "Please wait…" : "Confirm code"}
                </button>
              </form>
            ) : null}
            <Link
              href="/login"
              className="mt-6 inline-block text-[12px] font-medium text-mac-gold underline underline-offset-4"
            >
              Already registered? Sign in
            </Link>
          </div>
        ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="rounded-xl border border-mac-line bg-mac-card p-3 transition focus-within:border-mac-gold focus-within:ring-1 focus-within:ring-mac-gold/50">
            <label htmlFor="reg-name" className="text-[10px] font-semibold tracking-[0.14em] text-mac-champagne uppercase block">
              Full Legal Name
            </label>
            <input
              id="reg-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full bg-transparent text-[15px] text-mac-fg outline-none placeholder:text-mac-faint"
              placeholder="e.g. Jonathan Hale"
              required
            />
          </div>

          <div className="rounded-xl border border-mac-line bg-mac-card p-3 transition focus-within:border-mac-gold focus-within:ring-1 focus-within:ring-mac-gold/50">
            <label htmlFor="reg-email" className="text-[10px] font-semibold tracking-[0.14em] text-mac-champagne uppercase block">
              Email Address
            </label>
            <input
              id="reg-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full bg-transparent text-[15px] text-mac-fg outline-none placeholder:text-mac-faint"
              placeholder="jonathan.hale@example.com"
              required
            />
          </div>

          <div className="rounded-xl border border-mac-line bg-mac-card p-3 transition focus-within:border-mac-gold focus-within:ring-1 focus-within:ring-mac-gold/50">
            <label htmlFor="reg-phone" className="text-[10px] font-semibold tracking-[0.14em] text-mac-champagne uppercase block">
              Direct Phone Number
            </label>
            <input
              id="reg-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 w-full bg-transparent text-[15px] text-mac-fg outline-none placeholder:text-mac-faint"
              placeholder="+1 (212) 555-0100"
            />
          </div>

          <fieldset className="space-y-3 rounded-xl border border-mac-line bg-mac-card p-3">
            <legend className="text-[10px] font-semibold tracking-[0.14em] text-mac-champagne uppercase">
              How you use MAC
            </legend>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="party-kind"
                checked={partyKind === "collector"}
                onChange={() => setPartyKind("collector")}
                className="mt-1 accent-mac-gold"
              />
              <span className="text-[13px] text-mac-muted">
                <span className="block text-mac-fg">Collector</span>
                I own watches as a consumer and may sell a collection to MAC with the option to buy it back.
              </span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="party-kind"
                checked={partyKind === "dealer"}
                onChange={() => setPartyKind("dealer")}
                className="mt-1 accent-mac-gold"
              />
              <span className="text-[13px] text-mac-muted">
                <span className="block text-mac-fg">Watch business</span>
                I run a shop or wholesale book and raise cash against a collection. This is not a loan.
              </span>
            </label>
          </fieldset>

          <div className="space-y-3 pt-2 text-[13px] text-mac-muted">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={adult}
                onChange={(e) => setAdult(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-white/30 bg-mac-card accent-mac-gold"
              />
              <span>I confirm that I am at least 18 years old.</span>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={privacy}
                onChange={(e) => setPrivacy(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-white/30 bg-mac-card accent-mac-gold"
              />
              <span>
                I agree to the{" "}
                <Link href="/privacy" className="text-mac-gold underline underline-offset-2">
                  MAC privacy policy
                </Link>{" "}
                and terms.
              </span>
            </label>
          </div>

          {error ? <p className="text-center text-xs text-red-400">{error}</p> : null}
          <div className="pt-4 space-y-3">
            <button
              type="submit"
              disabled={busy}
              className="mac-tap flex h-12 w-full items-center justify-center rounded-xl bg-mac-gold text-[13px] font-bold tracking-[0.18em] text-[#0A0D14] uppercase shadow-md transition hover:bg-[#ffbe59] active:scale-[0.99] disabled:opacity-40"
            >
              {busy ? "Creating account…" : "Create Account"}
            </button>
            <p className="text-center text-[12px] text-mac-faint">
              Already registered?{" "}
              <Link href="/login" className="font-medium text-mac-gold underline underline-offset-4">
                Sign in
              </Link>
            </p>
          </div>
        </form>
        )}
      </div>
    </main>
  );
}
