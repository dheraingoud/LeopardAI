import { resource } from "@/aui/tap";
import type { MCPStorage } from "./types";

const useMcpCustomStorage = (impl: MCPStorage): MCPStorage => {
  return impl;
};

export const McpCustomStorage = resource(useMcpCustomStorage);
