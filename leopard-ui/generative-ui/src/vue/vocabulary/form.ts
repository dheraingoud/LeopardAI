import { defineComponent, h } from "vue";
import { useSpecElement } from "leopard-frame/spec/vue";
import { formDefinitions } from "../../vocabulary/definitions/form";
import { collectFormValuesFromEvent } from "../../vocabulary/collectFormValues";

export const formVocabulary = {
  Form: {
    ...formDefinitions.Form,
    component: defineComponent({
      name: "GenerativeUIForm",
      props: ["gap"],
      emits: ["submit"],
      setup: function GenerativeUIForm(props, { emit, slots }) {
        const context = useSpecElement();
        return () =>
          h(
            "form",
            {
              "data-leopard": "form",
              "data-leopard-gap": props.gap,
              "data-leopard-action": Object.hasOwn(
                context.element.on ?? {},
                "submit",
              )
                ? JSON.stringify({ type: "submit" })
                : undefined,
              onSubmit: (event: Event) => {
                event.preventDefault();
                if (Object.hasOwn(context.element.on ?? {}, "submit")) {
                  emit(
                    "submit",
                    collectFormValuesFromEvent({
                      currentTarget: event.currentTarget as HTMLFormElement,
                    }),
                  );
                }
              },
            },
            slots.default?.() ?? [],
          );
      },
    }),
  },
};
