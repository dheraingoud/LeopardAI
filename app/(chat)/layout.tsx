"use client";

import { useState, useCallback, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import Sidebar from "@/components/sidebar";
import { SidebarProvider } from "@/hooks/sidebar-context";
import { Menu } from "lucide-react";

/**
 * Chat shell — flat layout (replaces the old workspace-branched app/app/layout.tsx).
 *
 * Drops every dead workspace branch (isPlaygroundRoute / isSchemaRoute /
 * isAiDevRoute / isTeachingRoute / canvasSidebarOpen / overlayDesktop). The
 * sidebar + ambient glow + mobile overlay + auto-collapse-for-canvas remain
 * so the transplanted chat surface keeps working until Phase 5 swaps it for the
 * vercel-chatbot component tree.
 */
export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isLoaded } = useUser();
  const [collapsed, setCollapsed] = useState(false);
  const [preCollapseState, setPreCollapseState] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setCollapsed(true); // default closed on mobile
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const autoCollapse = useCallback(() => {
    setPreCollapseState(collapsed);
    if (!collapsed) setCollapsed(true);
  }, [collapsed]);

  const restoreCollapse = useCallback(() => {
    setCollapsed(preCollapseState);
  }, [preCollapseState]);

  if (!isLoaded) return null;

  return (
    <SidebarProvider
      value={{ collapsed, setCollapsed, autoCollapse, restoreCollapse }}
    >
      <div className="flex h-screen w-screen bg-background overflow-hidden relative">
        {/* Mobile overlay */}
        {isMobile && !collapsed && (
          <div
            className="sidebar-overlay z-40"
            onClick={() => setCollapsed(true)}
          />
        )}

        <Sidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed((c) => !c)}
          onClose={() => setCollapsed(true)}
        />

        <main className="flex-1 flex flex-col min-w-0 min-h-0 bg-background chat-paper-identity relative">
          {/* Mobile header (hamburger) */}
          {isMobile && (
            <div className="flex items-center px-4 h-12 border-b dark:border-white/[0.04] light:border-black/[0.05] shrink-0">
              <button
                onClick={() => setCollapsed(false)}
                className="h-10 w-10 flex items-center justify-center rounded-lg dark:text-[#737373] light:text-[#737373] hover:dark:text-white light:text-[#171717]"
              >
                <Menu className="h-4.5 w-4.5" />
              </button>
            </div>
          )}

          {/* Ambient amber glow */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[radial-gradient(circle,rgba(255,180,0,0.015)_0%,transparent_70%)] opacity-50 sm:opacity-100" />
          </div>

          <div className="relative z-10 flex-1 flex flex-col min-h-0">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
