import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(({ className, type, ...props }, ref) => (
  <input type={type} className={cn("flex h-10 w-full rounded-md border bg-white px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:opacity-50", className)} ref={ref} {...props} />
));
Input.displayName = "Input";

