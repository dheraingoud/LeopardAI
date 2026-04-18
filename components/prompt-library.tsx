"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Code2,
  PenLine,
  Search,
  Image,
  Copy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

interface PromptLibraryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectPrompt?: (prompt: string) => void;
}

type Prompt = { title: string; description: string; text: string };
type Category = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  prompts: Prompt[];
};

const CATEGORIES: Category[] = [
  {
    id: "code",
    label: "Code",
    icon: Code2,
    prompts: [
      {
        title: "Explain this code",
        description: "Break down the logic line by line",
        text: "Explain the following code line by line, focusing on the core logic and any non-obvious patterns:\n\n",
      },
      {
        title: "Write unit tests",
        description: "Cover edge cases, errors, and typical usage",
        text: "Write comprehensive unit tests for the following code. Cover edge cases, error handling, and typical usage:\n\n",
      },
      {
        title: "Refactor for performance",
        description: "Identify bottlenecks and optimize speed",
        text: "Analyze this code for performance bottlenecks and refactor it for optimal speed. Explain each optimization:\n\n",
      },
      {
        title: "Add error handling",
        description: "Try-catch, validation, meaningful messages",
        text: "Add proper error handling to this code. Include try-catch blocks, validation, and meaningful error messages:\n\n",
      },
      {
        title: "Convert to TypeScript",
        description: "Proper types, interfaces, and generics",
        text: "Convert this JavaScript code to TypeScript with proper type annotations, interfaces, and generics:\n\n",
      },
    ],
  },
  {
    id: "dev-roles",
    label: "Dev Roles",
    icon: Code2,
    prompts: [
      {
        title: "SQL Developer Mode",
        description: "Schema review, query plan, index strategy, migration safety",
        text: "Act as a senior SQL developer. Analyze this schema/query workload, then provide: 1) current execution flow, 2) bottlenecks, 3) optimized SQL and indexes, 4) migration-safe rollout plan, 5) validation queries.\n\n",
      },
      {
        title: "Frontend Architecture Review",
        description: "State flow, rendering hotspots, UX and a11y issues",
        text: "Act as a frontend architect. Review this UI/code and return: 1) current component flow, 2) render-performance issues, 3) a11y gaps, 4) optimized architecture, 5) implementation steps with risk notes.\n\n",
      },
      {
        title: "Core Backend Design",
        description: "API boundaries, consistency, retries, observability",
        text: "Act as a backend systems engineer. For this feature/service, provide: 1) current request/data flow, 2) failure points, 3) resilient architecture (idempotency/retries/timeouts), 4) observability plan, 5) phased rollout strategy.\n\n",
      },
      {
        title: "AI Engineer Evaluation",
        description: "Prompting, context strategy, eval plan and failure modes",
        text: "Act as an AI engineer. Evaluate this prompt/pipeline and provide: 1) current context flow, 2) token-pressure risks, 3) improved orchestration, 4) eval set + metrics, 5) fallback strategy for degraded model behavior.\n\n",
      },
      {
        title: "Audit and Compliance Lens",
        description: "Threat model, controls, evidence and audit-ready report",
        text: "Act as a technical auditor. Produce: 1) control map for this system, 2) high-risk findings by severity, 3) remediation steps, 4) evidence checklist, 5) audit-ready summary with residual risk.\n\n",
      },
      {
        title: "Professor Teaching Mode",
        description: "Stepwise teaching with examples and assessment",
        text: "Act as a professor. Teach this topic from fundamentals to advanced using: 1) concept map, 2) worked examples, 3) common misconceptions, 4) short quiz with answers, 5) project-style exercise.\n\n",
      },
    ],
  },
  {
    id: "writing",
    label: "Writing",
    icon: PenLine,
    prompts: [
      {
        title: "Summarize",
        description: "3-5 bullet points capturing key information",
        text: "Summarize the following text in 3-5 bullet points, capturing the key information:\n\n",
      },
      {
        title: "Fix grammar",
        description: "Correct errors without changing meaning",
        text: "Fix all grammatical and spelling errors in the following text without changing the meaning:\n\n",
      },
      {
        title: "Rewrite concisely",
        description: "Preserve key info with fewer words",
        text: "Rewrite the following text to be more concise while preserving all key information:\n\n",
      },
    ],
  },
  {
    id: "analysis",
    label: "Analysis",
    icon: Search,
    prompts: [
      {
        title: "Compare approaches",
        description: "List pros, cons, and make a recommendation",
        text: "Compare the following approaches/solutions. List pros, cons, and recommend one with justification:\n\n",
      },
      {
        title: "Find the bottleneck",
        description: "Top 3 performance issues with suggested fixes",
        text: "Analyze this system/code for performance bottlenecks. Identify the top 3 issues and suggest fixes:\n\n",
      },
      {
        title: "Security review",
        description: "OWASP Top 10, injection risks, data exposure",
        text: "Perform a security review of the following code. Check for OWASP Top 10 vulnerabilities, injection risks, and data exposure:\n\n",
      },
    ],
  },
  {
    id: "image",
    label: "Image Gen",
    icon: Image,
    prompts: [
      {
        title: "Photorealistic portrait",
        description: "Dramatic lighting, shallow DoF, 85mm studio",
        text: "A photorealistic portrait photograph of a person, dramatic lighting, shallow depth of field, 85mm lens, studio quality",
      },
      {
        title: "Abstract art",
        description: "Organic shapes, bold colors, high contrast",
        text: "Vibrant abstract digital artwork, flowing organic shapes, bold color palette, high contrast, 8K detail",
      },
      {
        title: "Architecture",
        description: "Geometric lines, golden hour, minimalist",
        text: "Modern architectural photography, clean geometric lines, golden hour lighting, minimalist composition",
      },
    ],
  },
];

