import type { SdkIdentity } from "@/aui/cloud";

export const AI_SDK_SDK: SdkIdentity = {
  name: "@/aui/ai-sdk",
  version:
    typeof __AUI_PACKAGE_VERSION__ === "string"
      ? __AUI_PACKAGE_VERSION__
      : "0.0.0",
};
