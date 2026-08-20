import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function StarRating({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex gap-2.5" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => {
        const on = (value ?? 0) >= n;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            onClick={() => onChange(n)}
            className="grid size-11 place-items-center"
          >
            <Star
              className={cn(
                "size-9 transition-transform duration-100",
                on ? "fill-warm text-warm" : "text-line",
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
