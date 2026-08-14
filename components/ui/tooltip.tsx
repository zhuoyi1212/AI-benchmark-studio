"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;
export function TooltipContent({ children, ...props }: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content sideOffset={6} className="z-50 rounded-md bg-slate-900 px-2.5 py-1.5 text-xs text-white shadow-md" {...props}>
        {children}<TooltipPrimitive.Arrow className="fill-slate-900" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

