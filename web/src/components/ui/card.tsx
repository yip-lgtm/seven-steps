import { cn } from "@/lib/utils";

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-line bg-surface p-7 shadow-[var(--shadow)]",
        className,
      )}
      {...props}
    />
  );
}
