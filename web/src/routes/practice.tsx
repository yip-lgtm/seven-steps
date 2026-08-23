import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ClipRail, StepRail } from "@/components/step-rail";
import { SourceLine, StepBody } from "@/components/step-body";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { STEPS } from "@/data/steps";
import { useHydrated } from "@/hooks/use-hydrated";
import { usePracticeKeys } from "@/hooks/use-practice-keys";
import { saveLearner } from "@/lib/server/progress";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { topicForClip } from "@/lib/clips";
import { STEP_HINT, STEP_NAME, t } from "@/lib/i18n";
import { stopPlayback } from "@/lib/player";
import { useApp } from "@/lib/store";
import { Check, Trophy } from "lucide-react";

export const Route = createFileRoute("/practice")({ component: Practice });

function Practice() {
  const navigate = useNavigate();
  const session = useApp((s) => s.session);
  const hydrated = useHydrated();
  const { user } = useCurrentUserState();

  useEffect(() => {
    if (!hydrated) return;
    if (!session) void navigate({ to: "/" });
  }, [session, hydrated, navigate]);

  useEffect(() => {
    if (!user || !session) return;
    if (session.view === "clipDone" || session.view === "sessionDone") {
      void saveLearner({ data: useApp.getState().snapshot() }).catch(() => {});
    }
  }, [user, session?.view, session]);

  if (!hydrated) {
    return (
      <AppShell>
        <Card className="min-h-[240px] animate-pulse" />
      </AppShell>
    );
  }
  if (!session) return null;
  if (session.view === "clipDone") return <ClipDone />;
  if (session.view === "sessionDone") return <SessionDone />;
  return <StepView />;
}

function StepView() {
  const navigate = useNavigate();
  const lang = useApp((s) => s.lang);
  const level = useApp((s) => s.level);
  const clips = useApp((s) => s.clips);
  const sess = useApp((s) => s.session)!;
  const step = STEPS[sess.stepIdx];
  const clip = clips[sess.clipQueue[sess.clipIdx]];
  const last = sess.stepIdx === STEPS.length - 1;
  const needRate = step.id === "rate" && !sess.rating;
  const [confirmEnd, setConfirmEnd] = useState(false);

  usePracticeKeys({
    canNext: !needRate,
    onNext: () => {
      stopPlayback();
      useApp.getState().nextStep();
    },
  });

  if (!clip || !step) return null;

  return (
    <AppShell>
      <Card>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="text-caption uppercase tracking-[0.06em] text-faint">
            {t(lang, "clipOf", {
              n: sess.clipIdx + 1,
              total: sess.clipQueue.length,
            })}
          </div>
          <div className="rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">
            {t(lang, "stepOf", {
              n: sess.stepIdx + 1,
              name: STEP_NAME[lang][step.id],
              level,
            })}
          </div>
        </div>
        <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
          {clip.category ? (
            <span className="rounded-full bg-warm-soft px-3 py-1 text-xs font-semibold text-warm">
              {clip.category}
            </span>
          ) : null}
          {clip.topic_zh ? (
            <span className="text-body font-semibold">{clip.topic_zh}</span>
          ) : null}
          <span className="text-caption text-muted">{topicForClip(clip)}</span>
        </div>
        <h2 className="font-display text-title font-semibold tracking-tight">
          {STEP_NAME[lang][step.id]}
        </h2>
        <p className="mb-5 mt-1.5 text-body leading-relaxed text-muted">
          {STEP_HINT[lang][step.id]}
        </p>
        <div
          key={`${sess.clipIdx}-${step.id}`}
          className="step-enter mb-5 min-h-[140px] rounded-lg bg-bg p-6"
        >
          <StepBody step={step.id} clip={clip} />
        </div>
        <SourceLine url={clip.source_url} hint={clip.source_hint} />
        <div className="mt-5 flex items-center justify-between gap-2.5">
          <Button variant="ghost" onClick={() => setConfirmEnd(true)}>
            {t(lang, "endSession")}
          </Button>
          <Button
            disabled={needRate}
            title={needRate ? t(lang, "rateNeed") : undefined}
            onClick={() => {
              stopPlayback();
              useApp.getState().nextStep();
            }}
          >
            {last ? t(lang, "finishClip") : t(lang, "nextStep")}
          </Button>
        </div>
        <ClipRail total={sess.clipQueue.length} current={sess.clipIdx} />
        <StepRail current={sess.stepIdx} lang={lang} />
        <p className="mt-4 hidden text-center text-micro text-faint sm:block">
          {t(lang, "keysHint")}
        </p>
      </Card>
      <ConfirmDialog
        open={confirmEnd}
        title={t(lang, "confirmEndTitle")}
        body={t(lang, "endConfirm")}
        confirmLabel={t(lang, "endSession")}
        cancelLabel={t(lang, "cancel")}
        onCancel={() => setConfirmEnd(false)}
        onConfirm={() => {
          stopPlayback();
          useApp.getState().endSession();
          void navigate({ to: "/" });
        }}
      />
    </AppShell>
  );
}

