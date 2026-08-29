"use client";

import type { ComponentProps } from "react";
import { useMutation } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { api } from "@/convex/_generated/api";
import { field, mono, paper } from "./surfaces";
import { clamp } from "./range";
import { useSettingsStore } from "@/hooks/use-settings-store";
import { getActiveModels, getDefaultChatModel } from "@/lib/ai/models";

export interface SettingToggle {
  key: string;
  label: string;
  detail: string;
  on: boolean;
}

export function SettingsPanel({
  model,
  models,
  systemPrompt,
  temperature,
  toggles,
  onModelChange,
  onSystemPromptChange,
  onTemperatureChange,
  onToggle,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  | "children"
  | "model"
  | "models"
  | "systemPrompt"
  | "temperature"
  | "toggles"
  | "onModelChange"
  | "onSystemPromptChange"
  | "onTemperatureChange"
  | "onToggle"
> & {
  model?: string;
  models?: readonly string[];
  systemPrompt?: string;
  temperature?: number;
  toggles?: readonly SettingToggle[];
  onModelChange?: (model: string) => void;
  onSystemPromptChange?: (prompt: string) => void;
  onTemperatureChange?: (temperature: number) => void;
  onToggle?: (key: string) => void;
}) {
  return (
    <div
      data-slot="settings-panel"
      className={cn(
        paper,
        "flex w-full max-w-sm flex-col gap-4 rounded-[20px] p-4",
        className,
      )}
      {...props}
    >
      {models && models.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className={cn(mono, "dark:text-[#525252] light:text-[#a3a3a3]")}>
            model
          </span>
          <div className={cn(field, "flex gap-0.5 rounded-full p-0.5")}>
            {models.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={option === model}
                onClick={() => onModelChange?.(option)}
                className={cn(
                  "flex-1 rounded-full py-1 text-xs font-medium transition-[background-color,color,scale] duration-150 active:scale-[0.97]",
                  option === model
                    ? "bg-[#ffb400] light:bg-[#d49600] text-black"
                    : "dark:text-[#737373] light:text-[#8c8c8c] dark:hover:text-[#d4d4d4] light:hover:text-[#404040]",
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      )}

      {systemPrompt !== undefined && (
        <div className="flex flex-col gap-1.5">
          <span className={cn(mono, "dark:text-[#525252] light:text-[#a3a3a3]")}>
            system prompt
          </span>
          <textarea
            value={systemPrompt}
            onChange={(event) => onSystemPromptChange?.(event.target.value)}
            rows={3}
            aria-label="System prompt"
            className={cn(
              field,
              "dark:text-[#d4d4d4] light:text-[#404040] focus-visible:ring-[#ffb400]/40 resize-none rounded-xl px-3 py-2 text-xs leading-relaxed outline-none focus-visible:ring-1",
            )}
          />
        </div>
      )}

      {temperature !== undefined && (
        <div className="flex flex-col gap-1.5">
          <span className="flex items-baseline justify-between">
            <span className={cn(mono, "dark:text-[#525252] light:text-[#a3a3a3]")}>
              temperature
            </span>
            <span className={cn(mono, "dark:text-[#a3a3a3] light:text-[#525252] tabular-nums")}>
              {clamp(temperature, 0, 2).toFixed(1)}
            </span>
          </span>
          <input
            type="range"
            min={0}
            max={2}
            step={0.1}
            value={clamp(temperature, 0, 2)}
            aria-label="Temperature"
            onChange={(event) =>
              onTemperatureChange?.(Number(event.target.value))
            }
            className="h-1 w-full cursor-pointer accent-[#ffb400] light:accent-[#d49600]"
          />
        </div>
      )}

      {toggles && toggles.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {toggles.map((toggle) => (
            <div key={toggle.key} className="flex items-center gap-3">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[13px] dark:text-[#d4d4d4] light:text-[#404040]">
                  {toggle.label}
                </span>
                <span className="truncate text-xs dark:text-[#525252] light:text-[#a3a3a3]">
                  {toggle.detail}
                </span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={toggle.on}
                aria-label={toggle.label}
                onClick={() => onToggle?.(toggle.key)}
                className={cn(
                  "flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200",
                  toggle.on
                    ? "bg-[#ffb400] light:bg-[#d49600]"
                    : "dark:bg-white/[0.12] light:bg-black/[0.12]",
                )}
              >
                <span
                  className={cn(
                    "size-4 rounded-full bg-black transition-transform duration-200 motion-reduce:transition-none",
                    !toggle.on && "dark:bg-[#d4d4d4] light:bg-white",
                    toggle.on && "translate-x-4",
                  )}
                />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Wired to the real stores: sendWithEnter from the persisted prefs store,
// default model from the live NIM registry + Convex user settings.
export function PreferencesPanel({ className }: { className?: string }) {
  const { user } = useUser();
  const updateSettings = useMutation(api.users.updateSettings);
  const sendWithEnter = useSettingsStore((s) => s.sendWithEnter);
  const setSendWithEnter = useSettingsStore((s) => s.setSendWithEnter);
  const models = getActiveModels().filter(
    (m) => m.kind !== "image" && m.kind !== "video",
  );
  const modelNames = models.map((m) => m.name);
  const defaultName =
    models.find((m) => m.id === getDefaultChatModel().id)?.name ??
    modelNames[0];

  return (
    <SettingsPanel
      className={className}
      model={defaultName}
      models={modelNames}
      toggles={[
        {
          key: "sendWithEnter",
          label: "Send with Enter",
          detail: "Enter sends, Shift+Enter inserts a newline",
          on: sendWithEnter,
        },
      ]}
      onModelChange={(name) => {
        const target = models.find((m) => m.name === name);
        if (!user || !target) return;
        void updateSettings({ clerkId: user.id, defaultModel: target.id })
          .then(() => toast.success("Default model updated"))
          .catch(() => toast.error("Failed to update model"));
      }}
      onToggle={(key) => {
        if (key === "sendWithEnter") setSendWithEnter(!sendWithEnter);
      }}
    />
  );
}
