/// <reference path="../../core/src/react/index.ts" preserve="true" />

// Re-export from @/leopard-ui/store
export {
  useLeopard,
  LeopardProvider,
  LeopardConfig,
  useLeopardState,
  useLeopardEvent,
  LeopardIf,
  type AssistantClient,
  type AssistantState,
  type AssistantEventScope,
  type AssistantEventSelector,
  type AssistantEventName,
  type AssistantEventPayload,
  type AssistantEventCallback,
} from "@/leopard-ui/store";

// Re-export public runtime types from @/leopard-ui/core
export type {
  AssistantRuntime,
  ThreadRuntime,
  ThreadState,
  ThreadRuntimeState,
  CreateAppendMessage,
  CreateStartRunConfig,
  CreateResumeRunConfig,
  MessageRuntime,
  MessageState,
  MessageRuntimeState,
  MessagePartRuntime,
  MessagePartState,
  ComposerRuntime,
  ThreadComposerRuntime,
  EditComposerRuntime,
  EditComposerState,
  ThreadComposerState,
  ComposerState,
  ComposerRuntimeState,
  AttachmentRuntime,
  AttachmentState,
  AttachmentRuntimeState,
  ThreadListRuntime,
  ThreadListState,
  ThreadListItemRuntime,
  ThreadListItemState,
  ThreadListItemRuntimeState,
} from "@/leopard-ui/core";

export { toolApprovalAcceptsText } from "@/leopard-ui/core";

export { useCloudThreadListRuntime } from "@/leopard-ui/core/react";
export { AssistantCloud, readAnonymousRefreshToken } from "leopard-cloud";

// --- adapters/attachment ---
export type { AttachmentAdapter } from "@/leopard-ui/core";
export {
  SimpleImageAttachmentAdapter,
  SimpleTextAttachmentAdapter,
  CompositeAttachmentAdapter,
} from "@/leopard-ui/core";
export { CloudFileAttachmentAdapter } from "@/leopard-ui/core/react";

// --- adapters/voice ---
export type { RealtimeVoiceAdapter } from "@/leopard-ui/core";
export { createVoiceSession } from "@/leopard-ui/core";
export {
  OpenAIRealtimeVoiceAdapter,
  type OpenAIRealtimeVoiceAdapterOptions,
} from "./adapters/OpenAIRealtimeVoiceAdapter";
export type {
  VoiceSessionControls,
  VoiceSessionHelpers,
  VoiceSessionState,
} from "@/leopard-ui/core";
export {
  useVoiceState,
  useVoiceVolume,
  useVoiceControls,
} from "@/leopard-ui/core/react";

// --- adapters/feedback ---
export type { FeedbackAdapter } from "@/leopard-ui/core";

// --- adapters/speech ---
export type {
  SpeechSynthesisAdapter,
  DictationAdapter,
} from "@/leopard-ui/core";
export {
  WebSpeechSynthesisAdapter,
  WebSpeechDictationAdapter,
} from "@/leopard-ui/core";

// --- adapters/suggestion ---
export type {
  SuggestionAdapter,
  SuggestionAdapterGenerateOptions,
  CreateSuggestionAdapterOptions,
} from "@/leopard-ui/core";
export { createSuggestionAdapter } from "@/leopard-ui/core";

// --- adapters/RuntimeAdapterProvider ---
export {
  RuntimeAdapterProvider,
  useRuntimeAdapters,
  type RuntimeAdapters,
} from "@/leopard-ui/core/react";

// --- adapters/thread-history ---
export type {
  ThreadHistoryAdapter,
  GenericThreadHistoryAdapter,
  MessageFormatAdapter,
  MessageFormatItem,
  MessageFormatRepository,
  MessageStorageEntry,
} from "@/leopard-ui/core";

