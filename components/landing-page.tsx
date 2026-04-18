"use client";

import { useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, useScroll, useTransform } from "framer-motion";
import {
  ArrowRight,
  Zap,
  Shield,
  Layers,
  Sparkles,
  Code,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const FEATURES = [
  {
    icon: Zap,
    title: "Sub-Second Streaming",
    desc: "Response tokens begin flowing within 200ms. Our edge-optimised pipeline eliminates latency between you and the model.",
    stat: "~200ms",
    statLabel: "first token",
  },
  {
    icon: Shield,
    title: "Zero-Retention Privacy",
    desc: "Conversations are ephemeral by default. Data lives in your Convex instance — never shared, never trained on.",
    stat: "0",
    statLabel: "data shared",
  },
  {
    icon: Layers,
    title: "6-Model Engine",
    desc: "Route prompts to GLM-5, Kimi K2.5, DeepSeek V3.2, Qwen 300B, Llama 3 70B, or MiniMax M2.5 — one click.",
    stat: "6",
    statLabel: "models",
  },
  {
    icon: Code,
    title: "Canvas Artifacts",
    desc: "Code, HTML, SVG, Mermaid diagrams, and CSV tables render in a live side-panel with syntax highlighting and preview.",
    stat: "7+",
    statLabel: "file types",
  },
  {
    icon: Globe,
    title: "Share Conversations",
    desc: "Generate a public link for any conversation. Recipients see a read-only view — no account required.",
    stat: "1-click",
    statLabel: "share",
  },
  {
    icon: Sparkles,
    title: "Intelligent Titles",
    desc: "Every conversation auto-generates a concise title using AI. Rename inline anytime from the sidebar.",
    stat: "Auto",
    statLabel: "generated",
  },
];

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  },
};

