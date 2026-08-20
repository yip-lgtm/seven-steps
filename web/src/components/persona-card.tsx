import { t } from "@/lib/i18n";
import { useApp } from "@/lib/store";

export function PersonaCard() {
  const lang = useApp((s) => s.lang);
  return (
    <div className="mt-4 rounded-md bg-bg px-4 py-3">
      <div className="text-micro uppercase tracking-[0.06em] text-faint">
        {t(lang, "personaLine")}
      </div>
      <p className="mt-1 text-caption leading-relaxed text-muted">
        {t(lang, "personaSub")}
      </p>
    </div>
  );
}
