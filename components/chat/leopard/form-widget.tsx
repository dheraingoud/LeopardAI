// Form widget — the model's structured question form. Answers are sent back as
// the next user turn so the model continues with what the user filled in.

"use client";

import { useMemo, useState } from "react";
import { CheckIcon } from "lucide-react";
import { useActiveChat } from "@/hooks/use-active-chat";
import { cn } from "@/lib/utils";
import { field, inkButton, paper } from "./surfaces";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  normalizeFormFields,
  type FormField,
} from "@/lib/ai/widget-schema";

export function FormWidget({
  title,
  fields,
  submitLabel,
}: {
  title?: string;
  fields: unknown;
  submitLabel?: string;
}) {
  const { sendMessage } = useActiveChat();
  const [values, setValues] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);

  const normalized = useMemo(() => normalizeFormFields(fields), [fields]);

  const answered = useMemo(
    () =>
      normalized.filter((item) => (values[item.name] ?? "").trim() !== ""),
    [normalized, values],
  );

  const submit = () => {
    const body = answered
      .map((item) => `- ${item.label}: ${values[item.name].trim()}`)
      .join("\n");
    const text = answered.length
      ? `Form responses${title ? ` for ${title}` : ""}:\n${body}`
      : "Form submitted with no answers.";
    setSent(true);
    void sendMessage({ parts: [{ type: "text", text }] } as never);
  };

  return (
    <div
      data-slot="form-widget"
      className={cn(paper, "flex w-full flex-col gap-3 rounded-xl p-4 my-2")}
    >
      {title ? (
        <p className="text-[13.5px] font-medium dark:text-[#e8e8e8] light:text-[#1f1607]">
          {title}
        </p>
      ) : null}

      <div className="flex flex-col gap-2.5">
        {normalized.map((item: FormField) => {
          const inputId = `form-widget-${item.name}`;
          const value = values[item.name] ?? "";
          const common = {
            id: inputId,
            name: item.name,
            value,
            disabled: sent,
            onChange: (
              event: React.ChangeEvent<
                HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
              >,
            ) => {
              const next = event.currentTarget.value;
              setValues((cur) => ({ ...cur, [item.name]: next }));
            },
            className: cn(
              field,
              "text-foreground/90 w-full rounded-lg px-2.5 py-1.5 text-[13px] outline-none focus-visible:ring-1 focus-visible:ring-[#ffb400]/40 disabled:opacity-60",
            ),
          };
          return (
            <div key={item.name} className="flex flex-col gap-1">
              <Label htmlFor={inputId}>{item.label}</Label>
              {item.type === "select" ? (
                <select {...common}>
                  <option value="">
                    {item.placeholder ?? "Select…"}
                  </option>
                  {(item.options ?? []).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : item.type === "textarea" ? (
                <Textarea {...common} rows={3} />
              ) : (
                <input
                  {...common}
                  type={item.type === "number" ? "number" : item.type === "email" ? "email" : "text"}
                  placeholder={item.placeholder}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-end gap-2">
        {sent ? (
          <span
            role="status"
            className="flex items-center gap-1.5 text-xs text-foreground/60"
          >
            <CheckIcon className="size-3.5 text-emerald-500" />
            Sent
          </span>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={normalized.length === 0}
            className={cn(
              inkButton,
              "flex h-8 items-center rounded-full px-3.5 text-xs font-medium disabled:pointer-events-none disabled:opacity-40",
            )}
          >
            {submitLabel ?? "Submit"}
          </button>
        )}
      </div>
    </div>
  );
}