// --- assistant-transport ---
export {
  useAssistantTransportRuntime,
  useAssistantTransportSendCommand,
  useAssistantTransportState,
} from "./assistant-transport";
export type {
  AssistantTransportConnectionMetadata,
  AssistantTransportCommand,
  AssistantTransportProtocol,
  SendCommandsRequestBody,
} from "./assistant-transport";

// --- core ---
export type {
  AddToolResultOptions,
  SubmitFeedbackOptions,
  ThreadSuggestion,
  ComposerSubmission,
  DictationState,
} from "@/leopard-ui/core";

// --- external-store ---
export type { ThreadMessageLike } from "@/leopard-ui/core";
export { fromThreadMessageLike, generateId } from "@/leopard-ui/core";
export {
  getExternalStoreMessages,
  bindExternalStoreMessage,
  pickExternalStoreSharedOptions,
} from "@/leopard-ui/core";
export type {
  ExternalStoreAdapter,
  ExternalStoreMessageConverter,
  ExternalStoreSharedOptions,
  ExternalStoreThreadListAdapter,
  ExternalStoreThreadData,
  ExternalStoreBranchChange,
} from "@/leopard-ui/core";
export { MessageNotSentError, isMessageNotSentError } from "@/leopard-ui/core";
export {
  createMessageQueue,
  type MessageQueueDriver,
  type MessageQueueController,
  type ExternalThreadQueueAdapter,
  type ExternalThreadBranchAdapter,
} from "@/leopard-ui/core";
export { useExternalStoreRuntime } from "@/leopard-ui/core/react";
export { useExternalStoreSharedOptions } from "@/leopard-ui/core/react";
export {
  useExternalMessageConverter,
  /** @deprecated Experimental since 2025-01-26. Not scheduled for removal; the API may change in any release. */
  convertExternalMessages as unstable_convertExternalMessages,
  /** @deprecated Experimental since 2026-09-15. Not scheduled for removal; the API may change in any release. */
  createExternalMessageConversionCache as unstable_createExternalMessageConversionCache,
  /** @deprecated Experimental since 2026-09-15. Not scheduled for removal; the API may change in any release. */
  type ExternalMessageConversionCache as Unstable_ExternalMessageConversionCache,
} from "@/leopard-ui/core/react";
export {
  /** @deprecated Experimental since 2025-02-02. Not scheduled for removal; the API may change in any release. */
  createMessageConverter as unstable_createMessageConverter,
} from "@/leopard-ui/core/react";

// --- local ---
export type {
  ChatModelAdapter,
  ChatModelRunOptions,
  ChatModelRunResult,
  ChatModelRunUpdate,
  LocalRuntimeOptionsBase,
} from "@/leopard-ui/core";
export { useLocalRuntime } from "@/leopard-ui/core/react";
export type { LocalRuntimeOptions } from "@/leopard-ui/core/react";

// --- remote-thread-list ---
export { useRemoteThreadListRuntime } from "@/leopard-ui/core/react";
export { useCloudThreadListAdapter } from "@/leopard-ui/core/react";
export type {
  RemoteThreadListAdapter,
  RemoteThreadListProviderComponent,
} from "@/leopard-ui/core";
export { InMemoryThreadListAdapter } from "@/leopard-ui/core";

// Re-export from @/leopard-ui/core (runtime-cores root)
export type { ExportedMessageRepositoryItem } from "@/leopard-ui/core";
export { ExportedMessageRepository } from "@/leopard-ui/core";

export * from "./context";