function ClipDone() {
  const navigate = useNavigate();
  const lang = useApp((s) => s.lang);
  const sess = useApp((s) => s.session)!;
  const clips = useApp((s) => s.clips);
  const log = useApp((s) => s.todayLog);
  const settings = useApp((s) => s.settings);
  const prev = clips[sess.clipQueue[sess.clipIdx - 1]];
  const topic = prev ? topicForClip(prev) : "";
  const zh = prev?.topic_zh ? ` · ${prev.topic_zh}` : "";
  const left = Math.max(0, settings.winThreshold - log.clips);

  return (
    <AppShell>
      <Card className="text-center">
        <div className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-primary-soft text-primary">
          <Check className="size-8" strokeWidth={2.5} />
        </div>
        <h2 className="font-display text-[28px] font-semibold">{t(lang, "clipDone")}</h2>
        <p className="mt-2.5 text-body text-muted">
          {t(lang, "clipDoneSub", { topic: `${topic}${zh}` })}
        </p>
        <p className="mt-2 text-body text-muted">
          {log.clips} / {settings.clipsPerSession} {t(lang, "clips")}.{" "}
          {left > 0 ? t(lang, "remaining", { n: left }) : t(lang, "wonMark")}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-2.5">
          <Button
            size="lg"
            onClick={() => useApp.getState().continueNextClip()}
          >
            {t(lang, "nextClip")}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              useApp.getState().endSession();
              void navigate({ to: "/" });
            }}
          >
            {t(lang, "endSession")}
          </Button>
        </div>
      </Card>
    </AppShell>
  );
}

function SessionDone() {
  const navigate = useNavigate();
  const lang = useApp((s) => s.lang);
  const log = useApp((s) => s.todayLog);
  const settings = useApp((s) => s.settings);
  const streak = useApp((s) => s.progress.streak);
  const won = log.clips >= settings.winThreshold;
  const left = Math.max(0, settings.winThreshold - log.clips);

  return (
    <AppShell>
      <Card className="text-center">
        <div className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-primary-soft text-primary">
          {won ? <Trophy className="size-8" /> : <Check className="size-8" />}
        </div>
        <h2 className="font-display text-[28px] font-semibold">
          {won ? t(lang, "sessionWin") : t(lang, "sessionDone")}
        </h2>
        <p className="mt-2.5 text-body text-muted">
          {won
            ? t(lang, "sessionWinSub", { n: settings.winThreshold, streak })
            : t(lang, "sessionMissSub", { n: log.clips, left })}
        </p>
        <p className="mt-2 text-body text-muted">{t(lang, "tomorrow")}</p>
        <div className="mt-8 flex justify-center">
          <Button
            size="lg"
            onClick={() => {
              useApp.getState().goHome();
              void navigate({ to: "/" });
            }}
          >
            {t(lang, "backHome")}
          </Button>
        </div>
      </Card>
    </AppShell>
  );
}
