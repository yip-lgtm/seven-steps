import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { t } from "@/lib/i18n";
import { listEnglishVoices, playClipText, stopPlayback } from "@/lib/player";
import { runLivePipeline } from "@/lib/run-pipeline";
import { saveLearner } from "@/lib/server/progress";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useApp } from "@/lib/store";
import type { Cefr } from "@/lib/types";
import { average } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({ component: SettingsPage });

function SettingsPage() {
  const navigate = useNavigate();
  const lang = useApp((s) => s.lang);
  const level = useApp((s) => s.level);
  const ratings = useApp((s) => s.recentRatings);
  const settings = useApp((s) => s.settings);
  const dailyDate = useApp((s) => s.dailyDate);
  const dailySource = useApp((s) => s.dailySource);
  const { user } = useCurrentUserState();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    const load = () => setVoices(listEnglishVoices());
    load();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      speechSynthesis.onvoiceschanged = load;
    }
  }, []);

  const persist = () => {
    if (user) void saveLearner({ data: useApp.getState().snapshot() }).catch(() => {});
  };

  const avg = ratings.length ? average(ratings).toFixed(1) : null;

  return (
    <AppShell>
      <Card>
        <h1 className="font-display text-[22px] font-semibold">
          {t(lang, "settingsTitle")}
        </h1>
        <p className="mb-5 mt-1 text-sm text-muted">{t(lang, "settingsLead")}</p>
        {(dailySource === "github" || dailySource === "ai") && dailyDate ? (
          <div className="mb-4 rounded-full bg-primary-soft px-3 py-1.5 text-xs font-semibold text-primary">
            {t(lang, "dailyNote", { date: dailyDate })}
          </div>
        ) : null}

        <Row
          label={t(lang, "uiLang")}
          sub={t(lang, "uiLangSub")}
          control={
            <select
              className={selectClass}
              value={lang}
              onChange={(e) =>
                useApp.getState().setLang(e.target.value === "en" ? "en" : "zh")
              }
            >
              <option value="zh">繁體中文</option>
              <option value="en">English</option>
            </select>
          }
        />

        <Row
          label={t(lang, "englishLevel")}
          sub={
            avg
              ? t(lang, "lastAvg", { n: ratings.length, avg, level })
              : t(lang, "noRatings", { level })
          }
          control={
            <select
              className={selectClass}
              value={useApp.getState().levelLocked ? level : "AUTO"}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "AUTO") useApp.getState().unlockLevel();
                else useApp.getState().setLevel(v as Cefr, true);
                persist();
              }}
            >
              <option value="AUTO">{t(lang, "auto", { level })}</option>
              <option value="A2">{t(lang, "a2")}</option>
              <option value="B1">{t(lang, "b1")}</option>
              <option value="B2">{t(lang, "b2")}</option>
              <option value="C1">{t(lang, "c1")}</option>
              <option value="C2">{t(lang, "c2")}</option>
            </select>
          }
        />

        <Row
          label={t(lang, "naturalVoice")}
          sub={t(lang, "naturalVoiceSub")}
          control={
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.preferNaturalVoice}
                onChange={(e) => {
                  useApp.getState().patchSettings({
                    preferNaturalVoice: e.target.checked,
                  });
                  persist();
                }}
                className="size-4 accent-primary"
              />
            </label>
          }
        />

        <Row
          label={t(lang, "voice")}
          sub={t(lang, "voiceSub")}
          control={
            <select
              className={selectClass}
              value={settings.voice}
              onChange={(e) => {
                useApp.getState().patchSettings({ voice: e.target.value });
                persist();
              }}
            >
              <option value="">{t(lang, "systemDefault")}</option>
              {voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          }
        />

        <Row
          label={t(lang, "speed")}
          sub={t(lang, "speedSub")}
          control={
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0.5}
                max={1.2}
                step={0.05}
                value={settings.rate}
                onChange={(e) => {
                  useApp
                    .getState()
                    .patchSettings({ rate: parseFloat(e.target.value) });
                  persist();
                }}
                className="w-[140px] accent-primary"
              />
              <span className="min-w-[42px] text-right text-sm tabular-nums text-muted">
                {settings.rate.toFixed(2)}x
              </span>
            </div>
          }
        />

        <Row
          label={t(lang, "clipsPer")}
          sub={t(lang, "clipsPerSub")}
          control={
            <select
              className={selectClass}
              value={settings.clipsPerSession}
              onChange={(e) => {
                useApp
                  .getState()
                  .patchSettings({ clipsPerSession: parseInt(e.target.value, 10) });
                persist();
              }}
            >
              {[5, 7, 10, 14].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          }
        />

        <Row
          label={t(lang, "winTh")}
          sub={t(lang, "winThSub")}
          control={
            <select
              className={selectClass}
              value={settings.winThreshold}
              onChange={(e) => {
                useApp
                  .getState()
                  .patchSettings({ winThreshold: parseInt(e.target.value, 10) });
                persist();
              }}
            >
              {[3, 5, 7, 10].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          }
        />

        <Row
          label={t(lang, "testVoice")}
          sub={t(lang, "testVoiceSub")}
          control={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                stopPlayback();
                void playClipText(t(lang, "sampleSentence"), {
                  preferNatural: settings.preferNaturalVoice,
                  rate: settings.rate,
                  pitch: settings.pitch,
                  voice: settings.voice,
                });
              }}
            >
              {t(lang, "playSample")}
            </Button>
          }
        />

        <Row
          label={t(lang, "reminder")}
          sub={t(lang, "reminderSub")}
          control={
            <a
              href="/practice-reminder.ics"
              download="seven-steps-practice.ics"
              className="inline-flex h-9 items-center justify-center rounded-full border border-line bg-surface px-3.5 text-sm font-medium text-fg hover:bg-bg"
            >
              {t(lang, "addReminder")}
            </a>
          }
        />

        <Row
          label={t(lang, "newSet")}
          sub={t(lang, "newSetSub")}
          control={
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const id = toast.loading(t(lang, "genWait"));
                try {
                  const ok = await runLivePipeline();
                  toast.dismiss(id);
                  if (ok) toast.success(t(lang, "generated"));
                  else toast.error(t(lang, "genFail"));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? t(lang, "generating") : t(lang, "newSet")}
            </Button>
          }
        />

        <div className="mt-8">
          <Button variant="danger" onClick={() => setConfirmReset(true)}>
            {t(lang, "reset")}
          </Button>
        </div>

        <div className="mt-8">
          <Button onClick={() => void navigate({ to: "/" })}>
            {t(lang, "back")}
          </Button>
        </div>
      </Card>
      <ConfirmDialog
        open={confirmReset}
        title={t(lang, "reset")}
        body={t(lang, "resetConfirm")}
        confirmLabel={t(lang, "reset")}
        cancelLabel={t(lang, "cancel")}
        danger
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          useApp.getState().resetProgress();
          persist();
          setConfirmReset(false);
          toast.success(t(lang, "resetDone"));
        }}
      />
    </AppShell>
  );
}

const selectClass =
  "rounded-sm border border-line bg-surface px-3 py-2 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

function Row({
  label,
  sub,
  control,
}: {
  label: string;
  sub: string;
  control: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-line py-3.5 first:border-t-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex-1">
        <div className="font-medium">{label}</div>
        <div className="mt-0.5 text-xs text-faint">{sub}</div>
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}