function PromptCard({
  prompt,
  onSelect,
}: {
  prompt: Prompt;
  onSelect: (text: string) => void;
}) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      onClick={() => onSelect(prompt.text)}
      className={cn(
        "group relative flex flex-col gap-1 rounded-xl border border-border/40 bg-[#111111] p-3 text-left",
        "transition-all duration-150 hover:border-[#ffb400]/40 hover:bg-[#161616]",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#ffb400]/50"
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="text-xs font-semibold text-foreground leading-snug">
          {prompt.title}
        </span>
        <Copy className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <span className="line-clamp-2 text-[10px] text-muted-foreground leading-relaxed">
        {prompt.description}
      </span>
    </motion.button>
  );
}

export function PromptLibrary({
  open,
  onOpenChange,
  onSelectPrompt,
}: PromptLibraryProps) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0].id);

  const getFilteredPrompts = (prompts: Prompt[]) => {
    if (!query) return prompts;
    const q = query.toLowerCase();
    return prompts.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
    );
  };

  const handleSelect = (text: string) => {
    onSelectPrompt?.(text);
    onOpenChange(false);
    setQuery("");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 border-border bg-[#0a0a0a] p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-border/50 px-4 pb-4 pt-5">
          <SheetTitle className="font-mono text-sm font-semibold text-[#ffb400]">
            Prompt Library
          </SheetTitle>
          <div className="relative mt-3">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              placeholder="Search prompts..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8 h-8 text-xs bg-[#111111] border-border/50 placeholder:text-muted-foreground"
            />
          </div>
        </SheetHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* Left: vertical category tabs */}
          <Tabs
            value={activeCategory}
            onValueChange={(v) => {
              setActiveCategory(v);
              setQuery("");
            }}
            orientation="vertical"
            className="flex h-full w-28 shrink-0 flex-col gap-1 border-r border-border/50 bg-[#0a0a0a] p-3"
          >
            <TabsList className="flex flex-col gap-1 bg-transparent p-0">
              {CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                const filtered = getFilteredPrompts(cat.prompts);
                return (
                  <TabsTrigger
                    key={cat.id}
                    value={cat.id}
                    className={cn(
                      "w-full justify-start gap-2 px-2 py-1.5 text-xs transition-colors",
                      filtered.length === 0 && "opacity-30"
                    )}
                  >
                    <Icon className="size-3.5 shrink-0" />
                    <span>{cat.label}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
</Tabs>
{/* Right: prompt grid — one TabsContent per category */}
          <div className="flex-1 overflow-y-auto p-3">
            {CATEGORIES.map((cat) => {
              const filtered = getFilteredPrompts(cat.prompts);
              const isActive = cat.id === activeCategory;
              if (query && !isActive) return null;
              return (
                <div key={cat.id} hidden={cat.id !== activeCategory} className="mt-0 outline-none">
                  {filtered.length === 0 ? (
                    <div className="flex h-32 items-center justify-center">
                      <p className="text-xs text-muted-foreground">
                        No prompts found
                      </p>
                    </div>
                  ) : (
                    <motion.div
                      key={cat.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.15 }}
                      className="grid grid-cols-2 gap-2"
                    >
                      {filtered.map((prompt) => (
                        <PromptCard
                          key={prompt.title}
                          prompt={prompt}
                          onSelect={handleSelect}
                        />
                      ))}
                    </motion.div>
                  )}
                </div>
              );
            })}
          </div>
</div>
</SheetContent>
    </Sheet>
  );
}