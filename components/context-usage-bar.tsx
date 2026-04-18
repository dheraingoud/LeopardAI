"use client";

import { AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface ContextUsageBarProps {
  percentUsed: number;
  usedTokens: number;
  maxTokens: number;
  className?: string;
}

export default function ContextUsageBar({
  percentUsed,
  usedTokens,
  maxTokens,
  className,
}: ContextUsageBarProps) {
  const clampedPercent = Math.min(100, Math.max(0, percentUsed));
  const isNear = clampedPercent > 85;
  const isOver = clampedPercent > 95;

  const fillColor =
    clampedPercent < 50
      ? "#22c55e"
      : clampedPercent < 80
        ? "#ffb400"
        : "#ef4444";

  const tooltipText = `${(usedTokens / 1000).toFixed(1)}K / ${(maxTokens / 1000).toFixed(0)}K tokens used`;

  return (
    <div className={cn("relative group", className)} title={tooltipText}>
      <motion.div
        className="relative h-3 w-full cursor-pointer overflow-hidden rounded-full bg-white/[0.04] transition-all duration-300 hover:h-6"
        layout
      >
        {/* Static fill */}
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          animate={{ width: `${clampedPercent}%` }}
          transition={{ type: "spring", stiffness: 200, damping: 25 }}
          style={{
            backgroundColor: fillColor,
            boxShadow: `0 0 8px 1px ${fillColor}66, 0 0 16px 2px ${fillColor}33`,
          }}
        />

        {/* Pulse overlay — amber when near limit, red when over */}
        {isOver && (
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full"
            animate={{ width: `${clampedPercent}%` }}
            style={{ backgroundColor: fillColor }}
            transition={{ type: "spring", stiffness: 200, damping: 25 }}
          >
            <div
              className="absolute inset-0 rounded-full animate-pulse"
              style={{
                backgroundColor: fillColor,
                boxShadow: `0 0 12px 4px #ef444488, 0 0 24px 6px #ef444466`,
              }}
            />
          </motion.div>
        )}
        {isNear && !isOver && (
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full"
            animate={{ width: `${clampedPercent}%` }}
            transition={{ type: "spring", stiffness: 200, damping: 25 }}
          >
            <div
              className="absolute inset-0 rounded-full animate-pulse"
              style={{
                backgroundColor: fillColor,
                boxShadow: `0 0 10px 3px #ffb40077, 0 0 20px 4px #ffb40055`,
              }}
            />
          </motion.div>
        )}
      </motion.div>

      {(isNear || isOver) && (
        <div className="absolute right-0 top-1/2 -translate-y-1/2 pl-2">
          <AlertTriangle
            className={cn(
              "h-3.5 w-3.5",
              isOver ? "text-red-500" : "text-amber-500"
            )}
          />
        </div>
      )}
    </div>
  );
}