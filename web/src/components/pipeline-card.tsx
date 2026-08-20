import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatSourceLabel, topicForClip } from "@/lib/clips";
import { t } from "@/lib/i18n";
import { runLivePipeline } from "@/lib/run-pipeline";
import { useApp } from "@/lib/store";
import { todayIso } from "@/lib/utils";
import { Clock } from "lucide-react";
import { toast } from "sonner";

export function PipelineCard() {
  const lang = useApp((s) => s.lang);
  const clips = useApp((s) => s.clips);
  const dailyDate = useApp((s) => s.dailyDate);
  const dailySource = useApp((s) => s.dailySource);
  const stats = useApp((s) => s.pipelineStats);
  const stale = Boolean(dailyDate && dailyDate !== todayIso());
  const [busy, setBusy] = useState(false);

  return (
    <section className="mt-5 rounded-xl border border-line bg-surface p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-warm-soft text-warm">
          <Clock className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold tracking-tight">
            {t(lang, "pipelineTitle")}
          </h2>
          <p className="mt-1 text-caption leading-relaxed text-muted">
            {t(lang, "pipelineCron")}
          </p>
          {stats ? (
            <p className="mt-2 text-micro font-semibold text-primary">
              {t(lang, "pipelineStats", {
                fourchan: stats.fourchan,
                transcripts: stats.transcripts,
              })}
            </p>
          ) : dailySource === "github" && dailyDate ? (
            <p className="mt-2 text-micro font-semibold text-primary">
              {t(lang, "githubSource", { date: dailyDate })}
            </p>
          ) : dailySource === "ai" ? (
            <p className="mt-2 text-micro font-semibold text-primary">
              {t(lang, "aiSource")}
            </p>
          ) : null}
          {stale && dailySource === "github" ? (
            <p className="mt-2 text-caption text-warm">{t(lang, "staleDaily")}</p>
          ) : null}
          <div className="mt-3">
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const id = toast.loading(t(lang, "genWait"));
                try {
                  const ok = await runLivePipeline();
                  toast.dismiss(id);
                  if (ok) toast.success(t(lang, "generated"));
                  else toast.error(t(lang, "genFail"));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? t(lang, "generating") : t(lang, "newSet")}
            </Button>
          </div>
        </div>
      </div>

      {clips.length ? (
        <div className="mt-4 border-t border-line pt-3">
          <div className="mb-2 text-micro uppercase tracking-[0.06em] text-faint">
            {t(lang, "lineupTitle")}
          </div>
          <ol className="space-y-2">
            {clips.slice(0, 7).map((clip, i) => (
              <li key={clip.id} className="flex gap-2.5 text-caption">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary-soft text-micro font-bold text-primary">
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium text-fg">
                    {clip.topic_zh ? `${clip.topic_zh} · ` : ""}
                    {topicForClip(clip)}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-micro text-faint">
                    {clip.category ? <span>{clip.category}</span> : null}
                    {clip.source_url ? (
                      <a
                        href={clip.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {formatSourceLabel(clip.source_url)}
                      </a>
                    ) : null}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
