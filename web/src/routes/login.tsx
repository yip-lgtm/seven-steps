import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";
import { t } from "@/lib/i18n";
import { useApp } from "@/lib/store";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const lang = useApp((s) => s.lang);
  return (
    <AppShell>
      <Card className="mx-auto max-w-sm">
        <h1 className="font-display text-xl font-semibold">{t(lang, "login")}</h1>
        <p className="mt-2 mb-5 text-sm text-muted">{t(lang, "signInLead")}</p>
        {authEnabled ? (
          <div className="space-y-2.5">
            {GROK_PROVIDERS.map((p) => (
              <Button
                key={p.providerId}
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => void signIn(p.providerId, { callbackURL: "/" })}
              >
                {p.providerId === "google"
                  ? t(lang, "continueGoogle")
                  : t(lang, "continueX")}
              </Button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">{t(lang, "signInDisabled")}</p>
        )}
        <Link
          to="/"
          className="mt-6 inline-block text-sm text-muted underline-offset-4 hover:underline"
        >
          {t(lang, "back")}
        </Link>
      </Card>
    </AppShell>
  );
}
