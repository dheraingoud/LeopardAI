"use client";

import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { motion } from "framer-motion";
import { Sparkles, Code, BookOpen, Database, Bug } from "lucide-react";
import InputBar from "@/components/input-bar";
import { SUGGESTED_PROMPTS } from "@/types";
import { persistImagesForMessage, sanitizeMessageForStorage } from "@/lib/image-cache";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  code: Code,
  book: BookOpen,
  database: Database,
  bug: Bug,
};

export default function AppHomePage() {
  const router = useRouter();
  const { user } = useUser();
  const createChat = useMutation(api.chats.create);
  const sendMessage = useMutation(api.messages.send);

  const handleSend = async (
    message: string,
    model: string,
    options?: { inlineImages?: string[] },
  ) => {
    if (!user) return;

    // Create chat in Convex (fast call)
    const chatId = await createChat({
      userId: user.id,
      title: "New Chat",
      model,
    });

    const imageMarkdown = (options?.inlineImages || [])
      .map((url) => `![Attached image](${url})`)
      .join("\n\n");

    const contentForStorage = imageMarkdown
      ? `${message}\n\n${imageMarkdown}`.trim()
      : message;

    const sanitized = sanitizeMessageForStorage(contentForStorage);

    // Send the first message in the background
    const userMessageId = await sendMessage({
      chatId,
      userId: user.id,
      role: "user",
      content: sanitized.content,
    });

    if (sanitized.images.length > 0) {
      await persistImagesForMessage(String(userMessageId), sanitized.images);
    }

    // Auto-title in background
    fetch("/api/title", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: message || "New Chat" }),
    }).catch(() => {});

    // Redirect to the chat page
    router.push(`/app/chat/${chatId}`);
  };

  const handlePromptClick = (prompt: { title: string; description: string }) => {
    handleSend(`${prompt.title} ${prompt.description}`, "minimax-m2.5");
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 sm:py-12">
      <motion.div
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.08, delayChildren: 0.15 } } }}
        className="w-full max-w-3xl space-y-8 sm:space-y-10"
      >
        {/* Greeting */}
        <motion.div
          variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.5 } } }}
          className="text-center space-y-2"
        >
          <div className="flex items-center justify-center gap-2 mb-1">
            <Sparkles className="h-5 w-5 text-[#ffb400]" />
          </div>
          <h1 className="text-xl sm:text-2xl font-semibold text-white font-mono">
            How can I help you today?
          </h1>
          <p className="text-[12px] sm:text-sm text-[#525252] font-mono uppercase tracking-widest sr-only">
            leopard
          </p>
        </motion.div>

        {/* Suggested Prompts */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {SUGGESTED_PROMPTS.map((prompt) => {
            const Icon = ICON_MAP[prompt.icon] || Code;
            return (
              <motion.button
                key={prompt.title}
                variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.5 } } }}
                onClick={() => handlePromptClick(prompt)}
                className="glass-card rounded-xl p-3 sm:p-4 text-left border-white/[0.03] hover:border-[#ffb40015] transition-all duration-200 group cursor-pointer"
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/[0.03] flex items-center justify-center shrink-0 group-hover:bg-[#ffb40010] transition-colors">
                    <Icon className="h-3.5 w-3.5 text-[#525252] group-hover:text-[#ffb400] transition-colors" />
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-mono text-[#d4d4d4] font-medium group-hover:text-white transition-colors">
                      {prompt.title}
                    </p>
                    <p className="text-[10px] sm:text-xs font-mono text-[#333] mt-0.5 group-hover:text-[#555] transition-colors">
                      {prompt.description}
                    </p>
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>

        {/* Input */}
        <motion.div
          variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.5 } } }}
          className="pt-2"
        >
          <InputBar onSend={handleSend} />
        </motion.div>
      </motion.div>
    </div>
  );
}