// Re-export shared from core/react
export {
  makeAssistantTool,
  type AssistantTool,
  makeAssistantToolUI,
  type AssistantToolUI,
  makeAssistantDataUI,
  type AssistantDataUI,
  useAssistantTool,
  type AssistantToolProps,
  useAssistantToolUI,
  type AssistantToolUIProps,
  useAssistantDataUI,
  type AssistantDataUIProps,
  useAssistantInstructions,
  useAssistantContext,
  type AssistantContextConfig,
  useInlineRender,
  type Toolkit,
  type ToolDefinition,
  type ToolCallText,
  type ToolkitDefinition,
  type ToolkitDefinitionEntry,
  defineToolkit,
  stubTool,
  externalTool,
  useLeopardToolOverrides,
  hitl,
  hitlTool,
  humanTool,
  providerTool,
  type ProviderToolConfig,
  defineMcpToolkit,
  type McpToolkitEntry,
  type McpToolkitDefinition,
  type McpToolkitToolConfig,
  Tools,
  DataRenderers,
  Interactables,
  useAssistantInteractable,
  type AssistantInteractableProps,
  useInteractableState,
  unstable_Interactables,
  unstable_useInteractable,
  type Unstable_InteractableConfig,
  type Unstable_InferInteractableState,
  type Unstable_InteractableVersionInfo,
  unstable_useInteractableState,
  unstable_useInteractableVersions,
  unstable_interactableTool,
  type Unstable_InteractableToolConfig,
  type Unstable_InteractableToolRenderProps,
  type Unstable_InteractableStateSchema,
  type Unstable_InteractablesState,
  type Unstable_InteractableDefinition,
  type Unstable_InteractableRegistration,
  type Unstable_InteractablesMethods,
  type Unstable_InteractablePersistedState,
  type Unstable_InteractablePersistenceAdapter,
  type Unstable_InteractablePersistenceStatus,
  type Unstable_InteractablesClientSchema,
  type Unstable_InteractablesConfig,
  useToolArgsStatus,
  type ToolArgsStatus,
} from "@/leopard-ui/core/react";

export type {
  ModelContext,
  ModelContextOptions,
  ModelContextProvider,
  SystemPart,
  LanguageModelConfig,
  LanguageModelV1CallSettings,
} from "@/leopard-ui/core";

export { mergeModelContexts } from "@/leopard-ui/core";

export {
  unstable_getInteractableSnapshots,
  unstable_formatInteractableSnapshot,
  unstable_getInteractableVersions,
  type Unstable_InteractableSnapshotEntry,
  type Unstable_InteractableVersion,
} from "@/leopard-ui/core";

export type { Tool } from "leopard-stream";

export { tool } from "@/leopard-ui/core";

export { Suggestions, type SuggestionConfig } from "@/leopard-ui/core/store";
export type {
  QueueItemState,
  TaskState,
  TaskMethods,
  QueueItemMethods,
} from "@/leopard-ui/core/store";
export type { ComposerSendOptions } from "@/leopard-ui/core/store";
export type { ComposerTextOrigin } from "@/leopard-ui/core";

export { makeAssistantVisible } from "./model-context/makeAssistantVisible";

// --- model-context/registry ---
export { ModelContextRegistry } from "@/leopard-ui/core";
export type {
  ModelContextRegistryToolHandle,
  ModelContextRegistryInstructionHandle,
  ModelContextRegistryProviderHandle,
} from "@/leopard-ui/core";

// --- model-context/frame ---
export { AssistantFrameHost } from "@/leopard-ui/core";
export { AssistantFrameProvider } from "@/leopard-ui/core";
export type {
  SerializedTool,
  SerializedModelContext,
  FrameMessageType,
  FrameMessage,
} from "@/leopard-ui/core";
export { FRAME_MESSAGE_CHANNEL } from "@/leopard-ui/core";
export { useAssistantFrameHost } from "./model-context/frame/useAssistantFrameHost";

