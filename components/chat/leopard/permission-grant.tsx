"use client";

import type { ComponentProps } from "react";
import { CheckIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { field, mono } from "./surfaces";

// Post-decision flash: a compact granted/denied chip shown in the composer
// zone right after the user answers an approval. Fades in; the parent
// unmounts it (or it disappears with the dock) once the run resumes.
export function PermissionGrant({
  toolName,
  granted,
  className,
  ...props
}: Omit<ComponentProps<"div">, "children"> & {
  toolName: string;
  granted: boolean;
}) {
  return (
    <div
      data-slot="permission-grant"
      className={cn(
        "fade-in animate-in flex w-full items-center justify-center duration-300",
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          field,
          mono,
          "flex items-center gap-2 rounded-full px-3 py-1.5",
          granted
            ? "dark:text-[#ffb400] light:text-[#d49600]"
            : "text-red-400 light:text-red-600",
        )}
      >
        {granted ? <CheckIcon className="size-3.5" /> : <XIcon className="size-3.5" />}
        {granted ? `granted · ${toolName}` : `denied · ${toolName}`}
      </span>
    </div>
  );
}
