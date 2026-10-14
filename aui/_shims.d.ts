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
declare module "@/aui/tap";
declare module "@/aui/tap/*";
declare module "@/aui/x-generative-compiler";
declare module "@/aui/x-generative-compiler/*";
declare module "@/aui/store";
declare module "@/aui/store/*";
declare module "@/aui/core";
declare module "@/aui/core/*";
declare module "@/aui/assistant-stream";
declare module "@/aui/assistant-stream/*";
declare module "@/aui/react";
declare module "@/aui/react/*";