export * as ActionBarPrimitive from "./primitives/actionBar";
export * as ActionBarMorePrimitive from "./primitives/actionBarMore";
export * as AssistantModalPrimitive from "./primitives/assistantModal";
export * as AttachmentPrimitive from "./primitives/attachment";
export * as BranchPickerPrimitive from "./primitives/branchPicker";
export * as ChainOfThoughtPrimitive from "./primitives/chainOfThought";
export * as ComposerPrimitive from "./primitives/composer";
export * as QueueItemPrimitive from "./primitives/queueItem";
export * as MessagePartPrimitive from "./primitives/messagePart";
export * as ErrorPrimitive from "./primitives/error";
export * as MessagePrimitive from "./primitives/message";
export * as ThreadPrimitive from "./primitives/thread";
export * as SuggestionPrimitive from "./primitives/suggestion";
export * as ThreadListPrimitive from "./primitives/threadList";
export * as ThreadListItemPrimitive from "./primitives/threadListItem";
export * as ThreadListItemMorePrimitive from "./primitives/threadListItemMore";
export * as SelectionToolbarPrimitive from "./primitives/selectionToolbar";

export { groupPartByType, type GroupByContext } from "@/leopard-ui/core/react";
export {
  createThreadRowsSelector,
  type ThreadRow,
  type ThreadRowsOptions,
} from "@/leopard-ui/core/react";
export { unstable_useThreadMessageIds } from "@/leopard-ui/core/react";
export { useMessagePartText } from "./primitives/messagePart/useMessagePartText";
export { useMessagePartReasoning } from "./primitives/messagePart/useMessagePartReasoning";
export { useMessagePartSource } from "./primitives/messagePart/useMessagePartSource";
export { useMessagePartFile } from "./primitives/messagePart/useMessagePartFile";
export { useMessagePartImage } from "./primitives/messagePart/useMessagePartImage";
export { useMessagePartData } from "./primitives/messagePart/useMessagePartData";
export { useThreadViewportAutoScroll } from "./primitives/thread/useThreadViewportAutoScroll";
export { useScrollLock } from "./primitives/reasoning/useScrollLock";
export { useMessageQuote } from "./hooks/useMessageQuote";
export { useMessageTiming } from "./hooks/useMessageTiming";
export { useToolCallElapsed } from "./hooks/useToolCallElapsed";
export {
  unstable_useMessageStallDetection,
  type Unstable_MessageStallDetection,
  type Unstable_MessageStallDetectionOptions,
} from "./unstable/useMessageStallDetection";
export { useSmooth, type SmoothOptions } from "./utils/smooth/useSmooth";

// Re-export core types from @/leopard-ui/core
export type {
  Attachment,
  PendingAttachment,
  CompleteAttachment,
  AttachmentStatus,
  AppendMessage,
  TextMessagePart,
  ReasoningMessagePart,
  PartProviderMetadata,
  SourceProviderMetadata,
  SourceMessagePart,
  ImageMessagePart,
  FileMessagePart,
  DataMessagePart,
  GenerativeUIMessagePart,
  GenerativeUINode,
  GenerativeUISpec,
  Unstable_AudioMessagePart,
  RespondToToolApprovalOptions,
  ToolApprovalDisplay,
  ToolApprovalOption,
  ToolApprovalOptionKind,
  ToolApprovalAnswer,
  ToolApprovalQuestion,
  ToolApprovalQuestionOption,
  ToolApprovalResponse,
  ToolCallMessagePart,
  MessagePartTiming,
  ToolCallTiming,
  ToolModelContentPart,
  MessageStatus,
  MessagePartStatus,
  MessagePartStreamStatus,
  ToolCallMessagePartStatus,
  MessageTiming,
  MessageModality,
  ThreadUserMessagePart,
  ThreadAssistantMessagePart,
  ThreadSystemMessage,
  ThreadAssistantMessage,
  ThreadUserMessage,
  ThreadMessage,
  Unsubscribe,
  QuoteInfo,
  CreateAttachment,
} from "@/leopard-ui/core";

