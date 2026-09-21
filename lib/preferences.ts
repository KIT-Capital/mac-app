import type { UserPreferences } from "@/lib/types";

export const DEFAULT_PREFERENCES: UserPreferences = {
  appearance: "dark",
  pushNotifications: true,
  emailUpdates: true,
  smsUpdates: false,
  whatsappUpdates: false,
  preferredContact: "email",
  language: "en",
};

export function mergePreferences(prefs?: Partial<UserPreferences> | null): UserPreferences {
  return {
    ...DEFAULT_PREFERENCES,
    ...prefs,
  };
}
