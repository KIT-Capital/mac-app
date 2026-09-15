"use client";

import { useState } from "react";
import { ScreenHeader } from "@/components/screen-header";
import { PillButton } from "@/components/field";
import { hasApplication } from "@/lib/catalog";
import { sendAppEmail } from "@/lib/send-mail";
import { useStore } from "@/lib/store";

export default function MembershipPage() {
  const { user, updateProfile, settings, agreements } = useStore();
  const applied = hasApplication(user, agreements.length);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function subscribe() {
    if (!user) return;
    setBusy(true);
    updateProfile({ member: true });
    const result = await sendAppEmail({
      kind: "membership",
      name: user.name,
      email: user.email,
      deskEmail: settings.financingEmail,
    });
    setBusy(false);
    if (!result.ok) setError(result.error || "Membership is on, but the confirmation email failed.");
  }

  return (
    <main className="flex flex-1 flex-col bg-mac-bg text-mac-fg">
      <ScreenHeader title="Membership" backHref="/profile" />
      <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
        <div className="rounded-2xl border border-[#FCB040]/30 bg-gradient-to-br from-[#161B24] to-[#0E2A44]/40 p-5 shadow-sm">
          <p className="text-[10px] font-bold tracking-[0.22em] text-[#FCB040] uppercase">
            Certified Horology Revaluations
          </p>
          <h2 className="mt-2 text-[26px] font-bold leading-tight text-mac-fg">
            ${settings.membershipMonthly.toFixed(2)}
            <span className="text-[14px] font-normal text-mac-muted"> / month</span>
          </h2>
          <p className="mt-2 text-[12px] leading-relaxed text-mac-muted">
            Active sale-and-repurchase clients receive complimentary monthly certified valuations.
            Independent collectors may subscribe to keep insurance schedules and title logs updated.
          </p>
        </div>

        <div className="rounded-2xl border border-mac-line bg-mac-card p-4">
          <h3 className="text-[11px] font-bold tracking-[0.16em] text-[#E8D5C0] uppercase pb-2 border-b border-mac-line">
            Member Privileges
          </h3>
          <ul className="mt-3 space-y-3 text-[13px] text-mac-muted">
            {[
              "Monthly mark-to-market valuations on registered timepieces",
              "Insurance-grade PDF certificates for family offices and insurers",
              "Priority review of sale-and-repurchase applications",
              applied
                ? `White-glove intake at ${settings.vaultLocation}`
                : "Custody details after you send an application",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <span className="text-[#FCB040] text-sm">✦</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        {user?.member ? (
          <div className="space-y-3 pt-2">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center">
              <p className="text-[13px] font-semibold text-emerald-300">
                You are currently an active Premium Member.
              </p>
              <p className="mt-1 text-[11px] text-mac-muted">
                {user.promoCode === "HOUSE65"
                  ? "HOUSE65 is on file. Next membership month is complimentary."
                  : "Next automatic mark-to-market certificate generates in 18 days."}
              </p>
            </div>
            <PillButton variant="ghost" onClick={() => updateProfile({ member: false })}>
              Pause Membership
            </PillButton>
          </div>
        ) : (
          <div className="pt-2">
            {error ? <p className="mb-3 text-center text-xs text-red-400">{error}</p> : null}
            <PillButton variant="gold" onClick={() => void subscribe()} disabled={busy}>
              {busy ? "Confirming…" : "Subscribe to Monthly Appraisals"}
            </PillButton>
          </div>
        )}
      </div>
    </main>
  );
}
