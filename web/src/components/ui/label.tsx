import { cn } from "@/lib/utils";

export function FieldLabel({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        "mb-1.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-faint",
        className,
      )}
      {...props}
    />
  );
}
