// Re-export from @/aui/core
export type {
  ThreadRuntimeCore,
  ThreadListRuntimeCore,
} from "@/aui/core";

// Re-export from @/aui/core/internal
export {
  DefaultThreadComposerRuntimeCore,
  CompositeContextProvider,
  MessageRepository,
  BaseAssistantRuntimeCore,
  AssistantRuntimeImpl,
  ThreadRuntimeImpl,
  getAutoStatus,
} from "@/aui/core/internal";
export type {
  ThreadRuntimeCoreBinding,
  ThreadListItemRuntimeBinding,
} from "@/aui/core/internal";

// React-specific (stay in react)
export { splitLocalRuntimeOptions } from "@/aui/core/react";
export type { ToolExecutionStatus } from "@/aui/core";

export { useSmooth } from "./utils/smooth/useSmooth";
export {
  useSmoothStatus,
  withSmoothContextProvider,
} from "./utils/smooth/SmoothContext";

// ComposerInput plugin registry (used by react-lexical)
export { useComposerInputPluginRegistryOptional } from "./primitives/composer/ComposerInputPluginContext";
