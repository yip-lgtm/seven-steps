import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import type { Cefr, Progress, Settings, TodayLog } from "@/lib/types";

export type LearnerPayload = {
  progress: Progress;
  settings: Settings;
  todayLog: TodayLog;
  level: Cefr;
  recentRatings: number[];
};

function parseJson<T>(v: unknown, fallback: T): T {
  if (v && typeof v === "object") return v as T;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

export const loadLearner = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql.query<{
      progress: unknown;
      settings: unknown;
      today_log: unknown;
      level: string;
      ratings: unknown;
    }>(
      `select progress, settings, today_log, level, ratings
       from learner_state where user_id = $1`,
      [context.userId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      progress: parseJson<Progress>(row.progress, {
        streak: 0,
        lastWinDate: null,
        totalClips: 0,
        totalWins: 0,
        totalSessions: 0,
      }),
      settings: parseJson<Settings>(row.settings, {
        voice: "",
        rate: 0.85,
        pitch: 1,
        clipsPerSession: 7,
        winThreshold: 5,
        preferNaturalVoice: true,
        levelLocked: false,
      }),
      todayLog: parseJson<TodayLog>(row.today_log, {
        date: "",
        clips: 0,
        ratings: [],
      }),
      level: (row.level as Cefr) || "B1",
      recentRatings: parseJson<number[]>(row.ratings, []),
    } satisfies LearnerPayload;
  });

export const saveLearner = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: LearnerPayload) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql.query(
      `insert into learner_state (user_id, progress, settings, today_log, level, ratings, updated_at)
       values ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5, $6::jsonb, now())
       on conflict (user_id) do update set
         progress = excluded.progress,
         settings = excluded.settings,
         today_log = excluded.today_log,
         level = excluded.level,
         ratings = excluded.ratings,
         updated_at = now()`,
      [
        context.userId,
        JSON.stringify(data.progress),
        JSON.stringify(data.settings),
        JSON.stringify(data.todayLog),
        data.level,
        JSON.stringify(data.recentRatings),
      ],
    );
    return { ok: true as const };
  });