// React component types (from core/react)
export type {
  EmptyMessagePartComponent,
  EmptyMessagePartProps,
  TextMessagePartComponent,
  TextMessagePartProps,
  ReasoningMessagePartComponent,
  ReasoningMessagePartProps,
  SourceMessagePartComponent,
  SourceMessagePartProps,
  ImageMessagePartComponent,
  ImageMessagePartProps,
  FileMessagePartComponent,
  FileMessagePartProps,
  Unstable_AudioMessagePartComponent,
  Unstable_AudioMessagePartProps,
  DataMessagePartComponent,
  DataMessagePartProps,
  ToolCallMessagePartComponent,
  ToolCallMessagePartProps,
  ReasoningGroupProps,
  ReasoningGroupComponent,
  QuoteMessagePartComponent,
  QuoteMessagePartProps,
  GenerativeUIComponentRegistry,
  GenerativeUIMessagePartComponent,
  GenerativeUIMessagePartProps,
  GenerativeUIRenderProps,
  EnrichedPartState,
  PartState,
} from "@/leopard-ui/core/react";

// Generative UI runtime error + headless renderer (re-exported from core)
export {
  GenerativeUIRender,
  GenerativeUIRenderError,
} from "@/leopard-ui/core/react";

// Thread list item types
export type { ThreadListItemStatus } from "@/leopard-ui/core";

export { DevToolsHooks, DevToolsProviderApi } from "./devtools/DevToolsHooks";

export { ModelContext as ModelContextClient } from "@/leopard-ui/core/store";
export { ChainOfThoughtClient } from "@/leopard-ui/core/store";
export {
  ExternalThread,
  type ExternalThreadProps,
  type ExternalThreadMessage,
} from "@/leopard-ui/core/store";
export {
  InMemoryThreadList,
  type InMemoryThreadListProps,
} from "@/leopard-ui/core/store";
export {
  RemoteThreadList,
  type RemoteThreadListProps,
} from "@/leopard-ui/core/store";
export { SingleThreadList } from "@/leopard-ui/core/store";

export * as INTERNAL from "./internal";

// Unstable - mention adapter helper (tools + custom items + categories)
export {
  unstable_useMentionAdapter,
  type Unstable_IconComponent,
  type Unstable_Mention,
  type Unstable_MentionCategory,
  type Unstable_MentionDirective,
  type Unstable_ModelContextToolsOptions,
  type Unstable_UseMentionAdapterOptions,
} from "./unstable/useMentionAdapter";

// Unstable - slash command adapter helper
export {
  unstable_useSlashCommandAdapter,
  type Unstable_SlashCommand,
  type Unstable_SlashCommandAction,
  type Unstable_UseSlashCommandAdapterOptions,
} from "./unstable/useSlashCommandAdapter";

// Unstable - live (async) completion adapter helper
export {
  unstable_useLiveCompletionAdapter,
  type Unstable_UseLiveCompletionAdapterOptions,
} from "./unstable/useLiveCompletionAdapter";

export type { ToolExecutionStatus } from "./internal";

// Unstable - trigger popover (unified root for @ mentions, / slash commands, etc.)
export {
  /** @deprecated Experimental since 2026-04-15. Not scheduled for removal; the API may change in any release. */
  useTriggerPopoverRootContext as unstable_useTriggerPopoverRootContext,
  /** @deprecated Experimental since 2026-04-15. Not scheduled for removal; the API may change in any release. */
  useTriggerPopoverRootContextOptional as unstable_useTriggerPopoverRootContextOptional,
  /** @deprecated Experimental since 2026-04-15. Not scheduled for removal; the API may change in any release. */
  useTriggerPopoverScopeContext as unstable_useTriggerPopoverScopeContext,
  /** @deprecated Experimental since 2026-04-15. Not scheduled for removal; the API may change in any release. */
  useTriggerPopoverScopeContextOptional as unstable_useTriggerPopoverScopeContextOptional,
  /** @deprecated Experimental since 2026-04-15. Not scheduled for removal; the API may change in any release. */
  useTriggerPopoverTriggers as unstable_useTriggerPopoverTriggers,
  /** @deprecated Experimental since 2026-04-15. Not scheduled for removal; the API may change in any release. */
  useTriggerPopoverTriggersOptional as unstable_useTriggerPopoverTriggersOptional,
  /** @deprecated Experimental since 2026-04-15. Not scheduled for removal; the API may change in any release. */
  type RegisteredTrigger as Unstable_RegisteredTrigger,
  type TriggerMatch,
  type TriggerMatcher,
  /** @deprecated Experimental since 2026-04-15. Not scheduled for removal; the API may change in any release. */
  type TriggerBehavior as Unstable_TriggerBehavior,
} from "./primitives/composer/trigger";
import type {
  TriggerMatch,
  TriggerMatcher,
} from "./primitives/composer/trigger";
/** @deprecated Use `TriggerMatch` instead. */
export type Unstable_TriggerMatch = TriggerMatch;
/** @deprecated Use `TriggerMatcher` instead. */
export type Unstable_TriggerMatcher = TriggerMatcher;
export type {
  DirectiveFormatter,
  DirectiveSegment,
  TriggerAdapter,
  TriggerCategory,
  TriggerItem,
  Unstable_DirectiveFormatter,
  Unstable_DirectiveSegment,
  Unstable_TriggerItem,
} from "@/leopard-ui/core";
export {
  defaultDirectiveFormatter,
  unstable_defaultDirectiveFormatter,
} from "@/leopard-ui/core";

