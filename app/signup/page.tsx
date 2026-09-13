"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ScreenHeader } from "@/components/screen-header";
import { Field, PillButton } from "@/components/field";
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

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name || !email.includes("@")) {
      setError("Name and a valid email are required.");
      return;
    }
    if (!adult || !privacy) {
      setError("Confirm you are 18 or older and accept the privacy policy.");
      return;
    }
    signUp({
      name,
      email,
      phone: phone || "+1 (212) 555-0100",
      member: false,
    });
    router.push("/collection/setup");
  }

  return (
    <main className="flex flex-1 flex-col bg-black">
      <ScreenHeader title="Create account" backHref="/" />
      <form onSubmit={onSubmit} className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 py-8">
        <p className="text-sm leading-6 text-white/65">
          Register your collection, receive confidential appraisals, and request overnight
          sale-and-repurchase financing against selected models.
        </p>
        <Field label="Full name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-transparent py-1 text-[16px] outline-none"
          />
        </Field>
        <Field label="Email address">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-transparent py-1 text-[16px] outline-none"
          />
        </Field>
        <Field label="Phone">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full bg-transparent py-1 text-[16px] outline-none"
            placeholder="+1"
          />
        </Field>
        <label className="flex items-start gap-3 text-sm text-white/70">
          <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} className="mt-1" />
          I confirm that I am at least 18 years old
        </label>
        <label className="flex items-start gap-3 text-sm text-white/70">
          <input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} className="mt-1" />
          <span>
            I agree to the{" "}
            <Link href="/privacy" className="text-[#FCB040] underline underline-offset-2">
              MAC privacy policy
            </Link>
          </span>
        </label>
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
        <div className="mt-auto space-y-4">
          <PillButton type="submit">Create account</PillButton>
          <p className="text-center text-[13px] text-white/50">
            Already registered?{" "}
            <Link href="/login" className="text-[#FCB040] underline underline-offset-4">
              Sign in
            </Link>
          </p>
        </div>
      </form>
    </main>
  );
}
