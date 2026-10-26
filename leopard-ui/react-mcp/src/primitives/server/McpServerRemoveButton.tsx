import {
  type ComponentPropsWithoutRef,
  type ComponentRef,
  forwardRef,
} from "react";
import { Primitive } from "@radix-ui/react-primitive";
import { useLeopard, useLeopardState } from "@/leopard-ui/store";

export namespace McpServerPrimitiveRemoveButton {
  export type Element = ComponentRef<typeof Primitive.button>;
  export type Props = ComponentPropsWithoutRef<typeof Primitive.button>;
}

export const McpServerPrimitiveRemoveButton = forwardRef<
  McpServerPrimitiveRemoveButton.Element,
  McpServerPrimitiveRemoveButton.Props
>((props, ref) => {
  const kind = useLeopardState((s) => s.mcpServer.kind);
  const leopard = useLeopard();
  if (kind !== "custom") return null;
  return (
    <Primitive.button
      {...props}
      type="button"
      ref={ref}
      onClick={(e) => {
        props.onClick?.(e);
        if (e.defaultPrevented) return;
        void leopard.mcpServer.remove().catch(() => undefined);
      }}
    />
  );
});

McpServerPrimitiveRemoveButton.displayName = "McpServerPrimitive.RemoveButton";
