import {
  type ComponentPropsWithoutRef,
  type ComponentRef,
  forwardRef,
} from "react";
import { Primitive } from "@radix-ui/react-primitive";
import { useLeopardState } from "@/leopard-ui/store";

export namespace McpServerPrimitiveIcon {
  export type Element = ComponentRef<typeof Primitive.img>;
  export type Props = Omit<
    ComponentPropsWithoutRef<typeof Primitive.img>,
    "src" | "alt"
  > & {
    /** Override the icon URL. Defaults to the server's icon prop. */
    src?: string;
    alt?: string;
  };
}

export const McpServerPrimitiveIcon = forwardRef<
  McpServerPrimitiveIcon.Element,
  McpServerPrimitiveIcon.Props
>(({ src, alt, ...props }, ref) => {
  const iconUrl = useLeopardState((s) => s.mcpServer.icon ?? null);
  const name = useLeopardState((s) => s.mcpServer.name);
  const effective = src ?? iconUrl;
  if (!effective) return null;
  return (
    <Primitive.img {...props} ref={ref} src={effective} alt={alt ?? name} />
  );
});

McpServerPrimitiveIcon.displayName = "McpServerPrimitive.Icon";
