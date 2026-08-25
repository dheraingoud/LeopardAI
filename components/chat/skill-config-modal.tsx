"use client";

import { useEffect, useRef, useState } from "react";
import { X, Plus, Trash2, Sparkles, Upload } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { nextSkillId, type SkillConfig } from "@/lib/skill-config";
import {
  subscribeSkills,
  getSkillsSnapshot,
  setLocalSkills,
  togglePermanentSkill,
  updateSkillBody,
  resetSkillOverride,
} from "@/lib/skill-store";
import { useSyncExternalStore } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
};

/**
 * SkillConfigModal — the "+ → add skill" overlay. Same liquid-glass shell as
 * the MCP modal: list owned skills, add one by typing a body or picking a
 * .md/.json/.txt/.yaml/.yml file (content slurped into the body), toggle /
 * remove. Persisted to localStorage; the injection path lands with the SDK
 * integration. Esc / backdrop / X close.
 */
export function SkillConfigModal({ open, onClose }: Props) {
  // Φ-skill-library — merged list (Convex permanent skills + local) from the
  // shared store. Library rows are non-removable but toggleable per-install.
  const skills = useSyncExternalStore(subscribeSkills, getSkillsSnapshot);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [filename, setFilename] = useState<string | undefined>(undefined);
  const [formOpen, setFormOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const canSave = name.trim().length > 0 && body.trim().length > 0;

  const resetForm = () => {
    setName("");
    setBody("");
    setFilename(undefined);
  };

  const addSkill = () => {
    if (!canSave) return;
    const skill: SkillConfig = {
      id: nextSkillId(),
      name: name.trim(),
      body: body.trim(),
      filename,
      enabled: true,
    };
    setLocalSkills([...skills, skill]);
    resetForm();
    setFormOpen(false);
  };

  const toggleSkill = (id: string) => {
    const target = skills.find((s) => s.id === id);
    if (!target) return;
    if (target.permanent) {
      togglePermanentSkill(id.replace(/^lib-/, ""), !target.enabled);
    } else {
      setLocalSkills(
        skills.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)),
      );
    }
  };

  const removeSkill = (id: string) => {
    if (skills.find((s) => s.id === id)?.permanent) return; // permanent — not removable
    setLocalSkills(skills.filter((s) => s.id !== id));
  };

  const onPickFile = (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      if (!name.trim()) setName(f.name.replace(/\.[^.]+$/, ""));
      setBody(text);
      setFilename(f.name);
      if (fileRef.current) fileRef.current.value = "";
    };
    reader.readAsText(f, "utf-8");
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[12vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <div
            className="absolute inset-0 dark:bg-black/60 light:bg-black/30 backdrop-blur-[6px]"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Skills"
            className={cn(
              "relative w-[70vw] max-w-[960px] max-h-[70vh] flex flex-col overflow-hidden rounded-2xl",
              "border dark:border-white/10 light:border-black/10",
              "dark:bg-[linear-gradient(160deg,#151311_0%,#0c0a08_100%)] light:bg-[linear-gradient(160deg,#ffffff_0%,#f6f3eb_100%)]",
              "dark:shadow-[0_24px_80px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.06)] light:shadow-[0_24px_80px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.8)]",
            )}
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.985 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 h-14 border-b dark:border-white/[0.07] light:border-black/[0.07] shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-lg flex items-center justify-center dark:bg-[#ffb400]/[0.12] light:bg-[#ffb400]/[0.14]">
                  <Sparkles className="h-3.5 w-3.5 dark:text-[#ffb400] light:text-[#b8860b]" />
                </div>
                <div className="leading-tight">
                  <p className="text-[13px] font-medium dark:text-[#e5e5e5] light:text-[#262626]">
                    Skills
                  </p>
                  <p className="text-[10px] font-mono dark:text-[#6a6a6a] light:text-[#8a8a8a]">
                    reusable instructions
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="h-8 w-8 flex items-center justify-center rounded-lg dark:text-[#737373] light:text-[#8a8a8a] hover:dark:text-white hover:light:text-black hover:dark:bg-white/[0.06] hover:light:bg-black/[0.05] transition-colors"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
              {skills.length === 0 ? (
                <div className="py-16 text-center">
                  <p className="text-[13px] dark:text-[#737373] light:text-[#808080]">
                    No skills yet.
                  </p>
                  <p className="mt-1 text-[11px] font-mono dark:text-[#505050] light:text-[#a8a8a8]">
                    Add one so the model can follow it on demand.
                  </p>
                </div>
              ) : (
                <ul className="flex flex-col gap-2">
                  {skills.map((s) => (
                    <SkillRow
                      key={s.id}
                      skill={s}
                      onToggle={toggleSkill}
                      onRemove={removeSkill}
                    />
                  ))}
                </ul>
              )}

              <AnimatePresence initial={false}>
                {formOpen && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-3 p-4 rounded-xl border dark:border-white/[0.08] light:border-black/[0.08] dark:bg-white/[0.03] light:bg-black/[0.02]">
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="skill name"
                        className="w-full h-9 px-3 rounded-lg text-[12px] font-mono outline-none dark:bg-black/40 light:bg-white/60 dark:text-[#e5e5e5] light:text-[#262626] dark:border dark:border-white/10 light:border light:border-black/10 placeholder:dark:text-[#505050] placeholder:light:text-[#aaaaaa] focus:dark:border-[#ffb400]/[0.5] focus:light:border-[#b8860b]/[0.5]"
                      />
                      <textarea
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        rows={5}
                        placeholder="Instructions the model should follow…"
                        className="mt-2 w-full px-3 py-2 rounded-lg text-[12px] font-mono leading-relaxed outline-none dark:bg-black/40 light:bg-white/60 dark:text-[#e5e5e5] light:text-[#262626] dark:border dark:border-white/10 light:border light:border-black/10 placeholder:dark:text-[#505050] placeholder:light:text-[#aaaaaa] focus:dark:border-[#ffb400]/[0.5] focus:light:border-[#b8860b]/[0.5] resize-none"
                      />
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        className="mt-2 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-tight dark:text-[#606060] light:text-[#8a8a8a] hover:dark:text-[#ffb400] hover:light:text-[#b8860b] transition-colors"
                      >
                        <Upload className="h-3 w-3" />
                        {filename ? `loaded ${filename}` : "load from file"}
                      </button>

                      <div className="mt-3 flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            setFormOpen(false);
                            resetForm();
                          }}
                          className="px-3 h-8 rounded-lg text-[11px] font-mono uppercase tracking-tight dark:text-[#8a8a8a] light:text-[#808080] hover:dark:text-white hover:light:text-black transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={addSkill}
                          disabled={!canSave}
                          className={cn(
                            "px-4 h-8 rounded-lg text-[11px] font-mono uppercase tracking-tight transition-colors",
                            canSave
                              ? "dark:bg-[#ffb400] light:bg-[#ffb400] dark:text-black light:text-black hover:brightness-110"
                              : "dark:bg-white/[0.04] light:bg-black/[0.04] dark:text-[#505050] light:text-[#b0b0b0] cursor-not-allowed",
                          )}
                        >
                          Add skill
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 h-14 border-t dark:border-white/[0.07] light:border-black/[0.07] shrink-0">
              <p className="text-[10px] font-mono dark:text-[#505050] light:text-[#a0a0a0]">
                {skills.filter((s) => s.enabled).length} enabled
              </p>
              <button
                onClick={() => setFormOpen((o) => !o)}
                className="flex items-center gap-1.5 px-3.5 h-8 rounded-lg text-[11px] font-mono uppercase tracking-tight dark:bg-white/[0.06] light:bg-black/[0.05] dark:text-[#e5e5e5] light:text-[#262626] border dark:border-white/10 light:border-black/10 hover:dark:border-[#ffb400]/[0.4] hover:light:border-[#b8860b]/[0.4] transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                {formOpen ? "close form" : "add skill"}
              </button>
            </div>
          </motion.div>
          <input
            ref={fileRef}
            type="file"
            accept=".md,.json,.txt,.yaml,.yml"
            hidden
            onChange={(e) => onPickFile(e.target.files)}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SkillRow({
  skill,
  onToggle,
  onRemove,
}: {
  skill: SkillConfig;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  // Φ-skill-view/edit — the row expands to reveal the skill body (read-only)
  // and an edit mode (textarea). Permanent skills edit via a LOCAL override
  // (the global Convex row is shared across accounts); reset restores it.
  const [viewing, setViewing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(skill.body);

  const startEdit = () => {
    setDraft(skill.body);
    setEditing(true);
    setViewing(true);
  };
  const saveEdit = () => {
    const body = draft.trim();
    if (!body || body === skill.body) {
      setEditing(false);
      return;
    }
    updateSkillBody(skill.id, body);
    setEditing(false);
  };

  return (
    <li
      className={cn(
        "group rounded-xl border transition-colors",
        skill.enabled
          ? "dark:border-white/[0.08] light:border-black/[0.08] dark:bg-white/[0.03] light:bg-black/[0.02]"
          : "dark:border-white/[0.04] light:border-black/[0.04] dark:bg-black/20 light:bg-black/[0.01]",
      )}
    >
      <div className="flex items-center gap-3 px-3.5 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full shrink-0",
                skill.enabled ? "dark:bg-[#ffb400] light:bg-[#b8860b]" : "dark:bg-[#404040] light:bg-[#c0c0c0]",
              )}
            />
            <p
              className={cn(
                "text-[12.5px] truncate",
                skill.enabled
                  ? "dark:text-[#e5e5e5] light:text-[#262626]"
                  : "dark:text-[#666666] light:text-[#909090]",
              )}
            >
              {skill.name}
            </p>
            {skill.permanent && (
              <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wide dark:text-[#ffb400]/[0.85] light:text-[#b8860b] dark:bg-[#ffb400]/[0.08] light:bg-[#b8860b]/[0.1]">
                permanent
              </span>
            )}
            {skill.overridden && (
              <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wide dark:text-[#7ecbff]/[0.9] light:text-[#1d6fd1] dark:bg-[#7ecbff]/[0.08] light:bg-[#1d6fd1]/[0.1]">
                edited
              </span>
            )}
          </div>
          <p className="mt-0.5 pl-3.5 text-[10.5px] font-mono truncate dark:text-[#5a5a5a] light:text-[#999999]">
            {skill.filename ?? `/${skill.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`}
          </p>
        </div>
        <button
          onClick={() => (editing ? undefined : setViewing((v) => !v))}
          title={viewing ? "Hide body" : "View body"}
          className="h-7 px-2.5 rounded-md text-[10px] font-mono uppercase tracking-tight transition-colors dark:text-[#8a8a8a] light:text-[#808080] hover:dark:text-white hover:light:text-black"
        >
          {viewing ? "hide" : "view"}
        </button>
        <button
          onClick={startEdit}
          title="Edit body"
          className="h-7 px-2.5 rounded-md text-[10px] font-mono uppercase tracking-tight transition-colors dark:text-[#8a8a8a] light:text-[#808080] hover:dark:text-[#ffb400] hover:light:text-[#b8860b]"
        >
          edit
        </button>
        <button
          onClick={() => onToggle(skill.id)}
          title={skill.enabled ? "Disable" : "Enable"}
          className={cn(
            "h-7 px-2.5 rounded-md text-[10px] font-mono uppercase tracking-tight transition-colors",
            skill.enabled
              ? "dark:text-[#ffb400] light:text-[#b8860b] hover:dark:bg-[#ffb400]/[0.08] hover:light:bg-[#b8860b]/[0.08]"
              : "dark:text-[#666666] light:text-[#909090] hover:dark:text-white hover:light:text-black",
          )}
        >
          {skill.enabled ? "on" : "off"}
        </button>
        {!skill.permanent && (
          <button
            onClick={() => onRemove(skill.id)}
            title="Remove"
            className="h-7 w-7 flex items-center justify-center rounded-md dark:text-[#5a5a5a] light:text-[#a0a0a0] opacity-0 group-hover:opacity-100 transition-opacity hover:dark:text-red-400 hover:light:text-red-500 hover:dark:bg-red-500/10 hover:light:bg-red-500/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {viewing && !editing && (
        <div className="px-3.5 pb-3">
          <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg border px-3 py-2 text-[11px] font-mono leading-relaxed dark:border-white/[0.07] light:border-black/[0.07] dark:bg-black/40 light:bg-black/[0.03] dark:text-[#b5b5b5] light:text-[#4a4a4a]">
            {skill.body}
          </pre>
        </div>
      )}

      {editing && (
        <div className="px-3.5 pb-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={10}
            className="w-full px-3 py-2 rounded-lg text-[11px] font-mono leading-relaxed outline-none dark:bg-black/40 light:bg-white/60 dark:text-[#e5e5e5] light:text-[#262626] dark:border dark:border-white/10 light:border light:border-black/10 focus:dark:border-[#ffb400]/[0.5] focus:light:border-[#b8860b]/[0.5] resize-y"
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            {skill.overridden && (
              <button
                onClick={() => {
                  resetSkillOverride(skill.id);
                  setEditing(false);
                }}
                className="mr-auto px-3 h-8 rounded-lg text-[10px] font-mono uppercase tracking-tight dark:text-[#7ecbff] light:text-[#1d6fd1] hover:dark:bg-[#7ecbff]/[0.08] transition-colors"
              >
                reset to default
              </button>
            )}
            <button
              onClick={() => setEditing(false)}
              className="px-3 h-8 rounded-lg text-[11px] font-mono uppercase tracking-tight dark:text-[#8a8a8a] light:text-[#808080] hover:dark:text-white hover:light:text-black transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={saveEdit}
              className="px-4 h-8 rounded-lg text-[11px] font-mono uppercase tracking-tight transition-colors dark:bg-[#ffb400] light:bg-[#ffb400] dark:text-black light:text-black hover:brightness-110"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </li>
  );
}