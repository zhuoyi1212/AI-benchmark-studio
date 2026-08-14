import * as React from "react";
import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(({ className, ...props }, ref) => (
  <textarea className={cn("flex min-h-[100px] w-full resize-y rounded-md border bg-white px-3 py-2.5 text-sm leading-6 outline-none placeholder:text-muted-foreground focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:opacity-50", className)} ref={ref} {...props} />
));
Textarea.displayName = "Textarea";

