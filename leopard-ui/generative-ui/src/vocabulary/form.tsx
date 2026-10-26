import type { GenerativeUILibrary } from "../types";
import { formDefinitions } from "./definitions/form";
import { actionAttr, fire } from "./dispatch";
import { collectFormValuesFromEvent } from "./collectFormValues";

export const formVocabulary = {
  Form: {
    ...formDefinitions.Form,
    render: ({ gap, $action, $dispatch, children }) => (
      <form
        data-leopard="form"
        data-leopard-gap={gap}
        data-leopard-action={actionAttr($action)}
        onSubmit={(event) => {
          event.preventDefault();
          fire(
            $action,
            $dispatch,
            collectFormValuesFromEvent(event),
            event.currentTarget,
          );
        }}
      >
        {children}
      </form>
    ),
  },
} satisfies GenerativeUILibrary;
