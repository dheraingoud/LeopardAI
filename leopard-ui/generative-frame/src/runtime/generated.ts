// Build artifact stub — upstream generates this via scripts/build-runtime.mjs
// (rolldown IIFE bundle of src/runtime, exported as a string). The fork is
// source-only; bootstrap.ts's default `options.runtime ?? runtimeSource` gets
// this placeholder until the runtime is bundled. Fork-fidelity note: this is
// the one file NOT byte-identical to source (the source file is gitignored).
export const runtimeSource: string = "";
