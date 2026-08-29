"use client";

import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion";
import { ChevronDownIcon } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const accordionVariants = cva("group/accordion flex w-full flex-col", {
  variants: {
    variant: {
      default: "",
      outline: "rounded-lg border dark:border-white/[0.08] light:border-black/[0.08]",
      ghost: "gap-2",
    },
  },
  defaultVariants: { variant: "default" },
});

function Accordion({
  className,
  variant,
  ...props
}: AccordionPrimitive.Root.Props & VariantProps<typeof accordionVariants>) {
  return (
    <AccordionPrimitive.Root
      data-slot="accordion"
      data-variant={variant ?? "default"}
      className={cn(accordionVariants({ variant }), className)}
      {...props}
    />
  );
}

function AccordionItem({ className, ...props }: AccordionPrimitive.Item.Props) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn(
        "group/accordion-item",
        "group-data-[variant=default]/accordion:border-b group-data-[variant=default]/accordion:last:border-b-0 dark:group-data-[variant=default]/accordion:border-white/[0.06] light:group-data-[variant=default]/accordion:border-black/[0.06]",
        "group-data-[variant=outline]/accordion:border-b group-data-[variant=outline]/accordion:last:border-b-0 dark:group-data-[variant=outline]/accordion:border-white/[0.06] light:group-data-[variant=outline]/accordion:border-black/[0.06]",
        "group-data-[variant=ghost]/accordion:data-open:bg-black/[0.03] dark:group-data-[variant=ghost]/accordion:data-open:bg-white/[0.04] group-data-[variant=ghost]/accordion:rounded-lg",
        className,
      )}
      {...props}
    />
  );
}

function AccordionTrigger({ className, children, ...props }: AccordionPrimitive.Trigger.Props) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "group/accordion-trigger flex w-full flex-1 items-center justify-between gap-4 text-start text-sm font-medium transition-all outline-none disabled:pointer-events-none disabled:opacity-50",
          "group-data-[variant=default]/accordion:py-4 group-data-[variant=default]/accordion:hover:underline",
          "group-data-[variant=outline]/accordion:px-4 group-data-[variant=outline]/accordion:py-3 group-data-[variant=outline]/accordion:hover:bg-black/[0.03] dark:group-data-[variant=outline]/accordion:hover:bg-white/[0.04]",
          "group-data-[variant=ghost]/accordion:rounded-lg group-data-[variant=ghost]/accordion:px-4 group-data-[variant=ghost]/accordion:py-2 group-data-[variant=ghost]/accordion:hover:bg-black/[0.03] dark:group-data-[variant=ghost]/accordion:hover:bg-white/[0.04]",
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDownIcon className="pointer-events-none size-4 shrink-0 text-foreground/40 transition-transform duration-200 ease-out group-data-panel-open/accordion-trigger:rotate-180" />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

function AccordionContent({ className, children, ...props }: AccordionPrimitive.Panel.Props) {
  return (
    <AccordionPrimitive.Panel
      data-slot="accordion-content"
      className="overflow-hidden text-sm data-closed:animate-accordion-up data-open:animate-accordion-down"
      {...props}
    >
      <div
        className={cn(
          "group-data-[variant=default]/accordion:pb-4",
          "group-data-[variant=outline]/accordion:border-t group-data-[variant=outline]/accordion:px-4 group-data-[variant=outline]/accordion:py-3 dark:group-data-[variant=outline]/accordion:border-white/[0.06] light:group-data-[variant=outline]/accordion:border-black/[0.06]",
          "group-data-[variant=ghost]/accordion:px-4 group-data-[variant=ghost]/accordion:py-3",
          className,
        )}
      >
        {children}
      </div>
    </AccordionPrimitive.Panel>
  );
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent, accordionVariants };
