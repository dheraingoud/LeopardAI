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
  Mic,
  SquareTerminal,
  GitBranch,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// Copy reflects the live app (2026-10): the actual fleet, tools, and surfaces —
// no invented stats. Icons lucide only (anti-emoji).
const FEATURES = [
  {
    icon: Layers,
    title: "Nine-model engine",
    desc: "Route between Kimi K3, GLM 5.3, Nemotron Lightning, DeepSeek Flash, Muse Glimmer, Laguna, Gemma, and DiffusionGemma. Health-checked live, slow-but-up never reads as down.",
    stat: "9",
    statLabel: "models live",
    span: "lg:col-span-2",
  },
  {
    icon: Shield,
    title: "Tool approvals",
    desc: "Web fetches, document writes, and agent teams gate behind a card you answer. The turn holds open until you decide — never silently proceeds.",
    stat: "Hold",
    statLabel: "to resume",
    span: "",
  },
  {
    icon: SquareTerminal,
    title: "Run code inline",
    desc: "JavaScript and TypeScript blocks get a Run button — executed in a sandboxed frame, output pinned under the snippet.",
    stat: "Sandbox",
    statLabel: "iframe",
    span: "",
  },
  {
    icon: GitBranch,
    title: "Sub-agent teams",
    desc: "One prompt fans out into named research and write agents. Watch the orchestration card settle as each returns.",
    stat: "Multi",
    statLabel: "agent",
    span: "lg:col-span-2",
  },
  {
    icon: Code,
    title: "Artifacts panel",
    desc: "Documents, HTML, SVG, Mermaid, and tables render beside the chat — versioned, downloadable, persistent.",
    stat: "Side",
    statLabel: "panel",
    span: "",
  },
  {
    icon: Mic,
    title: "Dictate",
    desc: "Speak instead of type. Web Speech dictation lands straight in the composer with interim preview.",
    stat: "Voice",
    statLabel: "input",
    span: "",
  },
];

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  },
};

