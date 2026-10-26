import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 w-full min-w-0 rounded-lg px-2.5 py-1.5 text-[13px] leading-relaxed transition-colors outline-none focus-visible:ring-1 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:ring-1",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
