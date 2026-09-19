import { AdminChrome } from "@/components/admin-chrome";
import { TutorialPanel } from "@/components/tutorial-panel";
import { DESK_TUTORIAL } from "@/lib/tutorials";

export default function DeskGuidePage() {
  return (
    <AdminChrome title="Tutorial">
      <div className="max-w-3xl">
        <TutorialPanel tutorial={DESK_TUTORIAL} badge="Staff only" tone="desk" />
      </div>
    </AdminChrome>
  );
}
