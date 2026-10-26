import type { SdkIdentity } from "leopard-cloud";

export const AI_SDK_SDK: SdkIdentity = {
  name: "@/leopard-ui/ai-sdk",
  version:
    typeof __LEOPARD_PACKAGE_VERSION__ === "string"
      ? __LEOPARD_PACKAGE_VERSION__
      : "0.0.0",
};
