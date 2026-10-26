import { resource } from "@/leopard-ui/tap";
import { useMemo } from "react";
import { generateId } from "@/leopard-ui/core";
import type { MCPCustomServerRecord } from "../../mcp-scope";
import type { MCPPersistedAuthState } from "../../auth/types";
import type { MCPStorage } from "./types";

const useMcpMemoryStorage = (): MCPStorage =>
  useMemo(() => {
    let servers: MCPCustomServerRecord[] = [];
    const auth = new Map<string, MCPPersistedAuthState>();
    return {
      // Each memory store is its own private data: a distinct instance is a
      // distinct scope, so replacing one keys a reconnect.
      scopeId: `memory:${generateId()}`,
      loadCustomServers: async () => [...servers],
      saveCustomServers: async (records) => {
        servers = [...records];
      },
      loadAuthState: async (id) => auth.get(id) ?? null,
      saveAuthState: async (id, state) => {
        auth.set(id, state);
      },
      clearAuthState: async (id) => {
        auth.delete(id);
      },
    };
  }, []);

export const McpMemoryStorage = resource(useMcpMemoryStorage);
