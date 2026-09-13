"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowLeft, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { MacLockup } from "@/components/mac-logo";
import { SocialLogin } from "@/components/social-login";
import { roleFromEmail } from "@/lib/catalog";
import { useStore } from "@/lib/store";

export default function LoginPage() {
  const router = useRouter();
  const { signIn, settings } = useStore();
  const [email, setEmail] = useState("jonathan.hale@mechartcap.com");
  const [password, setPassword] = useState("••••••••");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  function go(nextEmail: string) {
    signIn({ email: nextEmail });
    router.push(roleFromEmail(nextEmail) === "collector" ? "/collection" : "/admin");
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    go(email);
  }

  return (
    <main className="flex flex-1 flex-col justify-between px-6 py-4">
      {/* Top Navigation */}
      <div className="flex items-center justify-between pb-3">
        <Link
          href="/"
          className="mac-tap -ml-2 flex items-center gap-1.5 px-2 text-mac-muted transition hover:text-mac-fg"
          aria-label="Back to welcome"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2} />
          <span className="text-[11px] font-medium tracking-[0.16em] uppercase">Back</span>
        </Link>
        <span className="text-[10px] font-semibold tracking-[0.2em] text-[#FCB040] uppercase">
          Client Vault
        </span>
      </div>

      {/* Brand Hero */}
      <div className="my-auto pt-2 pb-6 text-center">
        <div className="mx-auto w-[205px]">
          <MacWordmark onDark={settings.appearance !== "light"} />
        </div>
        <h1 className="mt-4 text-[20px] font-medium tracking-tight text-mac-fg">
          Sign In to Your Collection
        </h1>
        <p className="mt-1 text-[12px] text-mac-muted">
          Confidential appraisals & sale-and-repurchase desk
        </p>
      </div>

      {/* Form */}
      <form onSubmit={onSubmit} className="space-y-4">
        {/* Email Field */}
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

        {/* Password Field */}
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

        {/* Forgot password */}
        <div className="flex justify-end pt-0.5">
          <button
            type="button"
            className="text-[11px] font-medium text-[#FCB040] hover:underline"
          >
            Forgot password?
          </button>
        </div>

        {error ? <p className="text-center text-xs text-red-400">{error}</p> : null}

        {/* Submit */}
        <button
          type="submit"
          className="mac-tap mt-2 flex h-12 w-full items-center justify-center rounded-none bg-[#0E2A44] text-[13px] font-bold tracking-[0.18em] text-white uppercase shadow-md transition hover:bg-[#133758] active:scale-[0.99]"
        >
          Sign In
        </button>
      </form>

      {/* Social login alternatives */}
      <div className="pt-5">
        <SocialLogin onContinue={() => go(email)} />
      </div>

      {/* Footer & Demo shortcuts */}
      <div className="pt-6 pb-2 text-center space-y-3">
        <p className="text-[12px] text-mac-muted">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-semibold text-[#FCB040] underline underline-offset-4">
            Sign up
          </Link>
        </p>

        {/* 1-tap evaluator shortcuts */}
        <div className="flex items-center justify-center gap-2 pt-1 text-[11px] text-mac-faint">
          <span>Demo:</span>
          <button
            type="button"
            onClick={() => go("jonathan.hale@mechartcap.com")}
            className="rounded-full border border-mac-line bg-mac-card px-2.5 py-1 text-mac-fg transition hover:border-[#FCB040] hover:text-[#FCB040]"
          >
            Collector
          </button>
          <button
            type="button"
            onClick={() => go("admin@mechartcap.com")}
            className="rounded-full border border-mac-line bg-mac-card px-2.5 py-1 text-mac-fg transition hover:border-[#FCB040] hover:text-[#FCB040]"
          >
            Admin Desk
          </button>
        </div>
      </div>
    </main>
  );
}
