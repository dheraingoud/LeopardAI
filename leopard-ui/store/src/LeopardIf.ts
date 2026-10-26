"use client";

import type { FC, PropsWithChildren } from "react";
import { useLeopardState } from "./useLeopardState";
import type { AssistantState } from "./types/client";

export namespace LeopardIf {
  /** Props for `LeopardIf`. */
  export type Props = PropsWithChildren<{
    /** Selector deciding whether `children` render. */
    condition: LeopardIf.Condition;
  }>;

  /** Boolean selector over the assistant state. */
  export type Condition = (state: AssistantState) => boolean;
}

/** Renders `children` while `condition` selects `true` from the assistant state. */
export const LeopardIf: FC<LeopardIf.Props> = ({ children, condition }) => {
  const result = useLeopardState(condition);
  return result ? children : null;
};

LeopardIf.displayName = "LeopardIf";
