"use client";

import { ScreenHeader } from "@/components/screen-header";
import { PillButton } from "@/components/field";
import { COMPANY } from "@/lib/catalog";
import { useStore } from "@/lib/store";

export default function MembershipPage() {
  const { user, updateProfile } = useStore();

  return (
    <main className="flex flex-1 flex-col">
      <ScreenHeader title="Membership" backHref="/profile" />
      <div className="flex-1 space-y-6 px-6 py-8">
        <p className="text-[11px] tracking-[0.22em] text-[#FCB040] uppercase">Premium collection service</p>
        <h2 className="font-[family-name:var(--font-display)] text-4xl leading-tight">
          Monthly appraisals for ${COMPANY.membershipMonthly.toFixed(2)}
          <span className="text-2xl text-white/50">/month</span>
        </h2>
        <p className="text-sm leading-6 text-white/65">
          Active financing clients receive appraisals at no charge. Other collectors can subscribe
          for monthly revaluations, insurance-ready documentation, and priority desk access when a
          repo is requested.
        </p>
        <ul className="space-y-3 text-sm text-white/80">
          {[
            "Monthly mark-to-market on registered timepieces",
            "PDF certificates for insurers and family offices",
            "Priority two-day close on qualifying repos",
            "White-glove coordination with the Manhattan vault",
          ].map((item) => (
            <li key={item} className="border-b border-white/10 pb-3">
              {item}
            </li>
          ))}
        </ul>
        {user?.member ? (
          <div className="space-y-3">
            <p className="rounded-md border border-[#FCB040]/40 px-4 py-3 text-sm text-[#FCB040]">
              You are a premium member. Monthly appraisals are on.
            </p>
            <PillButton variant="ghost" onClick={() => updateProfile({ member: false })}>
              Cancel membership
            </PillButton>
          </div>
        ) : (
          <PillButton onClick={() => updateProfile({ member: true })}>
            Become a member
          </PillButton>
        )}
      </div>
    </main>
  );
}
