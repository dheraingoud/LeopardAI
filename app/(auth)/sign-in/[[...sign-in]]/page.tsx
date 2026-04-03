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
            headerSubtitle: "!text-[#525252] !font-mono !text-sm",
            socialButtonsBlockButton:
              "!bg-white/[0.03] !border-white/[0.08] hover:!bg-white/[0.06] !text-[#d4d4d4] !font-mono !text-sm",
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
