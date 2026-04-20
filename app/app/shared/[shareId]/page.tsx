"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { motion } from "framer-motion";
import { ExternalLink, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import MessageList from "@/components/message-list";

export default function SharedChatPage() {
  const params = useParams();
  const shareId = params.shareId as string;

  const chat = useQuery(api.chats.getByShareId, { shareId });
  const messages = useQuery(api.messages.list, chat ? { chatId: chat._id } : "skip");

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between px-4 py-2.5 bg-[#ffb40008] border-b border-[#ffb40010] shrink-0"
      >
        <div className="flex items-center gap-2">
          <ExternalLink className="h-3.5 w-3.5 text-[#ffb400]" />
          <span className="text-xs font-mono text-[#a3a3a3]">
            Shared via <span className="text-[#ffb400] font-signature text-base">Leopard</span>
          </span>
        </div>
        <Link href="/sign-up">
          <Button size="sm" className="bg-[#ffb400] text-black hover:bg-[#e6a300] font-mono text-xs h-7 px-3">
            Try Leopard <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        </Link>
      </motion.div>

      <div className="px-4 py-3 border-b border-white/[0.03] shrink-0">
        <h2 className="text-sm font-mono text-[#a3a3a3]">{chat?.title || "Shared Conversation"}</h2>
        <p className="text-[10px] font-mono text-[#2a2a2a] mt-0.5">Shared publicly · Read-only</p>
      </div>

      {messages ? (
        <MessageList messages={messages} />
      ) : chat === null ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm font-mono text-[#404040]">This shared chat is not available</p>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 w-[500px] rounded-xl bg-white/[0.02] animate-pulse" />
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-white/[0.03] p-4 text-center shrink-0">
        <p className="text-xs font-mono text-[#404040] mb-3">Start your own conversations with Leopard</p>
        <Link href="/sign-up">
          <Button className="bg-[#ffb400] text-black hover:bg-[#e6a300] font-mono text-sm">
            Get Started <ArrowRight className="h-4 w-4 ml-1.5" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
