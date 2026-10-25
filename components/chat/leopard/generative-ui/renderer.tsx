"use client";

import { useEffect, useState } from "react";
import { renderGenerativeUI } from "@/aui/generative-ui/renderGenerativeUI";
import { cn } from "@/lib/utils";
import { paper } from "../surfaces";
import {
  leopardUiCssText,
  leopardUiSurfaceThemeCssText,
  leopardUiVarsText,
} from "./css";
import { leopardUiRenderLibrary } from "./library";

const styleText = `${leopardUiVarsText()}\n\n${leopardUiCssText()}\n\n${leopardUiSurfaceThemeCssText()}`;

function VocabularyStyle() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return <style dangerouslySetInnerHTML={{ __html: styleText }} />;
}

export function LeopardGenerativeUI({ node }: { node: unknown }) {
  return (
    <div className={cn(paper, "rounded-xl p-4 my-2")} data-leopard-ui-theme>
      <VocabularyStyle />
      <div className="text-foreground">
        {renderGenerativeUI(node, leopardUiRenderLibrary, { status: "done" })}
      </div>
    </div>
  );
}
