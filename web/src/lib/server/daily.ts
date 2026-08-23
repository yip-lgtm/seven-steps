import { createServerFn } from "@tanstack/react-start";
import { BASELINE_CLIPS } from "@/data/baseline";
import { normalizeClip } from "@/lib/clips";
import { getLivePack } from "@/lib/server/live-pack";
import type { Clip, DailyPack } from "@/lib/types";
import { todayIso } from "@/lib/utils";

const GITHUB = "https://yip-lgtm.github.io/seven-steps/clips";

function packFromUnknown(
  data: unknown,
  source: DailyPack["source"],
): DailyPack | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  const rawClips = Array.isArray(obj.clips) ? obj.clips : null;
  if (!rawClips?.length) return null;
  const clips: Clip[] = rawClips.map((c, i) =>
    normalizeClip((c ?? {}) as Record<string, unknown>, i),
  );
  const date = typeof obj.date === "string" ? obj.date : null;
  return { date, source, clips };
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export const fetchDailyClips = createServerFn({ method: "GET" }).handler(
  async (): Promise<DailyPack> => {
    const live = getLivePack();
    if (live?.clips.length && live.date === todayIso()) return live;

    const today = await fetchJson(`${GITHUB}/today.json`);
    const todayPack = packFromUnknown(today, "github");
    if (todayPack) return todayPack;

    const pool = await fetchJson(`${GITHUB}/pool.json`);
    const poolPack = packFromUnknown(pool, "pool");
    if (poolPack) return poolPack;

    return { date: null, source: "baseline", clips: BASELINE_CLIPS };
  },
);
