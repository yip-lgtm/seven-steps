import { CEFR_LIST, CEFR_RANK, type Cefr } from "./types";

export function levelFromAverage(avg: number, current: Cefr): Cefr {
  const idx = CEFR_RANK[current];
  if (avg >= 4 && idx < 4) return CEFR_LIST[idx + 1];
  if (avg < 2.5 && idx > 0) return CEFR_LIST[idx - 1];
  return current;
}
