import { CollectorGuideHeader } from "@/components/collector-guide-header";
import { TutorialPanel } from "@/components/tutorial-panel";
import { COLLECTOR_TUTORIAL } from "@/lib/tutorials";

export default function CollectorGuidePage() {
  return (
    <main className="flex flex-1 flex-col bg-mac-bg text-mac-fg">
      <CollectorGuideHeader />
      <div className="mx-auto w-full max-w-md flex-1 overflow-y-auto px-6 py-6">
        <TutorialPanel tutorial={COLLECTOR_TUTORIAL} badge="Collector guide" tone="collector" />
      </div>
    </main>
  );
}
