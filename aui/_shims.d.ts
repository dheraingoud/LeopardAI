// Ambient shims for the aui full-fork tree. Tooling packages (cli, metro,
// vite, create-assistant-ui, agent-launcher, setup-agent) are node-side code
// compiled under Leopard's bundler-mode tsconfig — declare the external
// modules they use so the fork compiles without pulling each one's dev deps.
declare module "cross-spawn";
declare module "statewire";
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
