// Generative-UI surface. Renders the model's composed tree against the
// leopard vocabulary and wires the interactive components' `_action` payloads
// back into the conversation.

"use client";

import { useEffect, useMemo, useState } from "react";
import { GenerativeUITree } from "@/aui/generative-ui/GenerativeUITree";
import type { GenerativeUIDispatch } from "@/aui/generative-ui/types";
import { useActiveChat } from "@/hooks/use-active-chat";
import { cn } from "@/lib/utils";
import { paper } from "../surfaces";
import {
  leopardUiCssText,
  leopardUiSurfaceThemeCssText,
  leopardUiVarsText,
} from "./css";
import { actionToUserTurn, createLeopardDispatch } from "./actions";
import { leopardUiRenderLibrary } from "./library";

const styleText = `${leopardUiVarsText()}\n\n${leopardUiCssText()}\n\n${leopardUiSurfaceThemeCssText()}`;

function VocabularyStyle() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return <style dangerouslySetInnerHTML={{ __html: styleText }} />;
}

export function LeopardGenerativeUI({ node }: { node: unknown }) {
  const { sendMessage } = useActiveChat();

  const dispatch = useMemo<GenerativeUIDispatch>(() => {
    return createLeopardDispatch((action) => {
      void sendMessage({
        parts: [{ type: "text", text: actionToUserTurn(action) }],
      } as never);
    });
  }, [sendMessage]);

  const context = useMemo(
    () => ({ status: "done" as const, dispatch }),
    [dispatch],
  );

  return (
    <div className={cn(paper, "rounded-xl p-4 my-2")} data-leopard-ui-theme>
      <VocabularyStyle />
      <div className="text-foreground" data-aui="root">
        <GenerativeUITree
          node={node}
          library={leopardUiRenderLibrary}
          context={context}
        />
      </div>
    </div>
  );
}
