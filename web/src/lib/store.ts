import { create } from "zustand";
import { persist } from "zustand/middleware";
import { BASELINE_CLIPS } from "@/data/baseline";
import { STEPS } from "@/data/steps";
import { winThresholdFor } from "@/lib/clips";
import { levelFromAverage } from "@/lib/levels";
import { average, todayIso, yesterdayIso } from "@/lib/utils";
import type {
  Cefr,
  Clip,
  DailySource,
  Lang,
  PipelineStats,
  Progress,
  Settings,
  TodayLog,
} from "@/lib/types";

export type Theme = "light" | "dark";
export type DailyStatus = "idle" | "loading" | "ready" | "offline";

export type Session = {
  clipQueue: number[];
  clipIdx: number;
  stepIdx: number;
  rating: number | null;
  graspText: string;
  graspRevealed: boolean;
  graspCoach: string | null;
  recallHidden: boolean;
  recordingUrl: string | null;
  recordingSecs: number;
  startedAt: number;
  view: "step" | "clipDone" | "sessionDone";
};

type AppState = {
  lang: Lang;
  theme: Theme;
  level: Cefr;
  levelLocked: boolean;
  recentRatings: number[];
  progress: Progress;
  todayLog: TodayLog;
  settings: Settings;
  clips: Clip[];
  dailyDate: string | null;
  dailySource: DailySource;
  dailyStatus: DailyStatus;
  pipelineStats: PipelineStats | null;
  session: Session | null;
  hydrated: boolean;
  setLang: (lang: Lang) => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setLevel: (level: Cefr, locked?: boolean) => void;
  unlockLevel: () => void;
  patchSettings: (partial: Partial<Settings>) => void;
  setDailyStatus: (status: DailyStatus) => void;
  setPipelineStats: (stats: PipelineStats | null) => void;
  setClips: (
    clips: Clip[],
    meta: { date: string | null; source: DailySource },
  ) => void;
  startSession: () => void;
  nextStep: () => void;
  setRating: (n: number) => Cefr | null;
  setGraspText: (text: string) => void;
  setGraspRevealed: (v: boolean) => void;
  setGraspCoach: (text: string | null) => void;
  toggleRecall: () => void;
  setRecording: (url: string | null, secs: number) => void;
  continueNextClip: () => void;
  endSession: () => void;
  goHome: () => void;
  resetProgress: () => void;
  applyRemote: (payload: {
    progress?: Progress;
    todayLog?: TodayLog;
    settings?: Settings;
    level?: Cefr;
    recentRatings?: number[];
  }) => void;
  snapshot: () => {
    progress: Progress;
    todayLog: TodayLog;
    settings: Settings;
    level: Cefr;
    recentRatings: number[];
  };
};

const defaultProgress = (): Progress => ({
  streak: 0,
  lastWinDate: null,
  totalClips: 0,
  totalWins: 0,
  totalSessions: 0,
});

const defaultToday = (): TodayLog => ({
  date: todayIso(),
  clips: 0,
  ratings: [],
});

const defaultSettings = (): Settings => ({
  voice: "",
  rate: 0.85,
  pitch: 1,
  clipsPerSession: 7,
  winThreshold: 5,
  preferNaturalVoice: true,
  levelLocked: false,
});

function rollToday(log: TodayLog): TodayLog {
  return log.date === todayIso() ? log : defaultToday();
}

function recordWin(progress: Progress): Progress {
  const day = todayIso();
  if (progress.lastWinDate === day) return progress;
  const streak =
    progress.lastWinDate === yesterdayIso() ? progress.streak + 1 : 1;
  return {
    ...progress,
    streak,
    lastWinDate: day,
    totalWins: progress.totalWins + 1,
  };
}

