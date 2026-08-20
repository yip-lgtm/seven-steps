import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/components/app-shell";
import { PipelineCard } from "@/components/pipeline-card";
import { PersonaCard } from "@/components/persona-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { STEPS } from "@/data/steps";
import { useHydrated } from "@/hooks/use-hydrated";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { STEP_HINT, STEP_NAME, t } from "@/lib/i18n";
import { fetchDailyClips } from "@/lib/server/daily";
import { loadLearner, saveLearner } from "@/lib/server/progress";
import { useApp } from "@/lib/store";
import { average, todayIso } from "@/lib/utils";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const navigate = useNavigate();
  const lang = useApp((s) => s.lang);
  const level = useApp((s) => s.level);
  const progress = useApp((s) => s.progress);
  const log = useApp((s) => s.todayLog);
  const settings = useApp((s) => s.settings);
  const ratings = useApp((s) => s.recentRatings);
  const dailyDate = useApp((s) => s.dailyDate);
  const dailySource = useApp((s) => s.dailySource);
  const dailyStatus = useApp((s) => s.dailyStatus);
  const session = useApp((s) => s.session);
  const hydrated = useHydrated();
  const { user, isPending } = useCurrentUserState();

  const inProgress = Boolean(
    hydrated && session && session.view !== "sessionDone",
  );

  useEffect(() => {
    let alive = true;
    const current = useApp.getState();
    if (current.dailySource === "ai" && current.dailyDate === todayIso()) {
      return;
    }
    if (current.dailySource !== "github") {
      useApp.getState().setDailyStatus("loading");
    }
    void (async () => {
      const pack = await fetchDailyClips();
      if (!alive) return;
      if (
        pack.clips.length &&
        (pack.source === "github" || pack.source === "pool" || pack.source === "ai")
      ) {
        useApp.getState().setClips(pack.clips, {
          date: pack.date,
          source: pack.source,
        });
        useApp.getState().setDailyStatus("ready");
      } else if (useApp.getState().dailySource === "github") {
        useApp.getState().setDailyStatus("ready");
      } else {
        useApp.getState().setDailyStatus("offline");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (isPending || !user) return;
    let alive = true;
    void (async () => {
      try {
        const remote = await loadLearner();
        if (!alive) return;
        if (!remote) {
          await saveLearner({ data: useApp.getState().snapshot() });
          return;
        }
        const local = useApp.getState();
        const useRemote =
          (remote.progress.totalClips ?? 0) >= local.progress.totalClips;
        if (useRemote) useApp.getState().applyRemote(remote);
        else await saveLearner({ data: useApp.getState().snapshot() });
      } catch {
        /* guest path / unauthorized */
      }
    })();
    return () => {
      alive = false;
    };
  }, [user, isPending]);

  const win = settings.winThreshold;
  const total = settings.clipsPerSession;
  const won = log.clips >= win;
  const remaining = Math.max(0, win - log.clips);
  const avg = ratings.length ? average(ratings).toFixed(1) : null;

  const banner =
    dailySource === "github" && dailyDate ? (
      <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary">
        <span className="size-1.5 rounded-full bg-good" />
        {t(lang, "dailyFresh", { date: dailyDate, level })}
      </div>
    ) : dailyStatus === "loading" ? (
      <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-warm-soft px-2.5 py-1 text-xs font-semibold text-warm">
        {t(lang, "fetching")}
      </div>
    ) : dailySource === "ai" && dailyDate ? (
      <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary">
        {t(lang, "savedClips", { level })}
      </div>
    ) : dailySource === "pool" ? (
      <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-warm-soft px-2.5 py-1 text-xs font-semibold text-warm">
        {t(lang, "poolBanner", { level })}
      </div>
    ) : (
      <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-warm-soft px-2.5 py-1 text-xs font-semibold text-warm">
        {t(lang, "baselineBanner", { level })}
      </div>
    );

  return (
    <AppShell>
      <Card className="p-7">
        <h1 className="font-display text-display font-semibold leading-[1.15] tracking-[-0.03em] text-fg">
          {t(lang, "hero")}
        </h1>
        {banner}
        <PersonaCard />
        <p className="mt-3 text-body leading-relaxed text-muted">
          {t(lang, "heroBody", { total, win })}{" "}
          {won ? t(lang, "wonToday") : t(lang, "remaining", { n: remaining })}
        </p>
        {inProgress ? (
          <p className="mt-2 text-caption text-warm">
            {t(lang, "resumeHint", { step: (session?.stepIdx ?? 0) + 1 })}
          </p>
        ) : null}

        <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <HomeStat
            label={t(lang, "level")}
            value={level}
            sub={avg ? t(lang, "avg", { n: avg }) : t(lang, "defaultAvg")}
          />
          <HomeStat
            label={t(lang, "streak")}
            value={progress.streak}
            sub={t(lang, "days")}
          />
          <HomeStat
            label={t(lang, "today")}
            value={`${log.clips}/${total}`}
            sub={won ? t(lang, "wonMark") : `${remaining} ${t(lang, "toWin")}`}
          />
          <HomeStat
            label={t(lang, "allTime")}
            value={progress.totalClips}
            sub={`${t(lang, "clips")} · ${progress.totalWins} ${t(lang, "wins")}`}
          />
        </div>

        {log.ratings.length ? (
          <div className="mt-4">
            <div className="text-micro uppercase tracking-[0.06em] text-faint">
              {t(lang, "todayHeard")}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {log.ratings.map((r, i) => (
                <span
                  key={`${i}-${r}`}
                  className="grid size-8 place-items-center rounded-sm bg-bg text-xs font-semibold tabular-nums text-warm"
                  title={`${r}/5`}
                >
                  {r}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-7 flex flex-wrap gap-2.5">
          <Button
            size="lg"
            onClick={() => {
              if (!inProgress) useApp.getState().startSession();
              void navigate({ to: "/practice" });
            }}
          >
            {inProgress
              ? t(lang, "resume")
              : log.clips > 0
                ? t(lang, "continue")
                : t(lang, "start")}
          </Button>
          <Button
            variant="ghost"
            onClick={() => void navigate({ to: "/settings" })}
          >
            {t(lang, "settings")}
          </Button>
        </div>

        <p className="mt-5 text-caption text-faint">{t(lang, "methodNote")}</p>
      </Card>
      <PipelineCard />
      <Card className="mt-5 p-7">
        <ul className="border-t-0">
          {STEPS.map((s, i) => (
            <li
              key={s.id}
              className="flex gap-3 border-b border-line py-2.5 first:pt-0 last:border-b-0 last:pb-0"
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary-soft text-caption font-bold text-primary">
                {i + 1}
              </span>
              <span>
                <strong className="text-sm text-fg">{STEP_NAME[lang][s.id]}</strong>
                <span className="mt-0.5 block text-caption text-muted">
                  {STEP_HINT[lang][s.id]}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </AppShell>
  );
}

function HomeStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub: string;
}) {
  return (
    <div className="rounded-md bg-bg px-4 py-3.5">
      <div className="text-micro uppercase tracking-[0.06em] text-faint">
        {label}
      </div>
      <div className="mt-1 font-display text-[26px] font-semibold tabular-nums tracking-tight">
        {value}
      </div>
      <div className="mt-0.5 text-micro text-muted">{sub}</div>
    </div>
  );
}
