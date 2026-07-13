import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <SignIn
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "glass-intense !shadow-none",
            headerTitle: "font-signature !text-3xl !text-[#ffb400] text-glow-amber",
            headerSubtitle: "!dark:text-[#525252] light:text-[#8c8c8c] !font-mono !text-sm",
            socialButtonsBlockButton:
              "!dark:bg-white/[0.03] light:bg-black/[0.02] !dark:border-white/[0.08] light:border-black/[0.08] hover:!dark:bg-white/[0.06] light:bg-black/[0.04] !dark:text-[#d4d4d4] light:text-[#404040] !font-mono !text-sm",
            footer: "!hidden",
          },
        }}
        routing="path"
        path="/sign-in"
        signUpUrl="/sign-up"
        forceRedirectUrl="/app"
        fallbackRedirectUrl="/app"
      />
      {/* Required for Clerk bot protection / Smart CAPTCHA */}
      <div id="clerk-captcha" />
    </div>
  );
}
