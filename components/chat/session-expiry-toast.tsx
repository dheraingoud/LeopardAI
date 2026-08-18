"use client";

// Φ-docs · fail-closed UX — visible when the Clerk session expires mid-use.
//
// Clerk's token gets stale and the next authenticated call returns 401/419
// (guarded generation routes now fail closed). The client layer refreshes +
// retries once (lib/client/retrying-fetch.ts); when the session is truly
// expired this surface tells the user their tokens are no longer minting so
// they can reconnect instead of staring at silent failures.
//
// Reads Clerk's session status; shows a dismissible amber toast when it is
// 'expired' (or when a previously-signed-in user becomes signed-out).

import { useClerk, useSession, useUser } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { LogOut, X } from "lucide-react";

export function SessionExpiryToast() {
  const { isSignedIn, isLoaded: userLoaded } = useUser();
  const { session, isLoaded: sessionLoaded } = useSession();
  const { signOut } = useClerk();
  const [dismissed, setDismissed] = useState(false);

  // A session that was loaded reads `status`; expired/ended/removed count as
  // not-active. Track whether we HAD a live session to avoid toasting on a
  // freshly-loaded visitor who was never signed in.
  const [hadSession, setHadSession] = useState(false);
  useEffect(() => {
    if (sessionLoaded && session && session.status === "active") setHadSession(true);
  }, [sessionLoaded, session]);

  const expired =
    (sessionLoaded && !!session && session.status !== "active") ||
    (userLoaded && hadSession && !isSignedIn);

  useEffect(() => {
    if (!expired) setDismissed(false);
  }, [expired]);

  if (!expired || dismissed || !hadSession) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[100] flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-amber-300/25 bg-[#161512]/95 py-2 pl-3.5 pr-2 shadow-xl shadow-black/40 backdrop-blur-xl">
        <LogOut className="h-3.5 w-3.5 shrink-0 text-amber-300" strokeWidth={1.5} />
        <span className="text-[12px] text-[#ece6d8]">
          Your session expired. Generation is paused until you reconnect.
        </span>
        <button
          type="button"
          onClick={() => void signOut({ redirectUrl: "/sign-in" })}
          className="rounded-full bg-amber-300/15 px-2.5 py-1 text-[11px] font-medium text-amber-200 transition hover:bg-amber-300/25"
        >
          Reconnect
        </button>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => setDismissed(true)}
          className="text-[#9a958a] transition hover:text-white"
        >
          <X className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}