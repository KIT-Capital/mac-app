"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { MacLockup } from "@/components/mac-logo";
import { useStore } from "@/lib/store";

export default function StaffPasswordPage() {
  const router = useRouter();
  const { signIn } = useStore();
  const [currentPassword, setCurrentPassword] = useState("");
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
    const response = await fetch("/api/desk-session", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      credentials: "include",
      cache: "no-store",
    }).catch(() => null);
    const body = await response?.json().catch(() => null) as {
      error?: string;
      role?: "admin" | "staff";
      email?: string;
    } | null;
    if (!response?.ok || !body?.role || !body.email) {
      setError(
        body?.error === "PASSWORD_TOO_WEAK"
          ? "Use at least 12 characters and choose a different password."
          : "The temporary password was not recognized.",
      );
      setBusy(false);
      return;
    }
    signIn({ email: body.email, role: body.role });
    router.replace("/admin");
  }

  return (
    <main className="flex min-h-dvh flex-col justify-center bg-mac-bg px-6 py-10 text-mac-fg">
      <div className="mx-auto w-full max-w-sm">
        <div className="text-center">
          <MacLockup onDark size="hero" />
          <h1 className="mt-8 text-xl font-medium">Choose a new desk password</h1>
          <p className="mt-2 text-sm text-mac-muted">
            Replace the temporary password before opening the MAC desk.
          </p>
        </div>
        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <PasswordField
            id="temporary-password"
            label="Temporary password"
            value={currentPassword}
            onChange={setCurrentPassword}
          />
          <PasswordField
            id="new-password"
            label="New password"
            value={newPassword}
            onChange={setNewPassword}
          />
          <PasswordField
            id="confirm-password"
            label="Confirm new password"
            value={confirmPassword}
            onChange={setConfirmPassword}
          />
          {error ? <p className="text-center text-xs text-red-400">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="mac-tap flex h-12 w-full items-center justify-center bg-[#0E2A44] text-sm font-bold tracking-[0.12em] text-white uppercase disabled:opacity-40"
          >
            {busy ? "Saving…" : "Save new password"}
          </button>
        </form>
      </div>
    </main>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label htmlFor={id} className="block rounded-xl border border-mac-line bg-mac-card p-3">
      <span className="text-[10px] font-semibold tracking-[0.14em] text-[#E8D5C0] uppercase">
        {label}
      </span>
      <input
        id={id}
        type="password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={id === "temporary-password" ? "current-password" : "new-password"}
        className="mt-1 w-full bg-transparent text-[15px] text-mac-fg outline-none"
        required
      />
    </label>
  );
}
