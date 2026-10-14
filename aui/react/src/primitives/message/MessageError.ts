"use client";

import type { FC, PropsWithChildren } from "react";
import { useMessageError } from "@/aui/core/react";

export const MessagePrimitiveError: FC<PropsWithChildren> = ({ children }) => {
  const error = useMessageError();
  return error !== undefined ? children : null;
};

MessagePrimitiveError.displayName = "MessagePrimitive.Error";
