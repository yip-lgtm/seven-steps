import { useEffect, useRef } from "react";
import { PlayButton } from "@/components/play-button";
import { RecordButton, RecordingPlayback } from "@/components/record-button";
import { StarRating } from "@/components/star-rating";
import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { usePlayerToggle } from "@/hooks/use-player-toggle";
import { usePracticeKeys } from "@/hooks/use-practice-keys";
import { useRecorder } from "@/hooks/use-recorder";
import { formatSourceLabel, textForLevel, topicForClip } from "@/lib/clips";
import { rateLabels, t } from "@/lib/i18n";
import { checkGist } from "@/lib/server/coach";
import { useApp } from "@/lib/store";
import type { Clip, StepId } from "@/lib/types";
import { formatClock } from "@/lib/utils";
import { toast } from "sonner";

export function StepBody({ step, clip }: { step: StepId; clip: Clip }) {
  const lang = useApp((s) => s.lang);
  const level = useApp((s) => s.level);
  const sess = useApp((s) => s.session);
  const { playing, loading, toggle, stop, prefetch } = usePlayerToggle();
  const en = textForLevel(clip, level);
  const zh = clip.text_zh || "";
  const hasZh = Boolean(zh);

  const onDenied = () => toast.error(t(lang, "recDenied"));
  const rec = useRecorder(onDenied, (url, secs) => {
    useApp.getState().setRecording(url, secs);
  });
  const capTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!clip.audio) prefetch(en);
  }, [en, prefetch, clip.audio]);

  useEffect(() => {
    return () => {
      stop();
      if (capTimer.current) window.clearTimeout(capTimer.current);
    };
  }, [stop, step]);

  const handleRec = async () => {
    if (rec.recording) {
      rec.stop();
      return;
    }
    await rec.start();
    if (step === "freestyle") {
      capTimer.current = window.setTimeout(() => {
        rec.stop();
      }, 61000);
    }
  };

  usePracticeKeys({
    onPlay: () => void toggle(en, clip.audio),
    onRec:
      step === "shadow" ||
      step === "read" ||
      step === "recall" ||
      step === "freestyle"
        ? () => void handleRec()
        : undefined,
    onRate:
      step === "rate"
        ? (n) => {
            const changed = useApp.getState().setRating(n);
            if (changed) {
              const up =
                ["A2", "B1", "B2", "C1", "C2"].indexOf(changed) >
                ["A2", "B1", "B2", "C1", "C2"].indexOf(level);
              toast.success(
                t(lang, up ? "levelUp" : "levelDown", { level: changed }),
              );
            }
          }
        : undefined,
  });

  const playArea = (label: string) => (
    <div className="flex flex-col items-center gap-3.5">
      <PlayButton
        playing={playing}
        loading={loading}
        onClick={() => void toggle(en, clip.audio)}
        label={
          loading
            ? t(lang, "preparing")
            : playing
              ? t(lang, "stop")
              : t(lang, "play")
        }
      />
      <p className="max-w-[420px] text-center text-caption text-muted">
        {loading ? t(lang, "preparing") : label}
      </p>
    </div>
  );

  const recBlock = (label: string, cap?: number) => (
    <div className="mt-6">
      <RecordButton
        recording={rec.recording}
        elapsed={rec.elapsed}
        onToggle={() => void handleRec()}
        lang={lang}
        cap={cap}
      />
      {sess?.recordingUrl ? (
        <RecordingPlayback
          url={sess.recordingUrl}
          label={label}
          againLabel={t(lang, "recordAgain")}
          onAgain={() => useApp.getState().setRecording(null, 0)}
        />
      ) : null}
    </div>
  );

  if (!sess) return null;

  if (step === "rate") {
    const labels = rateLabels(lang);
    return (
      <div className="flex flex-col items-center gap-4">
        {playArea(
          t(lang, "tapPlay") + (hasZh ? ` ${t(lang, "tapPlayZh")}` : ""),
        )}
        <StarRating
          value={sess.rating}
          onChange={(n) => {
            const changed = useApp.getState().setRating(n);
            if (changed) {
              const up =
                ["A2", "B1", "B2", "C1", "C2"].indexOf(changed) >
                ["A2", "B1", "B2", "C1", "C2"].indexOf(level);
              toast.success(
                t(lang, up ? "levelUp" : "levelDown", { level: changed }),
              );
            }
          }}
        />
        <p className="text-caption text-muted">
          {sess.rating
            ? labels[sess.rating - 1]
            : t(lang, "howMuch", { level })}
        </p>
      </div>
    );
  }

  if (step === "grasp") {
    return (
      <div>
        {playArea(t(lang, "graspPlay"))}
        <div className="mt-4.5">
          <FieldLabel>{t(lang, "graspLabel")}</FieldLabel>
          <Textarea
            value={sess.graspText}
            onChange={(e) => useApp.getState().setGraspText(e.target.value)}
            placeholder={t(lang, "graspPlaceholder")}
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => useApp.getState().setGraspRevealed(true)}
            disabled={sess.graspRevealed}
          >
            {sess.graspRevealed ? t(lang, "revealed") : t(lang, "reveal")}
          </Button>
          <CoachButton original={en} />
        </div>
        {sess.graspRevealed ? (
          <div className="mt-4 space-y-3">
            {hasZh ? (
              <>
                <FieldLabel>{t(lang, "zhLabel")}</FieldLabel>
                <p className="border-l-[3px] border-warm pl-3 text-copy leading-relaxed text-muted italic">
                  {zh}
                </p>
                <FieldLabel>{t(lang, "enLabel", { level })}</FieldLabel>
              </>
            ) : (
              <FieldLabel>{t(lang, "original")}</FieldLabel>
            )}
            <p className="text-copy leading-relaxed">{en}</p>
          </div>
        ) : null}
        {sess.graspCoach ? (
          <div className="mt-4 rounded-md bg-primary-soft p-4 text-sm leading-relaxed text-fg">
            {sess.graspCoach}
          </div>
        ) : null}
      </div>
    );
  }

  if (step === "hum") {
    return (
      <div>
        {playArea(t(lang, "humPlay"))}
        <p className="mt-6 text-center text-caption text-faint">
          {t(lang, "humNote")}
        </p>
      </div>
    );
  }

  if (step === "shadow") {
    return (
      <div>
        {playArea(t(lang, "shadowPlay"))}
        {recBlock(t(lang, "yourShadow"))}
      </div>
    );
  }

  if (step === "read") {
    return (
      <div>
        {playArea(t(lang, "readPlay"))}
        <div className="mt-6 space-y-3">
          {hasZh ? (
            <>
              <FieldLabel>{t(lang, "readThis", { level })}</FieldLabel>
              <p className="text-copy leading-relaxed">{en}</p>
              <FieldLabel>{t(lang, "zhRef")}</FieldLabel>
              <p className="border-l-[3px] border-warm pl-3 text-copy leading-relaxed text-muted italic">
                {zh}
              </p>
            </>
          ) : (
            <>
              <FieldLabel>{t(lang, "transcript")}</FieldLabel>
              <p className="text-copy leading-relaxed">{en}</p>
            </>
          )}
        </div>
        {recBlock(t(lang, "yourRead"))}
      </div>
    );
  }

  if (step === "recall") {
    return (
      <div>
        {playArea(t(lang, "recallPlay"))}
        <div className="mt-4">
          <Button
            type="button"
            variant="secondary"
            onClick={() => useApp.getState().toggleRecall()}
          >
            {sess.recallHidden ? t(lang, "showText") : t(lang, "hideText")}
          </Button>
          {!sess.recallHidden ? (
            <div className="mt-3 space-y-2">
              <p className="text-copy leading-relaxed">{en}</p>
              {hasZh ? (
                <p className="border-l-[3px] border-warm pl-3 text-copy leading-relaxed text-muted italic">
                  {zh}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
        {recBlock(t(lang, "yourRecall"))}
      </div>
    );
  }

  if (step === "freestyle") {
    const topic = `${topicForClip(clip)}${clip.topic_zh ? ` · ${clip.topic_zh}` : ""}`;
    return (
      <div>
        <p className="mx-auto max-w-[420px] text-center text-body text-muted">
          {t(lang, "freestyleHint", { topic })}
        </p>
        {recBlock(
          t(lang, "yourFreestyle", {
            time: formatClock(sess.recordingSecs || rec.elapsed),
          }),
          60,
        )}
      </div>
    );
  }

  return null;
}

function CoachButton({ original }: { original: string }) {
  const lang = useApp((s) => s.lang);
  const gist = useApp((s) => s.session?.graspText ?? "");
  const busy = useRef(false);

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={async () => {
        if (!gist.trim()) {
          toast.error(t(lang, "gistNeed"));
          return;
        }
        if (busy.current) return;
        busy.current = true;
        const id = toast.loading(t(lang, "coaching"));
        try {
          const res = await checkGist({
            data: { gist, original, lang },
          });
          toast.dismiss(id);
          if (res.ok) useApp.getState().setGraspCoach(res.text);
          else toast.error(t(lang, "genFail"));
        } finally {
          busy.current = false;
        }
      }}
    >
      {t(lang, "coach")}
    </Button>
  );
}

export function SourceLine({ url, hint }: { url?: string; hint?: string }) {
  const lang = useApp((s) => s.lang);
  if (!url) return null;
  return (
    <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-faint">
      <span className="font-semibold uppercase tracking-[0.06em]">
        {t(lang, "source")}:
      </span>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="break-all text-primary hover:underline"
      >
        {formatSourceLabel(url)}
      </a>
      {hint ? <span className="w-full text-micro italic">{hint}</span> : null}
    </p>
  );
}
