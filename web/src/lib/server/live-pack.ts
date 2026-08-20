import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DailyPack } from "@/lib/types";
import { todayIso } from "@/lib/utils";

const FILE = join(process.cwd(), "src/data/live-pack.json");

let memory: DailyPack | null = null;

export function setLivePack(pack: DailyPack): void {
  memory = pack;
  try {
    writeFileSync(FILE, JSON.stringify(pack, null, 2), "utf8");
  } catch {
    /* preview-only; Vercel fs may be read-only */
  }
}

export function getLivePack(): DailyPack | null {
  if (memory?.clips.length && memory.date === todayIso()) return memory;
  try {
    const raw = readFileSync(FILE, "utf8");
    const parsed = JSON.parse(raw) as DailyPack;
    if (parsed?.clips?.length && parsed.date === todayIso()) {
      memory = parsed;
      return parsed;
    }
  } catch {
    /* no pack yet */
  }
  return memory?.clips.length ? memory : null;
}
