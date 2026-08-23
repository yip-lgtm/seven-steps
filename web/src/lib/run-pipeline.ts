import { generateClips } from "@/lib/server/generate";
import { useApp } from "@/lib/store";

export async function runLivePipeline(): Promise<boolean> {
  const res = await generateClips();
  if (!res.ok || !res.clips.length) return false;
  useApp.getState().setClips(res.clips, { date: res.date, source: "ai" });
  useApp.getState().setPipelineStats(res.stats);
  return true;
}
