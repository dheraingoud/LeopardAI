import type { SdkIdentity } from "leopard-cloud";

export const CORE_SDK: SdkIdentity = {
  name: "@leopard-ui/core",
  version:
    typeof __LEOPARD_PACKAGE_VERSION__ === "string"
      ? __LEOPARD_PACKAGE_VERSION__
      : "0.0.0",
};
