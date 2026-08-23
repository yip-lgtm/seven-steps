import { useEffect, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Moon, Settings, Sun } from "lucide-react";
import { AuthSlot } from "@/components/auth-slot";
import { t } from "@/lib/i18n";
import { useApp } from "@/lib/store";

export function AppShell({ children }: { children: ReactNode }) {
  const lang = useApp((s) => s.lang);
  const theme = useApp((s) => s.theme);
  const toggleTheme = useApp((s) => s.toggleTheme);
  const setLang = useApp((s) => s.setLang);

  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-Hant" : "en";
  }, [lang]);

  return (
    <div className="mx-auto min-h-screen max-w-[720px] px-4 pb-20 pt-5 sm:px-5 sm:pt-6">
      <header className="mb-6 flex items-center justify-between gap-3 border-b border-line pb-4">
        <Link to="/" className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-primary font-display text-[15px] font-semibold text-on-primary shadow-[0_2px_6px_rgb(14_101_96_/_0.25)]">
            7
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[16px] font-semibold tracking-tight">
              {t(lang, "brand")}
            </span>
            <span className="block text-xs text-faint">{t(lang, "brandSub")}</span>
          </span>
        </Link>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
          <button
            type="button"
            onClick={() => setLang(lang === "zh" ? "en" : "zh")}
            className="h-9 rounded-full border border-line px-2.5 text-xs font-medium text-muted transition-colors hover:text-fg"
            aria-label={t(lang, "uiLang")}
          >
            {lang === "zh" ? "EN" : "中"}
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            className="grid size-9 place-items-center rounded-full border border-line text-muted transition-colors hover:text-fg"
            aria-label="Theme"
          >
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
          <Link
            to="/settings"
            className="grid size-9 place-items-center rounded-full border border-line text-muted transition-colors hover:text-fg"
            aria-label={t(lang, "settings")}
          >
            <Settings className="size-4" />
          </Link>
          <AuthSlot />
        </div>
      </header>
      {children}
    </div>
  );
}
