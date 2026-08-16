"use client";

import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassButton } from "@/components/ui/glass-button";
import {
  GlassPopover,
  GlassPopoverContent,
  GlassPopoverTrigger,
} from "@/components/ui/glass-popover";

type Props = {
  modelVision: boolean;
  /** Φ9: image-edit model (e.g. qwen-image-edit) accepts an image as edit input
   *  but isn't a VLM. Loosens the media attach Item so the user can attach a
   *  single image; the input itself restricts accept to image/* in that case. */
  modelImageEdit?: boolean;
  onPickMedia: (files: FileList) => void;
  onPickFile: (files: FileList) => void;
  onPickSkill: (files: FileList) => void;
};

/**
 * PlusMenu — the "+" affordance on the input bar. Vision-gates image/video
 * attach to the active model (capability read by the parent via /api/models);
 * file + skill attaches are always available; "mcp servers" is an honest stub.
 *
 * Liquid-glass: trigger is a GlassButton icon (neutral frost), menu is a
 * GlassPopover (base-ui Menu owns open/close + Esc + click-out + portal, so no
 * custom document listeners). Amber is reserved for active-reasoning / send /
 * user-bubble / greeting — this chrome menu stays clear frost (selective tint).
 * Hidden file inputs reset after each pick so the same file can be re-added.
 */
export function PlusMenu({
  modelVision,
  modelImageEdit,
  onPickMedia,
  onPickFile,
  onPickSkill,
}: Props) {
  const [open, setOpen] = useState(false);
  const mediaRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const skillRef = useRef<HTMLInputElement>(null);

  // Φ9: effective media attach capability + the right <input accept>.
  const canAttachMedia = modelVision || !!modelImageEdit;
  const mediaAccept = modelImageEdit && !modelVision ? "image/*" : "image/*,video/*";
  const mediaHint = modelVision
    ? undefined
    : modelImageEdit
      ? "image only"
      : "needs VLM";
return (
    <div className="relative shrink-0">
      <GlassPopover open={open} onOpenChange={setOpen}>
        <GlassPopoverTrigger
          render={
            <GlassButton
              variant="icon"
              size={36}
              tint={0.12}
              title="Add attachment"
              className="max-sm:h-11! max-sm:w-11! dark:text-[#a3a3a3] light:text-[#525252]"
            >
              <Plus className="h-4 w-4" />
            </GlassButton>
          }
        />
        <GlassPopoverContent side="top" align="start" sideOffset={8} tint={0.62}>
          <div className="w-[224px] p-1 text-[12px] font-mono">
            <Item
              label="attach image / video"
              disabled={!canAttachMedia}
              hint={mediaHint}
              onClick={() => {
                setOpen(false);
                mediaRef.current?.click();
              }}
            />
            <Item
              label="attach file"
              onClick={() => {
                setOpen(false);
                fileRef.current?.click();
              }}
            />
            <Item
              label="add skill"
              onClick={() => {
                setOpen(false);
                skillRef.current?.click();
              }}
            />
            <Item label="mcp servers" hint="soon" onClick={() => setOpen(false)} />
          </div>
        </GlassPopoverContent>
      </GlassPopover>
      <input
        ref={mediaRef}
        type="file"
        accept={mediaAccept}
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) onPickMedia(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={fileRef}
        type="file"
        hidden
        onChange={(e) => {
          if (e.target.files) onPickFile(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={skillRef}
        type="file"
        accept=".md,.json,.txt,.yaml,.yml"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) onPickSkill(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function Item({
  label,
  onClick,
  disabled,
  hint,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg transition-colors text-left lowercase",
        disabled
          ? "dark:text-[#404040] light:text-[#b8b8b8] cursor-not-allowed"
          : "dark:text-[#a3a3a3] light:text-[#525252] dark:hover:bg-white/[0.05] light:hover:bg-black/[0.04] dark:hover:text-white light:hover:text-black",
      )}
    >
      <span>{label}</span>
      {hint && (
        <span className="text-[9px] uppercase tracking-tighter dark:text-[#505050] light:text-[#b8b8b8]">
          {hint}
        </span>
      )}
    </button>
  );
}
