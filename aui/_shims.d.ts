// Ambient shims for the aui full-fork tree. Tooling packages (cli, metro,
// vite, create-assistant-ui, agent-launcher, setup-agent) are node-side code
// compiled under Leopard's bundler-mode tsconfig — declare the external
// modules they use so the fork compiles without pulling each one's dev deps.
declare module "cross-spawn";
declare module "statewire";
declare module "ioredis" {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  export class Redis {
    constructor(...args: any[]);
    xrangeBuffer(...args: any[]): Promise<[any, any][]>;
    [key: string]: any;
  }
  export class Cluster {
    constructor(...args: any[]);
    [key: string]: any;
  }
  export type IoRedis = any;
  export type IoRedisCluster = any;
  export type ChainableCommander = any;
  export default Redis;
}
declare module "redis";
declare module "@/aui/x-generative-compiler";
declare module "@/aui/x-generative-compiler/*";
// Build-time constants the aui build injects (x-buildutils). Fork tree is
// source-only — pin a placeholder version.
declare const __AUI_PACKAGE_VERSION__: string;
// aui/ai-sdk uses a package.json "imports" map for "#mcp-stdio" — the fork has
// no package.json, so declare the subpath ambiently. The real impl is
// mcp-stdio.node.ts; point the shim at its type surface.
declare module "#mcp-stdio" {
  export * from "@/aui/ai-sdk/src/tools/mcp-stdio.node";
}
declare module "@opentelemetry/api" {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  export type Span = any;
  export type Context = any;
  export const trace: any;
  const api: any;
  export default api;
}
declare module "@opentelemetry/sdk-trace-base" {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  export type ReadableSpan = any;
  export type SpanExporter = any;
  export interface SpanProcessor {
    onStart(span: any, parentContext: any): void;
    onEnd(span: any): void;
    forceFlush(): Promise<void>;
    shutdown(): Promise<void>;
  }
  export class BatchSpanProcessor implements SpanProcessor {
    constructor(exporter: any);
    onStart(span: any, parentContext: any): void;
    onEnd(span: any): void;
    forceFlush(): Promise<void>;
    shutdown(): Promise<void>;
    [key: string]: any;
  }
}
declare module "@opentelemetry/exporter-trace-otlp-http" {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  export class OTLPTraceExporter {
    constructor(config?: any);
    [key: string]: any;
  }
}
// Non-web externals for forked-but-not-bundled packages (vue/svelte/react-native
// adapters, MCP sdk v2 split) — ambient any so the fork tree typechecks; the
// app never imports these paths at runtime.
declare module "vue" {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  export type Component<P = any> = any;
  export type PropType<T = any> = any;
  export type Ref<T = any> = any;
  export type App<E = any> = any;
  export const defineComponent: any;
  export const ref: any;
  export const computed: any;
  export const watch: any;
  export const h: any;
  export const camelize: any;
  export const Fragment: any;
  export const inject: any;
  export const onBeforeUnmount: any;
  export const onErrorCaptured: any;
  export const onMounted: any;
  export const provide: any;
  export const shallowRef: any;
  export const toRef: any;
  export const useSlots: any;
  export const watchEffect: any;
  export const nextTick: any;
  const vue: any;
  export default vue;
}
declare module "react-native" {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  export type ViewStyle = any;
  export type TextStyle = any;
  export type StyleProp<T = any> = any;
  export const View: any;
  export const Text: any;
  export const StyleSheet: any;
  const rn: any;
  export default rn;
}
declare module "react-native-web";
declare module "@/aui/vue" {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  export type Toolkit = any;
  export type ToolUIProps = any;
  const v: any;
  export default v;
}
declare module "@/aui/react-native" {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  export type Toolkit = any;
  const v: any;
  export default v;
}
declare module "@testing-library/react";
declare module "@testing-library/react";
// Alias-shims for excluded non-web fork dirs — the dirs are excluded from the
// app build (non-web), so @/aui/vue and @/aui/react-native resolve to these
// ambient modules instead of real source. The generative-frame spec renderers
// for those platforms typecheck against `any` here; the real types land only
// if those platforms are ever built.
declare module "@/aui/vue";
declare module "@/aui/vue/*";
declare module "@/aui/react-native";
declare module "@/aui/react-native/*";
declare module "@opentelemetry/api";
declare module "@opentelemetry/exporter-trace-otlp-http";
declare module "@opentelemetry/sdk-trace-base";
declare module "vitest";
