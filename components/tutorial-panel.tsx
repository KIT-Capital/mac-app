import type { Tutorial } from "@/lib/tutorials";
import { cn } from "@/lib/utils";

export function TutorialPanel({
  tutorial,
  badge,
  tone,
}: {
  tutorial: Tutorial;
  badge: string;
  tone: "collector" | "desk";
}) {
  const desk = tone === "desk";
  const leadClass = desk ? "text-white/70" : "text-mac-muted";
  const cardClass = desk ? "border-white/25 bg-[#222]" : "border-mac-line bg-mac-card";
  const kickerClass = desk ? "text-mac-gold" : "text-mac-champagne";
  const titleClass = desk ? "text-white" : "text-mac-fg";
  const bodyClass = desk ? "text-white/65" : "text-mac-muted";

  return (
    <div className="space-y-4">
      <span className="inline-block rounded-full border border-mac-gold/30 bg-mac-gold/10 px-3 py-0.5 text-[10px] font-bold tracking-wider text-mac-gold uppercase">
        {badge}
      </span>
      <h2 className={cn("text-[20px] font-semibold", titleClass)}>{tutorial.title}</h2>
      <p className={cn("text-[13px] leading-relaxed", leadClass)}>{tutorial.lead}</p>
      <ol className="space-y-3">
        {tutorial.steps.map((step, index) => (
          <li
            key={step.title}
            className={cn("rounded-2xl border p-4", cardClass)}
          >
            <p className={cn("text-[10px] font-semibold tracking-[0.14em] uppercase", kickerClass)}>
              Step {index + 1}
            </p>
            <h3 className={cn("mt-1 text-[15px] font-semibold", titleClass)}>
              {step.title}
            </h3>
            <p className={cn("mt-2 text-[13px] leading-relaxed", bodyClass)}>
              {step.body}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
