import { LoaderCircle, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

export function PlayButton({
  playing,
  loading,
  onClick,
  label,
}: {
  playing: boolean;
  loading?: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-busy={loading || undefined}
      className={cn(
        "grid size-24 place-items-center rounded-full bg-primary text-on-primary shadow-[0_4px_14px_rgb(14_101_96_/_0.32)] transition-[transform,background-color] duration-150 ease-out hover:bg-primary-deep hover:scale-105",
        playing && "play-live",
      )}
    >
      {loading ? (
        <LoaderCircle className="size-9 spin-slow" />
      ) : playing ? (
        <Pause className="size-9 fill-current" />
      ) : (
        <Play className="size-9 fill-current translate-x-0.5" />
      )}
    </button>
  );
}
