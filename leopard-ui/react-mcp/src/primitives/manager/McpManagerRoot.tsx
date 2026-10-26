import {
  type ComponentPropsWithoutRef,
  type ComponentRef,
  forwardRef,
} from "react";
import { Primitive } from "@radix-ui/react-primitive";
import { useLeopardState } from "@/leopard-ui/store";

export namespace McpManagerPrimitiveRoot {
  export type Element = ComponentRef<typeof Primitive.div>;
  export type Props = ComponentPropsWithoutRef<typeof Primitive.div>;
}

export const McpManagerPrimitiveRoot = forwardRef<
  McpManagerPrimitiveRoot.Element,
  McpManagerPrimitiveRoot.Props
>((props, ref) => {
  const isHydrated = useLeopardState((s) => s.mcp.isHydrated);
  return (
    <Primitive.div
      {...props}
      ref={ref}
      data-mcp-hydrated={isHydrated || undefined}
    />
  );
});

McpManagerPrimitiveRoot.displayName = "McpManagerPrimitive.Root";
