import { Link } from "@tanstack/react-router";
import { authEnabled, signOut } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { t } from "@/lib/i18n";
import { useApp } from "@/lib/store";

export function AuthSlot() {
  const { user, isPending } = useCurrentUserState();
  const lang = useApp((s) => s.lang);
  if (isPending) {
    return <div className="size-9 animate-pulse rounded-full bg-line" />;
  }
  if (user) {
    const label = user.displayName ?? user.primaryEmail ?? t(lang, "guest");
    return (
      <div className="flex items-center gap-2">
        {user.profileImageUrl ? (
          <img
            src={user.profileImageUrl}
            alt=""
            className="size-8 rounded-full object-cover"
          />
        ) : (
          <span className="grid size-8 place-items-center rounded-full bg-primary-soft text-sm font-medium text-primary">
            {label.charAt(0).toUpperCase()}
          </span>
        )}
        {authEnabled ? (
          <button
            type="button"
            onClick={() => void signOut()}
            className="hidden text-sm text-muted underline-offset-4 hover:underline sm:inline"
          >
            {t(lang, "signOut")}
          </button>
        ) : null}
      </div>
    );
  }
  return (
    <Link
      to="/login"
      className="grid h-9 place-items-center rounded-full border border-line px-3 text-xs font-medium text-muted transition-colors hover:text-fg"
    >
      {t(lang, "login")}
    </Link>
  );
}
