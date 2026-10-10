"use client";

// Reduced-motion gate for framer-motion (audit 2026-10-10): every motion.div
// in the app animated regardless of the OS setting; MotionConfig hands the
// library the user's preference and framer disables transforms+opacity
// transitions when prefers-reduced-motion is on.
import { MotionConfig } from "framer-motion";

export function MotionConfigProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