// Unstable - composer input history (terminal-style ArrowUp/ArrowDown recall)
export {
  unstable_useComposerInputHistory,
  type Unstable_ComposerInputHistory,
} from "./unstable/useComposerInputHistory";

// Unstable - headless composer input bridge (value/send without ComposerPrimitive.Input)
export {
  unstable_useComposerInput,
  unstable_useTriggerPopoverAriaProps,
  type Unstable_UseComposerInputOptions,
  type Unstable_ComposerInput,
  type Unstable_TriggerPopoverAriaProps,
} from "./unstable/useComposerInput";

export type { Assistant } from "./augmentations";

// --- mcp-apps ---
export {
  CloudRendererHost,
  type CloudRendererHostProps,
} from "./cloud-renderer/CloudRendererHost";

export {
  McpAppRenderer,
  McpAppsRemoteHost,
  getMcpAppFromToolPart,
} from "./mcp-apps";
export type {
  McpAppPartOptions,
  McpAppRendererOptions,
  McpAppMetadata,
  McpAppResource,
  McpAppResourceMeta,
  McpAppResourceCSP,
  McpAppSandboxConfig,
  McpAppHostInfo,
  McpAppHostContext,
  McpAppDisplayMode,
  McpAppsHost,
  McpAppsRemoteHostOptions,
  McpAppToolCallParams,
  McpAppInitializeParams,
  McpAppBridgeHandlers,
  ToolCallMessagePartMcpMetadata,
} from "./mcp-apps";
export type { McpAppResourceOutput } from "@/leopard-ui/core/react";
export type { ShimLoadError, ShimLoadErrorCode } from "leopard-content-frame";

// Unstable - WebMCP provider (exposes frontend tools to a WebMCP-capable browser)
export {
  unstable_useWebMcpProvider,
  type Unstable_WebMcpProviderOptions,
  type Unstable_WebMcpProviderResult,
} from "./unstable/webmcp/useWebMcpProvider";
export {
  /** @deprecated Experimental since 2026-08-29. Not scheduled for removal; the API may change in any release. */
  defaultWebMcpFilter as unstable_defaultWebMcpFilter,
} from "./unstable/webmcp/convertTools";

// Shared surface carried by every distribution (scripts/check-distribution-barrels.mjs)
export type {
  JoinStrategy,
  TitleGenerationAdapter,
} from "@/leopard-ui/core/react";
export {
  ChainOfThoughtPartByIndexProvider,
  createSimpleTitleAdapter,
} from "@/leopard-ui/core/react";
export type { ThreadsState } from "@/leopard-ui/core/store";
export type {
  MessageRole,
  RemoteThreadListOptions,
  RunConfig,
  RuntimeCapabilities,
} from "@/leopard-ui/core";
