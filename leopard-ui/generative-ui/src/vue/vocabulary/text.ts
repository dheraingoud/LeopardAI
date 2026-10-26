import { defineComponent, h } from "vue";
import { textDefinitions } from "../../vocabulary/definitions/text";
import { textChildren } from "./textChildren";

export const textVocabulary = {
  Header: {
    ...textDefinitions.Header,
    component: defineComponent({
      name: "GenerativeUIHeader",
      props: ["text", "size"],
      setup(props, { slots }) {
        return () =>
          h(
            "h2",
            { "data-leopard": "header", "data-leopard-size": props.size ?? "lg" },
            [...textChildren(props.text), ...(slots.default?.() ?? [])],
          );
      },
    }),
  },
  Text: {
    ...textDefinitions.Text,
    component: defineComponent({
      name: "GenerativeUIText",
      props: ["value", "size", "weight", "color"],
      setup(props, { slots }) {
        return () =>
          h(
            "span",
            {
              "data-leopard": "text",
              "data-leopard-size": props.size ?? "md",
              "data-leopard-weight": props.weight,
              "data-leopard-color": props.color,
            },
            [...textChildren(props.value), ...(slots.default?.() ?? [])],
          );
      },
    }),
  },
  Caption: {
    ...textDefinitions.Caption,
    component: defineComponent({
      name: "GenerativeUICaption",
      props: ["value"],
      setup(props, { slots }) {
        return () =>
          h("p", { "data-leopard": "caption" }, [
            ...textChildren(props.value),
            ...(slots.default?.() ?? []),
          ]);
      },
    }),
  },
};
