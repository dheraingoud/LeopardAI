"use client";

import { useUser, useClerk } from "@clerk/nextjs";
import { useQuery, useMutation, useConvex } from "convex/react";
import { api } from "@/convex/_generated/api";
import { BYPASS_CLERK, DEV_USER_ID } from "@/lib/dev-user";
import { motion } from "framer-motion";
import { useTheme } from "@/components/theme-provider";
import {
  User, Palette, Cpu, HardDrive, AlertTriangle,
  Download, Trash2, LogOut, Sun, Moon,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getActiveModels } from "@/lib/ai/models";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PreferencesPanel } from "@/components/chat/leopard/settings-panel";
import { ReasoningEffort } from "@/components/chat/leopard/reasoning-effort";
import { ComparisonCard } from "@/components/chat/leopard/comparison-card";
import { RecommendationCard } from "@/components/chat/leopard/recommendation-card";
import { CheckpointHistory } from "@/components/chat/leopard/checkpoint-history";
import { ScheduleCard } from "@/components/chat/leopard/schedule-card";
import { paper, fieldInteractive, pressable, mono } from "@/components/chat/leopard/surfaces";

/** Next daily 04:21 UTC run of the retention cron (convex/crons.ts). */
function nextRetentionRun(): string {
  const d = new Date();
  d.setUTCHours(4, 21, 0, 0);
  if (d.getTime() <= Date.now()) d.setUTCDate(d.getUTCDate() + 1);
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

const hairline = "dark:border-white/[0.07] light:border-black/[0.07]";
const muted = "dark:text-[#737373] light:text-[#737373]";
const faint = "dark:text-[#4a4a4a] light:text-[#a3a3a3]";

function Section({ title, hint, danger, children }: {
  title: string; hint?: string; danger?: boolean; children: ReactNode;
}) {
  return (
    <section className={cn(paper, "elev-2 rounded-xl", danger && "dark:border-red-500/15 light:border-red-500/20")}>
      <header className={cn("border-b px-5 py-3.5", hairline)}>
        <h3 className={cn("text-[13px] font-medium tracking-tight", danger ? "text-red-400" : "dark:text-[#ececec] light:text-[#171717]")}>
          {title}
        </h3>
        {hint && <p className={cn(mono, "mt-0.5", faint)}>{hint}</p>}
      </header>
      <div className="px-5">{children}</div>
    </section>
  );
}

function Row({ label, description, children, last }: {
  label: string; description?: string; children: ReactNode; last?: boolean;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-6 py-3.5", !last && "border-b", hairline)}>
      <div className="min-w-0">
        <p className="text-[13px] dark:text-[#d4d4d4] light:text-[#262626]">{label}</p>
        {description && <p className={cn(mono, "mt-0.5", faint)}>{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function ActionButton({ danger, onClick, disabled, children }: {
  danger?: boolean; onClick: () => void; disabled?: boolean; children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        pressable,
        "flex h-8 items-center gap-1.5 rounded-md px-3 text-xs outline-none disabled:opacity-40",
        danger
          ? "border border-red-500/25 text-red-400 transition-colors hover:bg-red-500/10"
          : cn(fieldInteractive, hairline, "border dark:text-[#d4d4d4] light:text-[#404040]"),
      )}
    >
      {children}
    </button>
  );
}

const SECTIONS = [
  { id: "profile", icon: User, label: "Profile" },
  { id: "appearance", icon: Palette, label: "Appearance" },
  { id: "models", icon: Cpu, label: "Models" },
  { id: "data", icon: HardDrive, label: "Data" },
  { id: "danger", icon: AlertTriangle, label: "Danger" },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

function ThemeControl() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const current = mounted ? (theme ?? "dark") : "dark";
  const opts = [
    { id: "dark", icon: Moon, label: "Dark" },
    { id: "light", icon: Sun, label: "Light" },
  ] as const;
  return (
    <div className={cn(fieldInteractive, hairline, "flex items-center gap-0.5 rounded-md border p-0.5")}>
      {opts.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => setTheme(o.id)}
          aria-pressed={current === o.id}
          className={cn(
            pressable,
            "flex h-7 items-center gap-1.5 rounded px-2.5 text-xs outline-none transition-colors",
            current === o.id
              ? "dark:bg-[#ffb400]/10 light:bg-[#d49600]/10 dark:text-[#ffb400] light:text-[#a57600]"
              : cn(muted, "hover:dark:text-white hover:light:text-black"),
          )}
        >
          <o.icon className="size-3.5" />
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function SettingsPage() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const deleteChat = useMutation(api.chats.remove);
  const userId = user?.id ?? (BYPASS_CLERK ? DEV_USER_ID : null);
  const chats = useQuery(api.chats.list, userId ? { userId } : "skip");
  const convex = useConvex();
  const liveModels = getActiveModels().filter((m) => m.kind !== "image" && m.kind !== "video");
  const [deleting, setDeleting] = useState(false);
  const [section, setSection] = useState<SectionId>("profile");
  const router = useRouter();
  const updateSettings = useMutation(api.users.updateSettings);
  const retention = useQuery(api.retention.status);
  const [cmpA, setCmpA] = useState<string | null>(null);
  const [cmpB, setCmpB] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const modelA = liveModels.find((m) => m.id === (cmpA ?? liveModels[0]?.id));
  const modelB = liveModels.find((m) => m.id === (cmpB ?? liveModels[1]?.id));
  const recommended = useMemo(() => {
    if (!modelA || !modelB) return undefined;
    if (modelA.speedTier !== modelB.speedTier)
      return modelA.speedTier === "fast" ? modelA : modelB;
    return modelA.supportsTools && !modelB.supportsTools ? modelA : modelB;
  }, [modelA, modelB]);
  const checkpoints = useMemo(
    () =>
      (chats ?? []).map((c) => ({
        id: String(c._id),
        label: c.title ?? "Untitled",
        at: new Date(c.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        meta: c.shared ? "shared" : undefined,
      })),
    [chats],
  );

  const handleDeleteAll = async () => {
    if (!chats || chats.length === 0 || !userId) return;
    if (!window.confirm(`Delete all ${chats.length} conversations? This is permanent and cannot be undone.`)) return;
    setDeleting(true);
    try {
      for (const chat of chats) await deleteChat({ chatId: chat._id, userId });
      toast.success("All conversations deleted");
    } catch {
      toast.error("Failed to delete conversations");
    } finally {
      setDeleting(false);
    }
  };

  const handleExportAll = async () => {
    if (!chats || chats.length === 0) return;
    let md = `# Leopard conversations\n\n`;
    try {
      for (const chat of chats) {
        md += `\n## ${chat.title ?? "Untitled"}\n\n`;
        const msgs = await convex.query(api.messages.list, { chatId: chat._id });
        for (const m of msgs) {
          const role = m.role === "assistant" ? "Leopard" : "You";
          const text =
            m.content ??
            (m.parts ?? [])
              .filter((p: { type?: string }) => p.type === "text")
              .map((p: { text?: string }) => p.text ?? "")
              .join("");
          md += `**${role}:**\n\n${text}\n\n`;
        }
      }
      const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "leopard-chats.md";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Exported all conversations");
    } catch {
      toast.error("Export failed");
    }
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-4xl px-6 py-10 sm:px-10">
        <motion.header
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="mb-8"
        >
          <p className={cn(mono, "mb-1.5 uppercase dark:text-[#ffb400] light:text-[#a57600]")}>Settings</p>
          <h1 className="text-[26px] font-medium tracking-[-0.02em] dark:text-[#ececec] light:text-[#171717]">
            Den control<span className="dark:text-[#ffb400] light:text-[#d49600]">.</span>
          </h1>
          <p className={cn(mono, "mt-1", faint)}>account · appearance · models · data</p>
        </motion.header>

        <div className="grid gap-8 md:grid-cols-[168px_minmax(0,1fr)]">
          <nav className="flex gap-1 overflow-x-auto md:sticky md:top-6 md:flex-col md:self-start">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSection(s.id)}
                aria-current={section === s.id}
                className={cn(
                  pressable,
                  "flex shrink-0 items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] outline-none transition-colors",
                  section === s.id
                    ? cn(fieldInteractive, hairline, "border dark:text-[#ffb400] light:text-[#a57600]")
                    : cn(muted, "hover:dark:text-white hover:light:text-black"),
                )}
              >
                <s.icon className="size-3.5 shrink-0" />
                {s.label}
                {s.id === "danger" && section !== "danger" && <span className="ml-auto size-1.5 rounded-full bg-red-500/50" />}
              </button>
            ))}
          </nav>

          <motion.div
            key={section}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="flex min-w-0 flex-col gap-4"
          >
            {section === "profile" && (
              <Section title="Profile" hint="from your account provider">
                <Row label="Avatar">
                  <Avatar className="h-10 w-10 ring-1 dark:ring-[#ffb400]/25 light:ring-[#d49600]/30">
                    <AvatarImage src={user?.imageUrl} />
                    <AvatarFallback className="bg-[#ffb40015] text-[#ffb400] font-mono font-bold">
                      {user?.firstName?.[0] || "U"}
                    </AvatarFallback>
                  </Avatar>
                </Row>
                <Row label="Name" description="Managed by your account provider">
                  <span className={cn(mono, muted)}>{user?.fullName ?? "—"}</span>
                </Row>
                <Row label="Email" last>
                  <span className={cn(mono, muted)}>{user?.primaryEmailAddress?.emailAddress ?? "—"}</span>
                </Row>
              </Section>
            )}

            {section === "appearance" && (
              <Section title="Appearance" hint="canvas, ink and light">
                <Row label="Theme" description="Leopard is dark by design — light is a courtesy" last>
                  <ThemeControl />
                </Row>
              </Section>
            )}

            {section === "models" && (
              <>
                <PreferencesPanel className="max-w-none" />
                <ReasoningDefaults models={liveModels} />
                <Section title="Available models" hint={`${liveModels.length} live from the registry`}>
                  <div className="flex flex-col py-2">
                    {liveModels.map((m, i) => (
                      <div
                        key={m.id}
                        className={cn("flex items-center gap-3 py-2.5", i < liveModels.length - 1 && "border-b", hairline)}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-[13px] font-medium dark:text-[#d4d4d4] light:text-[#262626]">{m.name}</p>
                            <span className={cn(mono, faint)}>{m.provider}</span>
                            {m.supportsVision && (
                              <span className={cn(mono, "rounded-full px-1.5 py-px dark:bg-[#ffb400]/10 light:bg-[#d49600]/10 dark:text-[#ffb400] light:text-[#a57600]")}>
                                vision
                              </span>
                            )}
                          </div>
                          <p className={cn(mono, "mt-0.5", faint)}>{m.description}</p>
                        </div>
                        <span
                          className={cn(
                            mono,
                            "shrink-0 rounded-full px-1.5 py-px",
                            m.speedTier === "fast"
                              ? "bg-emerald-500/10 text-emerald-400"
                              : "dark:bg-[#ffb400]/10 light:bg-[#d49600]/10 dark:text-[#ffb400] light:text-[#a57600]",
                          )}
                        >
                          {m.speedTier}
                        </span>
                      </div>
                    ))}
                  </div>
                </Section>
                {modelA && modelB && recommended && (
                  <Section title="Compare" hint="pick two — the faster tier wins">
                    <div className="py-4">
                      <div className="mb-3 flex gap-2">
                        {([["a", modelA.id, setCmpA], ["b", modelB.id, setCmpB]] as const).map(([slot, value, setter]) => (
                          <select
                            key={slot}
                            value={value}
                            onChange={(e) => { setter(e.target.value); setAccepted(false); }}
                            className={cn(fieldInteractive, hairline, "min-w-0 flex-1 rounded-md border px-2 py-1.5 text-xs dark:text-[#d4d4d4] light:text-[#404040]")}
                            aria-label={`Compare model ${slot.toUpperCase()}`}
                          >
                            {liveModels.map((m) => (
                              <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                          </select>
                        ))}
                      </div>
                      <ComparisonCard
                        className="max-w-none mb-3"
                        traitLabels={["Fast", "Vision", "Tools"]}
                        options={[modelA, modelB].map((m) => ({
                          id: m.id,
                          name: m.name,
                          headline: m.description,
                          traits: [
                            m.speedTier === "fast" ? "fast" : false,
                            m.supportsVision ? "vision" : false,
                            m.supportsTools ? "tools" : false,
                          ],
                        }))}
                        recommendedId={recommended.id}
                        reason={`${recommended.name} is the ${recommended.speedTier} tier here — lower latency for interactive chat.`}
                      />
                      <RecommendationCard
                        className="max-w-none"
                        state={accepted ? "accepted" : "idle"}
                        question={`Use ${recommended.name} for chat?`}
                        confidenceLabel={recommended.speedTier}
                        acceptedLabel="Default model updated"
                        onAccept={() => {
                          if (!user) return;
                          void updateSettings({ clerkId: user.id, defaultModel: recommended.id })
                            .then(() => { setAccepted(true); toast.success("Default model updated"); })
                            .catch(() => toast.error("Failed to update model"));
                        }}
                        onAlternatives={() => { setCmpA(modelB.id); setCmpB(modelA.id); setAccepted(false); }}
                      >
                        {recommended.name} is the {recommended.speedTier} tier of this pair{recommended.supportsVision ? " with vision" : ""}{recommended.supportsTools ? " and tool use" : ""}.
                      </RecommendationCard>
                    </div>
                  </Section>
                )}
              </>
            )}

            {section === "data" && (
              <>
                <Section title="Data & export" hint="yours, portable">
                  <Row label="Conversations" description="Total in your account">
                    <span className={cn(mono, muted)}>{chats?.length || 0} chats</span>
                  </Row>
                  <Row label="Export all" description="Every conversation as Markdown" last>
                    <ActionButton onClick={handleExportAll} disabled={!chats || chats.length === 0}>
                      <Download className="size-3.5" /> Export
                    </ActionButton>
                  </Row>
                </Section>
                {checkpoints.length > 0 && (
                  <CheckpointHistory
                    className="max-w-none"
                    checkpoints={checkpoints}
                    currentId={checkpoints[0]?.id ?? ""}
                    onRestore={(id) => router.push(`/chat/${id}`)}
                  />
                )}
                <ScheduleCard
                  className="max-w-none"
                  name="Retention sweep"
                  cadence="daily · 04:21 UTC"
                  nextRun={nextRetentionRun()}
                  enabled={(retention?.days ?? 0) > 0}
                  history={[]}
                />
                <p className={cn(mono, faint)}>
                  {(retention?.days ?? 0) > 0
                    ? `Deletes chats older than ${retention!.days} days.`
                    : "Dry run — no retention window is set, nothing is deleted."}
                </p>
              </>
            )}

            {section === "danger" && (
              <Section title="Danger zone" hint="no undo past this line" danger>
                <Row label="Delete all conversations" description={`${chats?.length || 0} chats — permanent`}>
                  <ActionButton danger onClick={handleDeleteAll} disabled={deleting}>
                    <Trash2 className="size-3.5" /> {deleting ? "Deleting…" : "Delete all"}
                  </ActionButton>
                </Row>
                <Row label="Sign out" description="End this session" last>
                  <ActionButton danger onClick={() => signOut({ redirectUrl: "/" })}>
                    <LogOut className="size-3.5" /> Sign out
                  </ActionButton>
                </Row>
              </Section>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function ReasoningDefaults({ models }: { models: ReturnType<typeof getActiveModels> }) {
  const reasoningModels = models.filter((m) => m.reasoningConfig?.enabled && m.reasoningConfig.toggleable);
  const [mid, setMid] = useState(reasoningModels[0]?.id ?? "");
  const [level, setLevel] = useState<string>(() =>
    typeof window === "undefined" ? "" : window.localStorage.getItem(`leopard:reasoning:${mid}`) ?? "",
  );
  if (reasoningModels.length === 0) return null;
  return (
    <Section title="Default reasoning effort" hint="per model — stored locally">
      <div className="py-4">
        <div className="mb-2 flex items-center gap-2">
          <select
            value={mid}
            onChange={(e) => {
              const next = e.target.value;
              setMid(next);
              setLevel(window.localStorage.getItem(`leopard:reasoning:${next}`) ?? "");
            }}
            className={cn(fieldInteractive, hairline, "h-8 rounded-md border bg-transparent px-2 text-xs dark:text-[#d4d4d4] light:text-[#404040] outline-none")}
          >
            {reasoningModels.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
        <ReasoningEffort
          modelId={mid}
          value={(level || undefined) as never}
          onChange={(l) => {
            setLevel(l);
            try { window.localStorage.setItem(`leopard:reasoning:${mid}`, l); } catch { /* private mode */ }
          }}
        />
      </div>
    </Section>
  );
}