function finishCurrentClip(state: AppState): Partial<AppState> {
  const sess = state.session;
  if (!sess) return {};
  const todayLog = rollToday(state.todayLog);
  const ratings = [...todayLog.ratings];
  if (sess.rating) ratings.push(sess.rating);
  const nextLog: TodayLog = {
    ...todayLog,
    clips: todayLog.clips + 1,
    ratings,
  };
  let progress: Progress = {
    ...state.progress,
    totalClips: state.progress.totalClips + 1,
  };
  if (nextLog.clips === state.settings.winThreshold) {
    progress = recordWin(progress);
  }
  if (sess.recordingUrl) URL.revokeObjectURL(sess.recordingUrl);
  const nextIdx = sess.clipIdx + 1;
  if (nextIdx >= sess.clipQueue.length) {
    progress = { ...progress, totalSessions: progress.totalSessions + 1 };
    return {
      todayLog: nextLog,
      progress,
      session: {
        ...sess,
        clipIdx: nextIdx,
        stepIdx: 0,
        rating: null,
        graspText: "",
        graspRevealed: false,
        graspCoach: null,
        recallHidden: false,
        recordingUrl: null,
        recordingSecs: 0,
        view: "sessionDone",
      },
    };
  }
  return {
    todayLog: nextLog,
    progress,
    session: {
      ...sess,
      clipIdx: nextIdx,
      stepIdx: 0,
      rating: null,
      graspText: "",
      graspRevealed: false,
      graspCoach: null,
      recallHidden: false,
      recordingUrl: null,
      recordingSecs: 0,
      view: "clipDone",
    },
  };
}

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      lang: "zh",
      theme: "light",
      level: "B1",
      levelLocked: false,
      recentRatings: [],
      progress: defaultProgress(),
      todayLog: defaultToday(),
      settings: defaultSettings(),
      clips: BASELINE_CLIPS,
      dailyDate: null,
      dailySource: "baseline",
      dailyStatus: "idle",
      pipelineStats: null,
      session: null,
      hydrated: false,
      setLang: (lang) => {
        set({ lang });
        if (typeof document !== "undefined") {
          document.documentElement.lang = lang === "zh" ? "zh-Hant" : "en";
        }
      },
      setTheme: (theme) => {
        set({ theme });
        if (typeof document !== "undefined") {
          document.documentElement.classList.toggle("dark", theme === "dark");
        }
      },
      toggleTheme: () => {
        const next = get().theme === "dark" ? "light" : "dark";
        get().setTheme(next);
      },
      setLevel: (level, locked = true) =>
        set({
          level,
          levelLocked: locked,
          settings: { ...get().settings, levelLocked: locked },
        }),
      unlockLevel: () =>
        set({
          levelLocked: false,
          recentRatings: [],
          level: "B1",
          settings: { ...get().settings, levelLocked: false },
        }),
      patchSettings: (partial) =>
        set({ settings: { ...get().settings, ...partial } }),
      setDailyStatus: (dailyStatus) => set({ dailyStatus }),
      setPipelineStats: (pipelineStats) => set({ pipelineStats }),
      setClips: (clips, meta) => {
        if (!clips.length) return;
        const n = clips.length;
        set({
          clips,
          dailyDate: meta.date,
          dailySource: meta.source,
          dailyStatus: meta.source === "github" || meta.source === "ai" ? "ready" : get().dailyStatus,
          settings: {
            ...get().settings,
            clipsPerSession: n,
            winThreshold: winThresholdFor(n),
          },
        });
      },
      startSession: () => {
        const existing = get().session;
        if (existing && existing.view !== "sessionDone") return;
        const { clips, settings, todayLog } = get();
        const log = rollToday(todayLog);
        const pool = clips.length ? clips : BASELINE_CLIPS;
        const startIdx = log.clips % pool.length;
        const n = Math.min(settings.clipsPerSession, pool.length);
        const queue: number[] = [];
        for (let i = 0; i < n; i++) queue.push((startIdx + i) % pool.length);
        set({
          todayLog: log,
          session: {
            clipQueue: queue,
            clipIdx: 0,
            stepIdx: 0,
            rating: null,
            graspText: "",
            graspRevealed: false,
            graspCoach: null,
            recallHidden: false,
            recordingUrl: null,
            recordingSecs: 0,
            startedAt: Date.now(),
            view: "step",
          },
        });
      },
      nextStep: () => {
        const sess = get().session;
        if (!sess || sess.view !== "step") return;
        if (sess.recordingUrl && sess.stepIdx < STEPS.length - 1) {
          URL.revokeObjectURL(sess.recordingUrl);
        }
        const next = sess.stepIdx + 1;
        if (next >= STEPS.length) {
          set(finishCurrentClip(get()) as AppState);
          return;
        }
        set({
          session: {
            ...sess,
            stepIdx: next,
            graspCoach: next === 1 ? sess.graspCoach : null,
            recordingUrl: null,
            recordingSecs: 0,
          },
        });
      },
      setRating: (n) => {
        const sess = get().session;
        if (!sess) return null;
        const prev = sess.rating;
        const ratings = [...get().recentRatings];
        if (prev != null) {
          for (let i = ratings.length - 1; i >= 0; i--) {
            if (ratings[i] === prev) {
              ratings[i] = n;
              break;
            }
          }
        } else {
          ratings.push(n);
        }
        const trimmed = ratings.slice(-10);
        let level = get().level;
        let changed: Cefr | null = null;
        if (!get().levelLocked && trimmed.length) {
          const next = levelFromAverage(average(trimmed), level);
          if (next !== level) {
            changed = next;
            level = next;
          }
        }
        set({
          recentRatings: trimmed,
          level,
          session: { ...sess, rating: n },
        });
        return changed;
      },
      setGraspText: (text) => {
        const sess = get().session;
        if (sess) set({ session: { ...sess, graspText: text } });
      },
      setGraspRevealed: (v) => {
        const sess = get().session;
        if (sess) set({ session: { ...sess, graspRevealed: v } });
      },
      setGraspCoach: (text) => {
        const sess = get().session;
        if (sess) set({ session: { ...sess, graspCoach: text } });
      },
      toggleRecall: () => {
        const sess = get().session;
        if (sess) set({ session: { ...sess, recallHidden: !sess.recallHidden } });
      },
      setRecording: (url, secs) => {
        const sess = get().session;
        if (!sess) return;
        if (sess.recordingUrl && sess.recordingUrl !== url) {
          URL.revokeObjectURL(sess.recordingUrl);
        }
        set({ session: { ...sess, recordingUrl: url, recordingSecs: secs } });
      },
      continueNextClip: () => {
        const sess = get().session;
        if (sess) set({ session: { ...sess, view: "step" } });
      },
      endSession: () => {
        const state = get();
        const log = rollToday(state.todayLog);
        let progress = state.progress;
        if (log.clips >= state.settings.winThreshold) {
          progress = recordWin(progress);
        }
        if (state.session && state.session.view !== "sessionDone") {
          progress = { ...progress, totalSessions: progress.totalSessions + 1 };
        }
        if (state.session?.recordingUrl) {
          URL.revokeObjectURL(state.session.recordingUrl);
        }
        set({ progress, todayLog: log, session: null });
      },
      goHome: () => {
        const sess = get().session;
        if (sess?.recordingUrl) URL.revokeObjectURL(sess.recordingUrl);
        set({ session: null });
      },
      resetProgress: () =>
        set({
          progress: defaultProgress(),
          todayLog: defaultToday(),
          recentRatings: [],
        }),
      applyRemote: (payload) => {
        const patch: Partial<AppState> = {};
        if (payload.progress) patch.progress = payload.progress;
        if (payload.todayLog) patch.todayLog = rollToday(payload.todayLog);
        if (payload.settings) {
          patch.settings = { ...get().settings, ...payload.settings };
        }
        if (payload.level) patch.level = payload.level;
        if (payload.recentRatings) patch.recentRatings = payload.recentRatings;
        set(patch);
      },
      snapshot: () => {
        const s = get();
        return {
          progress: s.progress,
          todayLog: rollToday(s.todayLog),
          settings: s.settings,
          level: s.level,
          recentRatings: s.recentRatings,
        };
      },
    }),
    {
      name: "seven.app.v1",
      partialize: (s) => ({
        lang: s.lang,
        theme: s.theme,
        level: s.level,
        levelLocked: s.levelLocked,
        recentRatings: s.recentRatings,
        progress: s.progress,
        todayLog: s.todayLog,
        settings: s.settings,
        clips: s.clips,
        dailyDate: s.dailyDate,
        dailySource: s.dailySource,
        pipelineStats: s.pipelineStats,
        session: s.session
          ? { ...s.session, recordingUrl: null, recordingSecs: 0 }
          : null,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.todayLog = rollToday(state.todayLog);
        state.hydrated = true;
        if (state.session) {
          const age = Date.now() - (state.session.startedAt || 0);
          if (age > 18 * 3600 * 1000 || state.session.view === "sessionDone") {
            state.session = null;
          } else {
            state.session = {
              ...state.session,
              recordingUrl: null,
              recordingSecs: 0,
            };
          }
        }
        if (typeof document !== "undefined") {
          document.documentElement.classList.toggle(
            "dark",
            state.theme === "dark",
          );
          document.documentElement.lang =
            state.lang === "zh" ? "zh-Hant" : "en";
        }
      },
    },
  ),
);
