import {
  type ComponentPropsWithoutRef,
  type ComponentRef,
  forwardRef,
} from "react";
import { Primitive } from "@radix-ui/react-primitive";
import { useLeopardState } from "@/leopard-ui/store";

export namespace McpServerPrimitiveRoot {
  export type Element = ComponentRef<typeof Primitive.div>;
  export type Props = ComponentPropsWithoutRef<typeof Primitive.div>;
}

export const McpServerPrimitiveRoot = forwardRef<
  McpServerPrimitiveRoot.Element,
  McpServerPrimitiveRoot.Props
>((props, ref) => {
  const id = useLeopardState((s) => s.mcpServer.id);
  const kind = useLeopardState((s) => s.mcpServer.kind);
  const connectionState = useLeopardState((s) => s.mcpServer.connectionState);
  const hasError = useLeopardState((s) => s.mcpServer.lastError !== null);

  return (
    <Primitive.div
      {...props}
      ref={ref}
      data-server-id={id}
      data-kind={kind}
      data-connection-state={connectionState}
      data-has-error={hasError || undefined}
    />
  );
});

McpServerPrimitiveRoot.displayName = "McpServerPrimitive.Root";
