"use client";

import {
  useState,
  useCallback,
  useEffect,
} from "react";
import { usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import Sidebar from "@/components/sidebar";
import { SidebarProvider } from "@/hooks/sidebar-context";
import { Menu } from "lucide-react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { isLoaded } = useUser();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [preCollapseState, setPreCollapseState] = useState(false);
  const [canvasSidebarOpen, setCanvasSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const isPlaygroundRoute = pathname.startsWith("/app/playground/");
  const isSchemaRoute = pathname.startsWith("/app/schema");
  const isAiDevRoute = pathname.startsWith("/app/ai-dev");
  const isTeachingRoute = pathname.startsWith("/app/teaching");
  const isDesktopCanvasRoute = !isMobile && (isPlaygroundRoute || isSchemaRoute || isAiDevRoute || isTeachingRoute);
  const effectiveCollapsed = isDesktopCanvasRoute ? !canvasSidebarOpen : collapsed;

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setCollapsed(true); // default to closed on mobile
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const autoCollapse = useCallback(() => {
    setPreCollapseState(collapsed);
    if (!collapsed) {
      setCollapsed(true);
    }
  }, [collapsed]);

  const restoreCollapse = useCallback(() => {
    setCollapsed(preCollapseState);
  }, [preCollapseState]);

  if (!isLoaded) return null;

  return (
    <SidebarProvider value={{ collapsed: effectiveCollapsed, setCollapsed, autoCollapse, restoreCollapse }}>
      <div className="flex h-screen w-screen bg-black overflow-hidden relative">
        {/* Mobile Sidebar Overlay */}
        {isMobile && !effectiveCollapsed && (
          <div
            className="sidebar-overlay z-40"
            onClick={() => setCollapsed(true)}
          />
        )}

        <Sidebar
          collapsed={effectiveCollapsed}
          overlayDesktop={isDesktopCanvasRoute && canvasSidebarOpen}
          onToggle={() => {
            if (isDesktopCanvasRoute) {
              setCanvasSidebarOpen((prev) => !prev);
              return;
            }
            setCollapsed(!effectiveCollapsed);
          }}
          onClose={() => {
            if (isDesktopCanvasRoute) {
              setCanvasSidebarOpen(false);
              return;
            }
            setCollapsed(true);
          }}
        />

        <main
          className="flex-1 flex flex-col min-w-0 min-h-0 bg-black relative"
          onPointerDownCapture={() => {
            if (isDesktopCanvasRoute && canvasSidebarOpen) {
              setCanvasSidebarOpen(false);
            }
          }}
        >
          {/* Mobile Header (Hamburger) */}
          {isMobile && (
            <div className="flex items-center px-4 h-12 border-b border-white/[0.04] shrink-0">
              <button
                onClick={() => setCollapsed(false)}
                className="h-8 w-8 flex items-center justify-center rounded-lg text-[#737373] hover:text-white"
              >
                <Menu className="h-4.5 w-4.5" />
              </button>
            </div>
          )}

          {/* Ambient glow */}
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
