export type Cefr = "A2" | "B1" | "B2" | "C1" | "C2";

export type Lang = "zh" | "en";

export type StepId =
  | "rate"
  | "grasp"
  | "hum"
  | "shadow"
  | "read"
  | "recall"
  | "freestyle";

export type Clip = {
  id: string;
  category?: string;
  topic: string;
  topic_zh?: string;
  topic_en?: string;
  text: string;
  text_zh?: string;
  text_en_a2?: string;
  text_en_b1?: string;
  text_en_b2?: string;
  text_en_c1?: string;
  text_en_c2?: string;
  source_url?: string;
  source_hint?: string;
  audio?: string | null;
};

export type DailySource = "github" | "ai" | "pool" | "baseline";

export type DailyPack = {
  date: string | null;
  source: DailySource;
  clips: Clip[];
};

export type PipelineStats = {
  fourchan: number;
  hn: number;
  headlines: number;
  transcripts: number;
  generatedAt: string | null;
};

export type Progress = {
  streak: number;
  lastWinDate: string | null;
  totalClips: number;
  totalWins: number;
  totalSessions: number;
};

export type TodayLog = {
  date: string;
  clips: number;
  ratings: number[];
};

export type Settings = {
  voice: string;
  rate: number;
  pitch: number;
  clipsPerSession: number;
  winThreshold: number;
  preferNaturalVoice: boolean;
  levelLocked: boolean;
};

export const CEFR_RANK: Record<Cefr, number> = {
  A2: 0,
  B1: 1,
  B2: 2,
  C1: 3,
  C2: 4,
};

export const CEFR_LIST: Cefr[] = ["A2", "B1", "B2", "C1", "C2"];

export const STORAGE_KEYS = {
  progress: "seven.progress.v1",
  settings: "seven.settings.v1",
  todayLog: "seven.todayLog.v1",
  level: "seven.level",
  ratings: "seven.ratings",
  theme: "seven.theme",
  lang: "seven.lang",
} as const;
