"use client";

import { defaultGenerativeUILibrary } from "@/leopard-ui/generative-ui/vocabulary";
import type { GenerativeUILibrary } from "@/leopard-ui/generative-ui/types";
import { LEOPARD_UI_COMPONENTS } from "@/lib/ai/generative-ui-schema";

export const leopardUiRenderLibrary = Object.fromEntries(
  LEOPARD_UI_COMPONENTS.map((name) => {
    const component = (
      defaultGenerativeUILibrary as unknown as Record<string, unknown>
    )[name];
    if (!component) {
      throw new Error(`[leopard] generative-UI component "${name}" is missing`);
    }
    return [name, component];
  }),
) as GenerativeUILibrary;
