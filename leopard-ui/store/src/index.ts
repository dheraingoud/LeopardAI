// hooks
export { useLeopard } from "./useLeopard";
export { useLeopardState } from "./useLeopardState";
export { useLeopardEvent } from "./useLeopardEvent";
export { RenderChildrenWithAccessor } from "./RenderChildrenWithAccessor";

// components
export { LeopardIf } from "./LeopardIf";
export { LeopardProvider } from "./LeopardProvider";
export { LeopardConfig } from "./LeopardConfig";

// resources
export { Derived, type DerivedElement } from "./Derived";
export {
  attachTransformScopes,
  forwardTransformScopes,
} from "./attachTransformScopes";
export type { ScopesConfig } from "./attachTransformScopes";

// client hooks
export {
  useAssistantClientRef,
  useAssistantEmit,
} from "./utils/tap-assistant-context";
export { getClientId } from "./utils/client-accessor";
export { useClientResource } from "./useClientResource";
export { useClientLookup } from "./useClientLookup";
export { useClientList } from "./useClientList";

// types
export type {
  ScopeRegistry,
  ClientOutput,
  ClientMethods,
  ClientSchema,
  ClientNames,
  ClientEvents,
  ClientMeta,
  ClientElement,
  Unsubscribe,
  AssistantClientAccessor,
  AssistantClient,
  AssistantState,
} from "./types/client";
export {
  normalizeEventSelector,
  type AssistantEventName,
  type AssistantEventCallback,
  type AssistantEventPayload,
  type AssistantEventSelector,
  type AssistantEventScope,
} from "./types/events";
