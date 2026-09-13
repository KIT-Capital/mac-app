"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ScreenHeader } from "@/components/screen-header";
import { isReservedDeskEmail } from "@/lib/auth";
import { sendAppEmail } from "@/lib/send-mail";
import { useStore } from "@/lib/store";

export default function SignupPage() {
  const router = useRouter();
  const { signUp } = useStore();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [adult, setAdult] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
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
    signUp({
      name,
      email,
      phone: phone || "+1 (212) 555-0100",
      member: false,
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
          <span className="text-[10px] font-semibold tracking-[0.2em] text-[#FCB040] uppercase">
            New Client Registration
          </span>
          <h2 className="text-[20px] font-medium text-mac-fg">Open Your Collection</h2>
          <p className="text-[13px] leading-relaxed text-mac-muted">
            Register timepieces for unbiased valuations. After you apply, MAC may purchase
            qualifying pieces and you may buy them back on a preset scale. This is not a loan.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="rounded-xl border border-mac-line bg-mac-card p-3 transition focus-within:border-[#FCB040] focus-within:ring-1 focus-within:ring-[#FCB040]/50">
            <label htmlFor="reg-name" className="text-[10px] font-semibold tracking-[0.14em] text-[#E8D5C0] uppercase block">
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

          <div className="rounded-xl border border-mac-line bg-mac-card p-3 transition focus-within:border-[#FCB040] focus-within:ring-1 focus-within:ring-[#FCB040]/50">
            <label htmlFor="reg-email" className="text-[10px] font-semibold tracking-[0.14em] text-[#E8D5C0] uppercase block">
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

          <div className="rounded-xl border border-mac-line bg-mac-card p-3 transition focus-within:border-[#FCB040] focus-within:ring-1 focus-within:ring-[#FCB040]/50">
            <label htmlFor="reg-phone" className="text-[10px] font-semibold tracking-[0.14em] text-[#E8D5C0] uppercase block">
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

          <div className="space-y-3 pt-2 text-[13px] text-mac-muted">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={adult}
                onChange={(e) => setAdult(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-white/30 bg-mac-card accent-[#FCB040]"
              />
              <span>I confirm that I am at least 18 years old.</span>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={privacy}
                onChange={(e) => setPrivacy(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-white/30 bg-mac-card accent-[#FCB040]"
              />
              <span>
                I agree to the{" "}
                <Link href="/privacy" className="text-[#FCB040] underline underline-offset-2">
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
              className="mac-tap flex h-12 w-full items-center justify-center rounded-xl bg-[#FCB040] text-[13px] font-bold tracking-[0.18em] text-[#0A0D14] uppercase shadow-md transition hover:bg-[#ffbe59] active:scale-[0.99] disabled:opacity-40"
            >
              {busy ? "Creating account…" : "Create Account"}
            </button>
            <p className="text-center text-[12px] text-mac-faint">
              Already registered?{" "}
              <Link href="/login" className="font-medium text-[#FCB040] underline underline-offset-4">
                Sign in
              </Link>
            </p>
          </div>
        </form>
      </div>
    </main>
  );
}
