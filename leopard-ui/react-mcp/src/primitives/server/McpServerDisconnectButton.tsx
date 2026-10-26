import {
  type ComponentPropsWithoutRef,
  type ComponentRef,
  forwardRef,
} from "react";
import { Primitive } from "@radix-ui/react-primitive";
import { useLeopard, useLeopardState } from "@/leopard-ui/store";

export namespace McpServerPrimitiveDisconnectButton {
  export type Element = ComponentRef<typeof Primitive.button>;
  export type Props = ComponentPropsWithoutRef<typeof Primitive.button>;
}

const DISCONNECTABLE = new Set(["connected", "connecting", "authPending"]);

export const McpServerPrimitiveDisconnectButton = forwardRef<
  McpServerPrimitiveDisconnectButton.Element,
  McpServerPrimitiveDisconnectButton.Props
>((props, ref) => {
  const state = useLeopardState((s) => s.mcpServer.connectionState);
  const leopard = useLeopard();
  if (!DISCONNECTABLE.has(state)) return null;
  return (
    <Primitive.button
      {...props}
      type="button"
      ref={ref}
      onClick={(e) => {
        props.onClick?.(e);
        if (e.defaultPrevented) return;
        void leopard.mcpServer.disconnect();
      }}
    />
  );
});

McpServerPrimitiveDisconnectButton.displayName =
  "McpServerPrimitive.DisconnectButton";
