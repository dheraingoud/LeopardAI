import { invokeUserCallback } from "@/aui/core/internal";

export const invokeMcpCallback = <TArgs extends unknown[]>(
  name: string,
  callback: ((...args: TArgs) => void) | undefined,
  ...args: TArgs
): void => {
  void invokeUserCallback("react-mcp", name, callback, ...args);
};
