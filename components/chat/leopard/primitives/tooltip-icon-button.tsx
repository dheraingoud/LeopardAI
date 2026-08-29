"use client";

import { forwardRef, type ComponentPropsWithRef } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type TooltipIconButtonProps = ComponentPropsWithRef<"button"> & {
  tooltip: string;
  side?: "top" | "bottom" | "left" | "right";
};

// Icon button that shows a tooltip on hover/focus. Renders a native button so
// existing icon-button styling (chat-shell header) can be passed via className.
export const TooltipIconButton = forwardRef<HTMLButtonElement, TooltipIconButtonProps>(
  ({ children, tooltip, side = "bottom", className, type, ...rest }, ref) => {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type={type ?? "button"}
                ref={ref}
                aria-label={rest["aria-label"] ?? tooltip}
                className={cn(
                  "flex items-center justify-center rounded-lg text-[#737373] transition-colors hover:bg-[#ffb400]/[0.06] hover:text-[#ffb400]",
                  className,
                )}
                {...rest}
              />
            }
          >
            {children}
            <span className="sr-only">{tooltip}</span>
          </TooltipTrigger>
          <TooltipContent side={side}>{tooltip}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  },
);

TooltipIconButton.displayName = "TooltipIconButton";
