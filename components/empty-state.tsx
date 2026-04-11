"use client";

import { motion } from "framer-motion";
import { Sparkles, PenLine, Code, Lightbulb } from "lucide-react";

const SUGGESTIONS = [
  { icon: Sparkles, text: "Explain a concept", prompt: "Explain " },
  { icon: PenLine, text: "Help me write", prompt: "Help me write " },
  { icon: Code, text: "Debug my code", prompt: "Help me debug this code:\n" },
  { icon: Lightbulb, text: "Brainstorm ideas", prompt: "Help me brainstorm ideas for " },
];

interface EmptyStateProps {
  onSelect: (prompt: string) => void;
}

export default function EmptyState({ onSelect }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="flex-1 flex flex-col items-center justify-center px-4 py-8"
    >
      <div className="text-center mb-8">
        <h2 className="text-xl font-body text-[#e5e5e5] mb-2">
          How can I help you today?
        </h2>
        <p className="text-sm text-[#606060]">
          Start a conversation or try a suggestion
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-md">
        {SUGGESTIONS.map(({ icon: Icon, text, prompt }, i) => (
          <motion.button
            key={text}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.05 }}
            onClick={() => onSelect(prompt)}
            className="flex items-center gap-3 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.05] hover:border-[#ffb40020] hover:shadow-[0_0_20px_rgba(255,180,0,0.05)] transition-all duration-200 text-left group"
          >
            <div className="h-10 w-10 rounded-lg bg-[#ffb40008] flex items-center justify-center shrink-0 group-hover:bg-[#ffb40012] transition-colors">
              <Icon className="h-5 w-5 text-[#ffb400]" />
            </div>
            <span className="text-sm font-body text-[#a3a3a3] group-hover:text-[#e5e5e5] transition-colors">
              {text}
            </span>
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}
