"use client";

import { AppearanceToggle } from "@/components/appearance-toggle";
import { ScreenHeader } from "@/components/screen-header";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export default function PreferencesPage() {
  const { user, updatePreferences } = useStore();
  const prefs = user?.preferences;

  if (!prefs) {
    return (
      <main className="flex flex-1 flex-col bg-mac-bg text-mac-fg">
        <ScreenHeader title="Preferences" backHref="/profile" />
        <p className="px-6 py-10 text-center text-[13px] text-mac-muted">Sign in to save preferences.</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col bg-mac-bg text-mac-fg">
      <ScreenHeader title="Preferences" backHref="/profile" />
      <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
        <section>
          <p className="mb-2 text-[10px] font-semibold tracking-[0.14em] text-[#E8D5C0] uppercase">
            Appearance
          </p>
          <AppearanceToggle />
        </section>

        <section className="space-y-2">
          <p className="text-[10px] font-semibold tracking-[0.14em] text-[#E8D5C0] uppercase">
            Notifications
          </p>
          <PrefToggle
            label="Push notices"
            hint="Appraisal status and desk messages"
            checked={prefs.pushNotifications}
            onChange={(pushNotifications) => updatePreferences({ pushNotifications })}
          />
          <PrefToggle
            label="Email updates"
            hint="Confirmations and certificates"
            checked={prefs.emailUpdates}
            onChange={(emailUpdates) => updatePreferences({ emailUpdates })}
          />
          <PrefToggle
            label="SMS updates"
            hint="Only for time-sensitive intake"
            checked={prefs.smsUpdates}
            onChange={(smsUpdates) => updatePreferences({ smsUpdates })}
          />
        </section>

        <section>
          <p className="mb-2 text-[10px] font-semibold tracking-[0.14em] text-[#E8D5C0] uppercase">
            Preferred contact
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(["email", "phone"] as const).map((method) => (
              <button
                key={method}
                type="button"
                onClick={() => updatePreferences({ preferredContact: method })}
                className={cn(
                  "mac-tap rounded-xl border py-3 text-[12px] font-semibold tracking-[0.12em] uppercase",
                  prefs.preferredContact === method
                    ? "border-[#FCB040] bg-[#0E2A44] text-white"
                    : "border-mac-line bg-mac-card text-mac-muted",
                )}
              >
                {method}
              </button>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function PrefToggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 bg-mac-card px-4 py-3 text-left"
    >
      <span>
        <span className="block text-[14px] text-mac-fg">{label}</span>
        <span className="block text-[11px] text-mac-faint">{hint}</span>
      </span>
      <span
        className={cn(
          "relative h-6 w-11 rounded-full transition",
          checked ? "bg-[#0E2A44]" : "bg-mac-line",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white transition",
            checked ? "left-5" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}
