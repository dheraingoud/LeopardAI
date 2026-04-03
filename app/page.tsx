"use client";

import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import LandingPage from "@/components/landing-page";

export default function RootPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn) {
      router.replace("/app");
    } else {
      setReady(true);
    }
  }, [isLoaded, isSignedIn, router]);

  // Show spinner while loading or redirecting
  if (!ready) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-7 h-7 border-2 border-[#ffb400]/20 border-t-[#ffb400] rounded-full animate-spin" />
      </div>
    );
  }

  return <LandingPage />;
}
