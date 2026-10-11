import { SignUp } from "@clerk/nextjs";

const clerkAppearance = {
  elements: {
    rootBox: "mx-auto",
    card: "glass-intense !shadow-none",
    headerTitle:
      "font-signature !text-[26px] !text-[#ffb400] text-glow-amber !whitespace-nowrap",
    headerSubtitle: "!text-[#737373] !font-mono !text-[13px]",
    socialButtonsBlockButton:
      "dark:!bg-white/[0.04] light:!bg-black/[0.03] dark:!border-white/[0.08] light:!border-black/[0.1] dark:hover:!bg-white/[0.07] light:hover:!bg-black/[0.05] dark:!text-[#d4d4d4] light:!text-[#404040] !font-mono !text-sm",
    formFieldLabel: "!font-mono !text-xs dark:!text-[#8a8a8a] light:!text-[#6b6b6b]",
    formFieldInput:
      "dark:!bg-white/[0.04] light:!bg-black/[0.03] dark:!border-white/[0.1] light:!border-black/[0.12] !font-mono focus-visible:!ring-[#ffb400]/40",
    formButtonPrimary:
      "!bg-[#ffb400] !text-black hover:!bg-[#e6a300] !font-body !text-sm active:!scale-[0.98] !transition-all",
    footer: "!hidden",
    dividerLine: "dark:!bg-white/[0.06] light:!bg-black/[0.08]",
    dividerText: "!font-mono dark:!text-[#525252] light:!text-[#8a8a8a]",
  },
};

export default function SignUpPage() {
  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <SignUp
        appearance={clerkAppearance}
        routing="path"
        path="/sign-up"
        signInUrl="/sign-in"
        forceRedirectUrl="/app"
        fallbackRedirectUrl="/app"
      />
      {/* Required for Clerk bot protection / Smart CAPTCHA */}
      <div id="clerk-captcha" />
    </div>
  );
}
