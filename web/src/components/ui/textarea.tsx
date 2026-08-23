import * as React from "react";
import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "min-h-28 w-full resize-y rounded-md border border-line bg-surface px-3.5 py-3 text-[15px] leading-relaxed text-fg placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
