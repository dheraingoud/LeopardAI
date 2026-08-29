import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center gap-1 rounded-md font-medium transition-colors [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        outline: "border dark:border-white/[0.1] light:border-black/[0.12] dark:text-[#8a8a8a] light:text-[#737373] bg-transparent",
        secondary: "dark:bg-white/[0.08] light:bg-black/[0.06] dark:text-[#d4d4d4] light:text-[#333]",
        muted: "dark:bg-white/[0.05] light:bg-black/[0.04] dark:text-[#737373] light:text-[#8a8a8a]",
        ghost: "dark:text-[#737373] light:text-[#8a8a8a] bg-transparent",
        info: "bg-blue-500/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300",
        warning: "bg-[#ffb400]/10 text-[#d49600] dark:bg-[#ffb400]/15 dark:text-[#ffb400]",
        success: "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
        destructive: "bg-red-500/10 text-red-600 dark:bg-red-500/15 dark:text-red-300",
      },
      size: {
        sm: "px-1.5 py-0.5 text-[10px]",
        default: "px-2 py-1 text-xs",
        lg: "px-2.5 py-1.5 text-sm",
      },
    },
    defaultVariants: { variant: "outline", size: "default" },
  },
);

export type BadgeProps = ComponentProps<"span"> & VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      data-variant={variant ?? "outline"}
      data-size={size ?? "default"}
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { badgeVariants };
