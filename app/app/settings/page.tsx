"use client";

import { useUser, useClerk } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { motion } from "framer-motion";
import { User, Palette, Cpu, HardDrive, AlertTriangle, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MODELS } from "@/types";
import { useState } from "react";
import { toast } from "sonner";

function SettingRow({ label, description, children }: {
  label: string; description?: string; children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-4">
      <div className="space-y-0.5">
        <p className="text-sm font-mono text-[#d4d4d4]">{label}</p>
        {description && <p className="text-xs font-mono text-[#404040]">{description}</p>}
      </div>
      <div>{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const dbUser = useQuery(api.users.getByClerkId, user ? { clerkId: user.id } : "skip");
  const updateSettings = useMutation(api.users.updateSettings);
  const deleteChat = useMutation(api.chats.remove);
  const chats = useQuery(api.chats.list, user ? { userId: user.id } : "skip");
  const [sendWithEnter, setSendWithEnter] = useState(true);
  const [streaming, setStreaming] = useState(true);
  const defaultModel = dbUser?.defaultModel || "minimax-m2.5";

  const handleModelChange = async (modelId: string | null) => {
    if (!user || !modelId) return;
    await updateSettings({ clerkId: user.id, defaultModel: modelId });
    toast.success("Default model updated");
  };

  const handleDeleteAll = async () => {
    if (!chats) return;
    for (const chat of chats) {
      await deleteChat({ chatId: chat._id, userId: user!.id });
    }
    toast.success("All conversations deleted");
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
          <h1 className="text-xl font-semibold font-mono text-white mb-1">Settings</h1>
          <p className="text-sm font-mono text-[#525252]">Manage your Leopard preferences</p>
        </motion.div>

        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="w-full justify-start bg-white/[0.02] border border-white/[0.06] rounded-xl p-1 mb-6 h-auto flex-wrap gap-1">
            {TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}
                className="font-mono text-xs gap-1.5 data-[state=active]:bg-[#ffb40010] data-[state=active]:text-[#ffb400] data-[state=active]:shadow-none text-[#525252] rounded-lg px-3 py-1.5">
                <tab.icon className="h-3.5 w-3.5" />{tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="profile">
            <div className="glass-card rounded-2xl p-6">
              <h3 className="text-sm font-semibold font-mono text-white mb-1">Profile</h3>
              <p className="text-xs font-mono text-[#404040] mb-4">Your account from Google</p>
              <Separator className="bg-white/[0.04] mb-2" />
              <SettingRow label="Avatar">
                <Avatar className="h-10 w-10 ring-2 ring-[#ffb40020]">
                  <AvatarImage src={user?.imageUrl} />
                  <AvatarFallback className="bg-[#ffb40015] text-[#ffb400] font-mono font-bold">{user?.firstName?.[0] || "U"}</AvatarFallback>
                </Avatar>
              </SettingRow>
              <Separator className="bg-white/[0.04]" />
              <SettingRow label="Name" description="From your Google account">
                <span className="text-xs font-mono text-[#a3a3a3]">{user?.fullName}</span>
              </SettingRow>
              <Separator className="bg-white/[0.04]" />
              <SettingRow label="Email">
                <span className="text-xs font-mono text-[#a3a3a3]">{user?.primaryEmailAddress?.emailAddress}</span>
              </SettingRow>
            </div>
          </TabsContent>

          <TabsContent value="appearance">
            <div className="glass-card rounded-2xl p-6">
              <h3 className="text-sm font-semibold font-mono text-white mb-1">Appearance</h3>
              <Separator className="bg-white/[0.04] my-3" />
              <SettingRow label="Theme" description="Leopard is dark by design">
                <span className="text-xs font-mono text-[#ffb400] px-2 py-1 rounded-md bg-[#ffb40010]">Dark</span>
              </SettingRow>
              <Separator className="bg-white/[0.04]" />
              <SettingRow label="Send with Enter" description="Shift+Enter for new line">
                <Switch checked={sendWithEnter} onCheckedChange={setSendWithEnter} className="data-[state=checked]:bg-[#ffb400]" />
              </SettingRow>
            </div>
          </TabsContent>

          <TabsContent value="models">
            <div className="glass-card rounded-2xl p-6">
              <h3 className="text-sm font-semibold font-mono text-white mb-1">Model Defaults</h3>
              <Separator className="bg-white/[0.04] my-3" />
              <SettingRow label="Default Model" description="Used for new chats">
                <Select value={defaultModel} onValueChange={handleModelChange}>
                  <SelectTrigger className="w-48 h-8 text-xs font-mono bg-white/[0.03] border-white/[0.06]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="glass-elevated bg-[#111] border-white/[0.08]">
                    {MODELS.map((m) => (
                      <SelectItem key={m.id} value={m.id} className="font-mono text-xs text-[#d4d4d4] focus:bg-white/5 focus:text-white">
                        {m.name} — {m.provider}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </SettingRow>
              <Separator className="bg-white/[0.04]" />
              <SettingRow label="Streaming" description="Stream responses in real-time">
                <Switch checked={streaming} onCheckedChange={setStreaming} className="data-[state=checked]:bg-[#ffb400]" />
              </SettingRow>
              <Separator className="bg-white/[0.04] my-3" />
              <h4 className="text-xs font-semibold font-mono text-[#737373] mb-3">Available Models</h4>
              <div className="space-y-2">
                {MODELS.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-mono font-medium text-[#d4d4d4]">{m.name}</p>
                        <span className="text-[9px] font-mono text-[#525252]">{m.provider}</span>
                        {m.badge && <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-[#ffb40010] text-[#ffb400]">{m.badge}</span>}
                      </div>
                      <p className="text-[10px] font-mono text-[#404040] mt-0.5">{m.description}</p>
                    </div>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full shrink-0 ${m.speed === "fast" ? "bg-green-500/10 text-green-400" : "bg-yellow-500/10 text-yellow-400"}`}>
                      {m.speed}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="data">
            <div className="glass-card rounded-2xl p-6">
              <h3 className="text-sm font-semibold font-mono text-white mb-1">Data & Export</h3>
              <Separator className="bg-white/[0.04] my-3" />
              <SettingRow label="Conversations" description="Total in your account">
                <span className="text-xs font-mono text-[#a3a3a3]">{chats?.length || 0} chats</span>
              </SettingRow>
              <Separator className="bg-white/[0.04]" />
              <SettingRow label="Export All" description="Download as Markdown">
                <Button variant="outline" size="sm" className="text-xs font-mono border-white/[0.08] text-[#a3a3a3] hover:text-white hover:bg-white/5">
                  Export <ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              </SettingRow>
            </div>
          </TabsContent>

          <TabsContent value="danger">
            <div className="glass-card rounded-2xl p-6 border-red-500/10">
              <h3 className="text-sm font-semibold font-mono text-red-400 mb-1">Danger Zone</h3>
              <Separator className="bg-white/[0.04] my-3" />
              <SettingRow label="Delete All Conversations" description={`${chats?.length || 0} chats — permanent`}>
                <Button variant="outline" size="sm" className="text-xs font-mono border-red-500/20 text-red-400 hover:bg-red-500/10" onClick={handleDeleteAll}>
                  Delete All
                </Button>
              </SettingRow>
              <Separator className="bg-white/[0.04]" />
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