export default function LandingPage() {
  const heroRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: imageRef,
    offset: ["start end", "end start"],
  });
  const imageY = useTransform(scrollYProgress, [0, 1], [50, -50]);
  const imageOpacity = useTransform(scrollYProgress, [0, 0.3, 0.7, 1], [0, 1, 1, 0.25]);
  const imageScale = useTransform(scrollYProgress, [0, 0.4], [0.88, 1]);

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
    <main ref={heroRef} className="relative min-h-[100dvh] flex flex-col dark:bg-black light:bg-white overflow-x-hidden w-full">
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
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15 }}
        className="relative z-20 flex items-center justify-between px-6 sm:px-10 py-5"
      >
        <Link href="/" className="flex items-center gap-2 group">
          <span className="font-signature text-3xl text-[#ffb400] text-glow-amber transition-all group-hover:tracking-wider">
            Leopard
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/sign-in">
            <Button
              variant="ghost"
              className="dark:text-[#a3a3a3] light:text-[#525252] hover:dark:text-white hover:light:text-black hover:dark:bg-white/5 hover:light:bg-black/5 font-mono text-sm"
            >
              Sign In
            </Button>
          </Link>
          <Link href="/sign-in">
            <Button className="bg-[#ffb400] text-black hover:bg-[#e6a300] font-body text-sm h-9 px-5 active:scale-[0.97] transition-transform">
              Open app
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </motion.nav>

      {/* ── Hero ── */}
      <div className="relative z-10 flex flex-col items-center justify-center px-6 text-center pt-14 pb-6">
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="w-full max-w-5xl mx-auto"
        >
          <motion.h1
            variants={fadeUp}
            className="font-signature leading-[0.95] mb-6 tracking-tight text-[clamp(3.5rem,11vw,8.5rem)] dark:text-[#ffb400] light:text-[#b07d00] dark:[text-shadow:0_0_20px_rgba(255,180,0,0.3),0_0_40px_rgba(255,180,0,0.15)] light:[text-shadow:0_1px_0_rgba(255,255,255,0.6)]"
          >
            Leopard
          </motion.h1>

          <motion.p
            variants={fadeUp}
            className="text-lg sm:text-xl dark:text-[#a3a3a3] light:text-[#525252] font-mono max-w-2xl mx-auto mb-3 leading-relaxed"
          >
            Predatory precision. Lightning speed.
          </motion.p>
          <motion.p
            variants={fadeUp}
            className="text-sm dark:text-[#525252] light:text-[#737373] font-mono max-w-xl mx-auto mb-9"
          >
            A multi-model chat workbench — streaming, tools, agents, and
            artifacts in one pane, with your data in your own Convex instance.
          </motion.p>

          <motion.div variants={fadeUp} className="flex items-center justify-center gap-3 mb-10">
            <Link href="/sign-in">
              <Button
                size="lg"
                className="bg-[#ffb400] text-black hover:bg-[#e6a300] font-body text-base h-12 px-9 glow-amber-intense active:scale-[0.97] transition-all"
              >
                Start chatting
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <a href="#features">
              <Button
                size="lg"
                variant="ghost"
                className="font-mono text-sm h-12 px-6 dark:text-[#a3a3a3] light:text-[#525252] hover:dark:text-white hover:light:text-black active:scale-[0.97] transition-all"
              >
                See what's inside
              </Button>
            </a>
          </motion.div>

          <motion.p
            variants={fadeUp}
            className="text-[11px] font-mono dark:text-[#3a3a3a] light:text-[#a8a29e] tracking-[0.18em] uppercase"
          >
            Dherain Goud <span className="inline-block w-1 h-1 rounded-full bg-[#ffb400] align-middle mx-2" /> v1
          </motion.p>
        </motion.div>
      </div>

      {/* ── Leopard Illustration ── */}
      <div ref={imageRef} className="relative z-10 flex items-center justify-center py-8 px-6">
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

      {/* ── Features: asymmetric bento, zero dead cells ── */}
      <motion.section
        id="features"
        variants={stagger}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-60px" }}
        className="relative z-10 px-6 sm:px-10 pb-24 pt-10"
      >
        <motion.div variants={fadeUp} className="text-left max-w-5xl mx-auto mb-10">
          <p className="text-[10px] font-mono text-[#ffb400] uppercase tracking-[0.2em] mb-2">
            Inside the workbench
          </p>
          <h2 className="text-xl sm:text-2xl font-display dark:text-white light:text-[#171717] font-semibold tracking-tight">
            Everything the chat surface actually does
          </h2>
        </motion.div>

        <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 grid-flow-dense">
          {FEATURES.map((f) => (
            <motion.div
              key={f.title}
              variants={fadeUp}
              className={`group relative rounded-2xl border dark:border-white/[0.06] light:border-black/[0.07] dark:bg-white/[0.015] light:bg-black/[0.015] p-6 transition-all duration-300 dark:hover:border-[#ffb40022] light:hover:border-[#d4960022] dark:hover:bg-white/[0.03] light:hover:bg-black/[0.02] hover:-translate-y-0.5 ${f.span}`}
            >
              <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-[radial-gradient(circle_at_50%_0%,rgba(255,180,0,0.05)_0%,transparent_60%)] pointer-events-none" />
              <div className="relative z-10">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-10 h-10 rounded-xl dark:bg-white/[0.04] light:bg-black/[0.035] border dark:border-white/[0.06] light:border-black/[0.06] flex items-center justify-center transition-colors group-hover:dark:bg-[#ffb400]/10 group-hover:light:bg-[#d49600]/10">
                    <f.icon strokeWidth={1.75} className="h-[18px] w-[18px] dark:text-[#8a8a8a] light:text-[#737373] group-hover:text-[#ffb400] transition-colors" />
                  </div>
                  <div className="text-right">
                    <p className="text-base font-mono text-[#ffb400] font-semibold leading-none tabular-nums">
                      {f.stat}
                    </p>
                    <p className="text-[9px] font-mono dark:text-[#525252] light:text-[#8a8a8a] uppercase tracking-wider mt-1">
                      {f.statLabel}
                    </p>
                  </div>
                </div>
                <h3 className="text-sm font-semibold dark:text-white light:text-[#171717] mb-1.5 font-mono tracking-tight">
                  {f.title}
                </h3>
                <p className="text-xs dark:text-[#737373] light:text-[#6b6b6b] font-mono leading-[1.7]">
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
        transition={{ delay: 1 }}
        className="relative z-10 text-center py-6 border-t dark:border-white/[0.04] light:border-black/[0.05]"
      >
        <p className="text-[11px] dark:text-[#404040] light:text-[#a3a3a3] font-mono">
          © {new Date().getFullYear()} Leopard · Built with precision
        </p>
      </motion.footer>
    </main>
  );
}
