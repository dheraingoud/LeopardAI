"use client";

import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import LandingPage from "@/components/landing-page";

export default function RootPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace("/app");
    }
  }, [isLoaded, isSignedIn, router]);

  return <LandingPage />;
}