export default function LandingPage() {
  const heroRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: imageRef,
    offset: ["start end", "end start"],
  });
  const imageY = useTransform(scrollYProgress, [0, 1], [60, -60]);
  const imageOpacity = useTransform(scrollYProgress, [0, 0.3, 0.7, 1], [0, 1, 1, 0.3]);
  const imageScale = useTransform(scrollYProgress, [0, 0.4], [0.85, 1]);

  useEffect(() => {
    let ctx: { revert: () => void } | null = null;
    import("gsap").then(({ gsap }) => {
      if (!heroRef.current) return;
      ctx = gsap.context(() => {
        gsap.to(".spot", {
          duration: 12,
          backgroundPosition: "100% 100%",
          repeat: -1,
          yoyo: true,
          ease: "none",
        });
      }, heroRef.current);
    });
    return () => ctx?.revert();
  }, []);

  return (
    <div ref={heroRef} className="relative min-h-screen flex flex-col bg-black overflow-hidden">
      {/* ── Ambient Background ── */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-[radial-gradient(circle,rgba(255,180,0,0.06)_0%,transparent_70%)]" />
        <div className="spot absolute inset-0 leopard-texture opacity-40" />
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
      </div>

      {/* ── Navigation ── */}
      <motion.nav
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="relative z-20 flex items-center justify-between px-6 sm:px-10 py-5"
      >
        <Link href="/" className="flex items-center gap-2 group">
          <span className="font-signature text-3xl text-[#ffb400] text-glow-amber transition-all group-hover:tracking-wider">
            Leopard
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/sign-in">
            <Button
              variant="ghost"
              className="text-[#a3a3a3] hover:text-white hover:bg-white/5 font-mono text-sm"
            >
              Sign In
            </Button>
          </Link>
        </div>
      </motion.nav>

      {/* ── Hero Section ── */}
      <div className="relative z-10 flex flex-col items-center justify-center px-6 text-center pt-12 pb-4">
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="max-w-4xl mx-auto"
        >
          {/* Main title */}
          <motion.h1
            variants={fadeUp}
            className="font-signature text-[clamp(4rem,12vw,10rem)] leading-[0.9] text-[#ffb400] text-glow-amber mb-6 tracking-tight"
          >
            Leopard
          </motion.h1>

          {/* Tagline */}
          <motion.p
            variants={fadeUp}
            className="text-lg sm:text-xl text-[#a3a3a3] font-mono max-w-2xl mx-auto mb-4 leading-relaxed"
          >
            Predatory precision. Lightning speed.
          </motion.p>
          <motion.p
            variants={fadeUp}
            className="text-sm text-[#525252] font-mono max-w-lg mx-auto mb-10"
          >
            A high-performance AI chat interface built for developers who demand
            clarity and speed from their tools.
          </motion.p>

          {/* CTA button — single "Start Chatting" */}
          <motion.div
            variants={fadeUp}
            className="flex justify-center mb-8"
          >
            <Link href="/sign-in">
              <Button
                size="lg"
                className="bg-[#ffb400] text-black hover:bg-[#e6a300] font-body text-base h-12 px-10 glow-amber-intense hover-lift-glow transition-all"
              >
                Start Chatting
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </motion.div>

          {/* Creator credit */}
          <motion.p
            variants={fadeUp}
            className="text-sm font-mono text-[#2a2a2a] tracking-wide"
          >
            DHERAIN GOUD <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#ffb400] align-middle mx-2" /> v1
          </motion.p>
        </motion.div>
      </div>

      {/* ── Leopard Illustration ── */}
      <div ref={imageRef} className="relative z-10 flex items-center justify-center py-10 px-6">
        <motion.div
          style={{ y: imageY, opacity: imageOpacity, scale: imageScale }}
          className="max-w-2xl w-full"
        >
          <Image
            src="/leopard.svg"
            alt="Leopard — prowling with precision"
            width={800}
            height={400}
            className="w-full h-auto drop-shadow-[0_0_60px_rgba(255,180,0,0.15)] select-none"
            draggable={false}
            priority
          />
          <div className="absolute inset-0 -z-10 flex items-center justify-center pointer-events-none">
            <div className="w-[70%] h-[60%] rounded-full bg-[radial-gradient(circle,rgba(255,180,0,0.08)_0%,transparent_65%)] blur-2xl" />
          </div>
        </motion.div>
      </div>

      {/* ── Feature Cards ── */}
      <motion.section
        variants={stagger}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-80px" }}
        className="relative z-10 px-6 sm:px-10 pb-24 pt-4"
      >
        <motion.div variants={fadeUp} className="text-center mb-12">
          <p className="text-[10px] font-mono text-[#ffb400] uppercase tracking-[0.2em] mb-2">
            Built for speed
          </p>
          <h2 className="text-xl sm:text-2xl font-display text-white font-semibold">
            Everything you need, nothing you don&apos;t
          </h2>
        </motion.div>

        <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f) => (
            <motion.div
              key={f.title}
              variants={fadeUp}
              className="group relative rounded-2xl border border-white/[0.06] bg-white/[0.015] p-6 transition-all duration-300 hover:border-[#ffb40018] hover:bg-white/[0.025] hover-lift"
            >
              <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-[radial-gradient(circle_at_50%_0%,rgba(255,180,0,0.04)_0%,transparent_60%)] pointer-events-none" />
              <div className="relative z-10">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center group-hover:bg-[#ffb40010] group-hover:border-[#ffb40015] transition-colors">
                    <f.icon className="h-4.5 w-4.5 text-[#737373] group-hover:text-[#ffb400] transition-colors" />
                  </div>
                  <div className="text-right">
                    <p className="text-base font-mono text-[#ffb400] font-bold leading-none">
                      {f.stat}
                    </p>
                    <p className="text-[9px] font-mono text-[#525252] uppercase tracking-wider mt-0.5">
                      {f.statLabel}
                    </p>
                  </div>
                </div>
                <h3 className="text-sm font-semibold text-white mb-2 font-mono">
                  {f.title}
                </h3>
                <p className="text-xs text-[#737373] font-mono leading-[1.7]">
                  {f.desc}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* ── Footer ── */}
      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
        className="relative z-10 text-center py-6 border-t border-white/[0.03]"
      >
        <p className="text-xs text-[#404040] font-mono">
          © {new Date().getFullYear()} Leopard · Built with precision
        </p>
      </motion.footer>
    </div>
  );
}
