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
declare module "@opentelemetry/api";
declare module "@opentelemetry/exporter-trace-otlp-http";
declare module "@opentelemetry/sdk-trace-base";
declare module "vitest";
