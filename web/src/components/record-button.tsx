import { Circle } from "lucide-react";
import { cn, formatClock } from "@/lib/utils";
import { t } from "@/lib/i18n";
import type { Lang } from "@/lib/types";

export function RecordButton({
  recording,
  elapsed,
  onToggle,
  lang,
  cap,
}: {
  recording: boolean;
  elapsed: number;
  onToggle: () => void;
  lang: Lang;
  cap?: number;
}) {
  return (
    <div className="flex flex-col items-center gap-3.5">
      <button
        type="button"
        onClick={onToggle}
        aria-label={t(lang, "mic")}
        aria-pressed={recording}
        className={cn(
          "grid size-20 place-items-center rounded-full bg-danger text-on-primary shadow-[0_4px_14px_rgb(179_64_42_/_0.3)] transition-transform duration-150 hover:scale-105",
          recording && "play-live",
        )}
      >
        <Circle className="size-6 fill-current" />
      </button>
      {recording ? (
        <div className="flex items-center gap-2.5 font-semibold text-danger">
          <span className="size-2.5 rounded-full bg-danger" />
          <span>
            {t(lang, "recording")} ·{" "}
            <span className="tabular-nums">{formatClock(elapsed)}</span>
            {cap ? ` / ${formatClock(cap)}` : ""}
          </span>
        </div>
      ) : cap ? (
        <p className="text-caption text-muted">
          {t(lang, "tapRecord")} · {formatClock(cap)}
        </p>
      ) : null}
    </div>
  );
}

export function RecordingPlayback({
  url,
  label,
  againLabel,
  onAgain,
}: {
  url: string;
  label: string;
  againLabel: string;
  onAgain: () => void;
}) {
  return (
    <div className="mt-3 w-full rounded-md border border-line bg-surface p-2.5">
      <div className="mb-1.5 text-micro font-medium uppercase tracking-[0.08em] text-faint">
        {label}
      </div>
      <audio controls src={url} className="h-9 w-full" />
      <button
        type="button"
        onClick={onAgain}
        className="mt-2 text-sm text-muted underline-offset-4 hover:underline"
      >
        {againLabel}
      </button>
    </div>
  );
}
