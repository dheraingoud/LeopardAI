"use client";

import type { FC } from "react";
import { useLeopardState } from "@/leopard-ui/store";

const useBranchPickerNumber = () => {
  const branchNumber = useLeopardState((s) => s.message.branchNumber);
  return branchNumber;
};

export namespace BranchPickerPrimitiveNumber {
  export type Props = Record<string, never>;
}

export const BranchPickerPrimitiveNumber: FC<
  BranchPickerPrimitiveNumber.Props
> = () => {
  const branchNumber = useBranchPickerNumber();
  return <>{branchNumber}</>;
};

BranchPickerPrimitiveNumber.displayName = "BranchPickerPrimitive.Number";
