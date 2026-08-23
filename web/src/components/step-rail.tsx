import { STEPS } from "@/data/steps";
import { STEP_SHORT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Lang } from "@/lib/types";

export function StepRail({
  current,
  lang,
}: {
  current: number;
  lang: Lang;
}) {
  return (
    <ol className="mt-5 grid grid-cols-7 gap-1">
      {STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s.id} className="flex flex-col items-center gap-1.5">
            <span
              className={cn(
                "h-1 w-full rounded-sm transition-colors duration-200",
                done && "bg-primary",
                active && "bg-warm",
                !done && !active && "bg-line",
              )}
            />
            <span
              className={cn(
                "text-center text-[10px] leading-tight sm:text-xs",
                active ? "font-semibold text-fg" : "text-faint",
              )}
            >
              {STEP_SHORT[lang][s.id]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function ClipRail({
  total,
  current,
}: {
  total: number;
  current: number;
}) {
  return (
    <div className="mt-5 flex gap-1.5" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={cn(
            "h-1.5 flex-1 rounded-sm transition-colors duration-200",
            i < current && "bg-primary",
            i === current && "bg-warm",
            i > current && "bg-line",
          )}
        />
      ))}
    </div>
  );
}
