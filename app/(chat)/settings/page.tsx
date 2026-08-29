"use client";

import { useUser, useClerk } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { BYPASS_CLERK, DEV_USER_ID } from "@/lib/dev-user";
import { motion } from "framer-motion";
import { User, Palette, Cpu, HardDrive, AlertTriangle, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getActiveModels } from "@/lib/ai/models";
import { toast } from "sonner";
import { useConvex } from "convex/react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { PreferencesPanel } from "@/components/chat/leopard/settings-panel";
import { ReasoningEffort } from "@/components/chat/leopard/reasoning-effort";
import { ComparisonCard } from "@/components/chat/leopard/comparison-card";
import { RecommendationCard } from "@/components/chat/leopard/recommendation-card";
import { CheckpointHistory } from "@/components/chat/leopard/checkpoint-history";
import { ScheduleCard } from "@/components/chat/leopard/schedule-card";

/** Next daily 04:21 UTC run of the retention cron (convex/crons.ts). */
function nextRetentionRun(): string {
  const d = new Date();
  d.setUTCHours(4, 21, 0, 0);
  if (d.getTime() <= Date.now()) d.setUTCDate(d.getUTCDate() + 1);
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function SettingRow({ label, description, children }: {
  label: string; description?: string; children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-4">
      <div className="space-y-0.5">
        <p className="text-sm font-mono dark:text-[#d4d4d4] light:text-[#404040]">{label}</p>
        {description && <p className="text-xs font-mono dark:text-[#404040] light:text-[#a3a3a3]">{description}</p>}
      </div>
      <div>{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const deleteChat = useMutation(api.chats.remove);
  // Effective user id — Clerk id, or DEV_USER_ID under BYPASS_CLERK so the bypass
  // session's own chats (stored under DEV_USER_ID) are listed/counted, matching
  // the sidebar + chat route.
  const userId = user?.id ?? (BYPASS_CLERK ? DEV_USER_ID : null);
  const chats = useQuery(api.chats.list, userId ? { userId } : "skip");
  const convex = useConvex();
  // Live NIM registry (kinds: text/vlm), not the stale hardcoded @/types list.
  const liveModels = getActiveModels().filter((m) => m.kind !== "image" && m.kind !== "video");
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();
  const updateSettings = useMutation(api.users.updateSettings);
  const retention = useQuery(api.retention.status);
  // Models-tab Compare: two registry picks → trait table + faster-tier pick.
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
  // Chats as restorable checkpoints (Data tab): open = "restore" that session.
  const checkpoints = useMemo(
    () =>
      (chats ?? []).map((c) => ({
        id: String(c._id),
        label: c.title ?? "Untitled",
        at: new Date(c.updatedAt).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        }),
        meta: c.shared ? "shared" : undefined,
      })),
    [chats],
  );

  const handleDeleteAll = async () => {
    if (!chats || chats.length === 0 || !userId) return;
    if (!window.confirm(`Delete all ${chats.length} conversations? This is permanent and cannot be undone.`)) {
      return;
    }
    setDeleting(true);
    try {
      for (const chat of chats) {
        await deleteChat({ chatId: chat._id, userId });
      }
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

  const TABS = [
    { value: "profile", icon: User, label: "Profile" },
    { value: "appearance", icon: Palette, label: "Appearance" },
    { value: "models", icon: Cpu, label: "Models" },
    { value: "data", icon: HardDrive, label: "Data" },
    { value: "danger", icon: AlertTriangle, label: "Danger" },
  ];

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-2xl mx-auto px-6 py-10">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mb-8">
          <h1 className="text-xl font-semibold font-mono dark:text-white light:text-[#171717] mb-1">Settings</h1>
          <p className="text-sm font-mono dark:text-[#525252] light:text-[#8c8c8c]">Manage your Leopard preferences</p>
        </motion.div>

        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="w-full justify-start dark:bg-white/[0.02] light:bg-black/[0.015] border dark:border-white/[0.06] light:border-black/[0.06] rounded-xl p-1 mb-6 h-auto flex-wrap gap-1">
            {TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}
                className="font-mono text-xs gap-1.5 data-[state=active]:dark:bg-[#ffb40010] light:bg-[#d4960010] data-[state=active]:text-[#ffb400] data-[state=active]:shadow-none dark:text-[#525252] light:text-[#8c8c8c] rounded-lg px-3 py-1.5">
                <tab.icon className="h-3.5 w-3.5" />{tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="profile">
            <div className="glass-card rounded-2xl p-6">
              <h3 className="text-sm font-semibold font-mono dark:text-white light:text-[#171717] mb-1">Profile</h3>
              <p className="text-xs font-mono dark:text-[#404040] light:text-[#a3a3a3] mb-4">Your account from Google</p>
              <Separator className="dark:bg-white/[0.04] light:bg-black/[0.03] mb-2" />
              <SettingRow label="Avatar">
                <Avatar className="h-10 w-10 ring-2 dark:ring-[#ffb40020] light:ring-[#d4960020]">
                  <AvatarImage src={user?.imageUrl} />
                  <AvatarFallback className="bg-[#ffb40015] text-[#ffb400] font-mono font-bold">{user?.firstName?.[0] || "U"}</AvatarFallback>
                </Avatar>
              </SettingRow>
              <Separator className="dark:bg-white/[0.04] light:bg-black/[0.03]" />
              <SettingRow label="Name" description="From your Google account">
                <span className="text-xs font-mono dark:text-[#a3a3a3] light:text-[#525252]">{user?.fullName}</span>
              </SettingRow>
              <Separator className="dark:bg-white/[0.04] light:bg-black/[0.03]" />
              <SettingRow label="Email">
                <span className="text-xs font-mono dark:text-[#a3a3a3] light:text-[#525252]">{user?.primaryEmailAddress?.emailAddress}</span>
              </SettingRow>
            </div>
          </TabsContent>

          <TabsContent value="appearance">
            <div className="glass-card rounded-2xl p-6">
              <h3 className="text-sm font-semibold font-mono dark:text-white light:text-[#171717] mb-1">Appearance</h3>
              <Separator className="dark:bg-white/[0.04] light:bg-black/[0.03] my-3" />
              <SettingRow label="Theme" description="Leopard is dark by design">
                <span className="text-xs font-mono text-[#ffb400] px-2 py-1 rounded-md dark:bg-[#ffb40010] light:bg-[#d4960010]">Dark</span>
              </SettingRow>
            </div>
          </TabsContent>

          <TabsContent value="models">
            {/* Kit panel covers the default-model picker + interaction toggles;
                the registry list below stays for browsing capabilities. */}
            <PreferencesPanel className="mb-4 max-w-none" />
            {/* Kit effort slider: default reasoning level per model
                (leopard:reasoning:<modelId> — same key the chat uses). */}
            <ReasoningDefaults models={liveModels} />
            <div className="glass-card rounded-2xl p-6">
              <h4 className="text-xs font-semibold font-mono dark:text-[#737373] light:text-[#737373] mb-3">Available Models</h4>
              <div className="space-y-2">
                {liveModels.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl dark:bg-white/[0.02] light:bg-black/[0.015] border dark:border-white/[0.04] light:border-black/[0.05]">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-mono font-medium dark:text-[#d4d4d4] light:text-[#404040]">{m.name}</p>
                        <span className="text-[9px] font-mono dark:text-[#525252] light:text-[#8c8c8c]">{m.provider}</span>
                        {m.supportsVision && <span className="text-[8px] px-1.5 py-0.5 rounded-full dark:bg-[#ffb40010] light:bg-[#d4960010] text-[#ffb400]">vision</span>}
                      </div>
                      <p className="text-[10px] font-mono dark:text-[#404040] light:text-[#a3a3a3] mt-0.5">{m.description}</p>
                    </div>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full shrink-0 ${m.speedTier === "fast" ? "bg-green-500/10 text-green-400" : "bg-yellow-500/10 text-yellow-400"}`}>
                      {m.speedTier}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            {modelA && modelB && recommended && (
              <div className="glass-card rounded-2xl p-6 mt-4">
                <h4 className="text-xs font-semibold font-mono dark:text-[#737373] light:text-[#737373] mb-3">Compare</h4>
                <div className="flex gap-2 mb-3">
                  {([["a", modelA.id, setCmpA], ["b", modelB.id, setCmpB]] as const).map(([slot, value, setter]) => (
                    <select
                      key={slot}
                      value={value}
                      onChange={(e) => { setter(e.target.value); setAccepted(false); }}
                      className="flex-1 min-w-0 rounded-lg border dark:border-white/[0.08] light:border-black/[0.08] dark:bg-white/[0.02] light:bg-black/[0.015] px-2 py-1.5 text-xs font-mono dark:text-[#d4d4d4] light:text-[#404040]"
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
            )}
          </TabsContent>

          <TabsContent value="data">
            <div className="glass-card rounded-2xl p-6">
              <h3 className="text-sm font-semibold font-mono dark:text-white light:text-[#171717] mb-1">Data & Export</h3>
              <Separator className="dark:bg-white/[0.04] light:bg-black/[0.03] my-3" />
              <SettingRow label="Conversations" description="Total in your account">
                <span className="text-xs font-mono dark:text-[#a3a3a3] light:text-[#525252]">{chats?.length || 0} chats</span>
              </SettingRow>
              <Separator className="dark:bg-white/[0.04] light:bg-black/[0.03]" />
              <SettingRow label="Export All" description="Download as Markdown">
                <Button variant="outline" size="sm" onClick={handleExportAll} disabled={!chats || chats.length === 0} className="text-xs font-mono dark:border-white/[0.08] light:border-black/[0.08] dark:text-[#a3a3a3] light:text-[#525252] hover:dark:text-white light:text-[#171717] hover:dark:bg-white/5 light:bg-black/5 disabled:opacity-40">
                  Export <ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              </SettingRow>
            </div>
            {/* Chats as restorable checkpoints — "Restore" opens that chat. */}
            {checkpoints.length > 0 && (
              <CheckpointHistory
                className="mt-4 max-w-none"
                checkpoints={checkpoints}
                currentId={checkpoints[0]?.id ?? ""}
                onRestore={(id) => router.push(`/chat/${id}`)}
              />
            )}
            {/* The one real scheduled job: convex/crons.ts daily retention sweep
                (fail-closed — armed only via LEOPARD_RETENTION_DAYS). */}
            <ScheduleCard
              className="mt-4 max-w-none"
              name="Retention sweep"
              cadence="daily · 04:21 UTC"
              nextRun={nextRetentionRun()}
              enabled={(retention?.days ?? 0) > 0}
              history={[]}
            />
            <p className="mt-2 text-[10px] font-mono dark:text-[#404040] light:text-[#a3a3a3]">
              {(retention?.days ?? 0) > 0
                ? `Deletes chats older than ${retention!.days} days.`
                : "Dry run — no retention window is set, nothing is deleted."}
            </p>
          </TabsContent>

          <TabsContent value="danger">
            <div className="glass-card rounded-2xl p-6 border-red-500/10">
              <h3 className="text-sm font-semibold font-mono text-red-400 mb-1">Danger Zone</h3>
              <Separator className="dark:bg-white/[0.04] light:bg-black/[0.03] my-3" />
              <SettingRow label="Delete All Conversations" description={`${chats?.length || 0} chats — permanent`}>
                <Button variant="outline" size="sm" disabled={deleting} className="text-xs font-mono border-red-500/20 text-red-400 hover:bg-red-500/10 disabled:opacity-40" onClick={handleDeleteAll}>
                  {deleting ? "Deleting…" : "Delete All"}
                </Button>
              </SettingRow>
              <Separator className="dark:bg-white/[0.04] light:bg-black/[0.03]" />
              <SettingRow label="Sign Out" description="Sign out of your account">
                <Button variant="outline" size="sm" className="text-xs font-mono border-red-500/20 text-red-400 hover:bg-red-500/10" onClick={() => signOut({ redirectUrl: "/" })}>
                  Sign Out
                </Button>
              </SettingRow>
            </div>
          </TabsContent>
        </Tabs>
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
    <div className="glass-card rounded-2xl p-6 mb-4">
      <h4 className="text-xs font-semibold font-mono dark:text-[#737373] light:text-[#737373] mb-3">
        Default reasoning effort
      </h4>
      <div className="mb-2 flex items-center gap-2">
        <select
          value={mid}
          onChange={(e) => {
            const next = e.target.value;
            setMid(next);
            setLevel(window.localStorage.getItem(`leopard:reasoning:${next}`) ?? "");
          }}
          className="h-8 rounded-md bg-transparent px-2 text-xs font-mono dark:text-[#d4d4d4] light:text-[#404040] border dark:border-white/10 light:border-black/10 outline-none"
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
  );
}
