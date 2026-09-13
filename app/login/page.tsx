"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { MacWordmark } from "@/components/mac-logo";
import { PillButton } from "@/components/field";
import { roleFromEmail } from "@/lib/catalog";
import { useStore } from "@/lib/store";

export default function LoginPage() {
  const router = useRouter();
  const { signIn } = useStore();
  const [email, setEmail] = useState("jonathan.hale@mechartcap.com");
  const [password, setPassword] = useState("••••••••");
  const [error, setError] = useState("");

  function go(nextEmail: string) {
    signIn({ email: nextEmail });
    router.push(roleFromEmail(nextEmail) === "collector" ? "/collection" : "/admin");
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) {
      setError("Enter a valid email or phone number.");
      return;
    }
    go(email);
  }

  return (
    <main className="flex flex-1 flex-col bg-black">
      <div className="relative h-40 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/watches/richard-mille-side.jpg"
          alt=""
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0E2A44]/30 to-black" />
        <div className="absolute bottom-5 left-6">
          <MacWordmark className="w-[200px]" />
        </div>
      </div>

      <form onSubmit={onSubmit} className="flex flex-1 flex-col px-6 pb-8 pt-6">
        <label className="space-y-1 border-b border-white/15 pb-3">
          <span className="text-[11px] text-white/45">Email address or phone number</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-transparent py-1 text-[16px] outline-none"
            autoComplete="email"
          />
        </label>
        <label className="mt-6 space-y-1 border-b border-white/15 pb-3">
          <span className="text-[11px] text-white/45">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-transparent py-1 text-[16px] outline-none"
          />
        </label>
        <button type="button" className="mac-tap mt-2 self-end text-[12px] text-white/45">
          Forgot password
        </button>

        {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}

        <p className="mt-8 text-[12px] text-white/40">Or log in with</p>
        <div className="mt-3 grid grid-cols-3 gap-3">
          {["G", "f", "a"].map((mark) => (
            <button
              key={mark}
              type="button"
              onClick={() => go(email)}
              className="mac-tap flex h-12 items-center justify-center rounded-full bg-[#1c1c1c] text-lg"
            >
              {mark}
            </button>
          ))}
        </div>

        <div className="mt-auto space-y-4 pt-10">
          <PillButton type="submit">Log in</PillButton>
          <p className="text-center text-[13px] text-white/50">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="text-[#FCB040] underline underline-offset-4">
              Sign up
            </Link>
          </p>
          <p className="text-center text-[11px] leading-4 text-white/35">
            Collector: jonathan.hale@mechartcap.com
            <br />
            Desk: admin@mechartcap.com
          </p>
        </div>
      </form>
    </main>
  );
}
