import { useEffect } from "react";
import { useLeopard } from "@/leopard-ui/store";
import type { DataMessagePartComponent } from "../types/MessagePartComponentTypes";

/** Props used to register a renderer for `data` message parts. */
export type AssistantDataUIProps<T = any> = {
  /** Data part name this renderer handles. */
  name: string;
  /** Component rendered for matching data message parts. */
  render: DataMessagePartComponent<T>;
};

/**
 * Registers a renderer for named `data` message parts while the component is
 * mounted.
 *
 * @param dataUI - Data renderer registration, or `null` to skip registration.
 */
export const useAssistantDataUI = (dataUI: AssistantDataUIProps | null) => {
  const leopard = useLeopard();
  useEffect(() => {
    if (!dataUI?.name || !dataUI?.render) return undefined;
    return leopard.dataRenderers.setDataUI(dataUI.name, dataUI.render);
  }, [leopard, dataUI?.name, dataUI?.render]);
};
