"use client";

import type { AssistantCloud } from "leopard-cloud";
import type { AssistantRuntime } from "@/leopard-ui/core";
import {
  splitLocalRuntimeOptions,
  useLocalRuntime,
} from "@/leopard-ui/core/react";
import type { UseDataStreamRuntimeOptions } from "./useDataStreamRuntime";
import { DataStreamRuntimeAdapter } from "./DataStreamRuntimeAdapter";

type UseCloudRuntimeOptions = Omit<
  UseDataStreamRuntimeOptions,
  "api" | "protocol" | "headers" | "body"
> & {
  cloud: AssistantCloud;
  assistantId: string;
};

export const useCloudRuntime = (
  options: UseCloudRuntimeOptions,
): AssistantRuntime => {
  const { localRuntimeOptions, otherOptions } =
    splitLocalRuntimeOptions(options);
  const opts = options.cloud.runs.__internal_getAssistantOptions(
    options.assistantId,
  );

  return useLocalRuntime(
    new DataStreamRuntimeAdapter(
      {
        ...otherOptions,
        ...opts,
      },
      (messages) => messages,
    ),
    localRuntimeOptions,
  );
};
