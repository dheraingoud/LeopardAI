import { defineComponent, h } from "vue";
import { factDefinitions } from "../../vocabulary/definitions/fact";
import {
  factTone,
  factTrend,
  formatFactDelta,
} from "../../vocabulary/formatValue";
import { textChildren } from "./textChildren";

export const factVocabulary = {
  Fact: {
    ...factDefinitions.Fact,
    component: defineComponent({
      name: "GenerativeUIFact",
      props: ["label", "value", "delta", "trend", "upIsGood"],
      setup(props, { slots }) {
        return () => {
          const direction = factTrend(props.delta, props.trend);
          return h("dl", { "data-leopard": "fact" }, [
            h("dt", { "data-leopard": "fact-label" }, textChildren(props.label)),
            h("dd", { "data-leopard": "fact-value" }, [
              ...textChildren(props.value),
              ...(typeof props.delta === "string"
                ? [
                    h(
                      "span",
                      {
                        "data-leopard": "fact-delta",
                        "data-leopard-trend": direction,
                        "data-leopard-tone": factTone(direction, props.upIsGood),
                      },
                      formatFactDelta(props.delta, direction),
                    ),
                  ]
                : []),
              ...(slots.default?.() ?? []),
            ]),
          ]);
        };
      },
    }),
  },
};
