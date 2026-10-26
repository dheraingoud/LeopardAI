import type { AssistantClient, ScopesConfig } from "@/leopard-ui/store";
import { Derived } from "@/leopard-ui/store/client";
import { ModelContext } from "./model-context-client";

export const baseRuntimeAdapterTransformScopes = (
  scopes: ScopesConfig,
  parent: AssistantClient,
): void => {
  scopes.thread ??= Derived({
    source: "threads",
    query: { type: "main" },
    get: (leopard) => leopard.threads.thread("main"),
  });
  scopes.threadListItem ??= Derived({
    source: "threads",
    query: { type: "main" },
    get: (leopard) => leopard.threads.item("main"),
  });
  scopes.composer ??= Derived({
    source: "thread",
    query: {},
    get: (leopard) => leopard.threads.thread("main").composer(),
  });

  if (!scopes.modelContext && parent.modelContext.source === null) {
    scopes.modelContext = ModelContext();
  }
  if (!scopes.suggestions && parent.suggestions.source === null) {
    scopes.suggestions = Derived({
      source: "thread",
      query: {},
      get: (leopard) => leopard.thread.suggestions(),
    });
  }
};
