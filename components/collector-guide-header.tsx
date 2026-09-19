"use client";

import { ScreenHeader } from "@/components/screen-header";
import { useStore } from "@/lib/store";
import { COLLECTOR_TUTORIAL } from "@/lib/tutorials";

export function CollectorGuideHeader() {
  const { user } = useStore();
  const backHref = user?.onboardingComplete ? "/collection" : "/collection/setup";

  return <ScreenHeader title={COLLECTOR_TUTORIAL.title} backHref={backHref} />;
}
