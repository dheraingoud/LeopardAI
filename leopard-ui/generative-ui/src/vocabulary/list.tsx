import { useId, type ReactNode } from "react";
import type { Action } from "../ir";
import type { GenerativeUIDispatch, GenerativeUILibrary } from "../types";
import { listDefinitions } from "./definitions/list";
import { fire } from "./dispatch";
import { INTERACTIVE_DESCENDANT_SELECTOR } from "./listItemValues";
import { sequenceItems } from "./structureValues";

function ListViewItemRender({
  $action,
  $dispatch,
  children,
}: {
  $action?: Action;
  $dispatch?: GenerativeUIDispatch;
  children?: ReactNode;
}) {
  const contentId = useId();
  if (!$action || !$dispatch) {
    return <li data-leopard="listview-item">{children}</li>;
  }
  return (
    <li data-leopard="listview-item">
      <div
        data-leopard="listview-item-trigger"
        style={{ position: "relative" }}
        onClick={(event) => {
          const target = event.target as Element;
          const hit = target.closest(INTERACTIVE_DESCENDANT_SELECTOR);
          if (hit !== null && hit !== event.currentTarget) return;
          fire($action, $dispatch, undefined, event.currentTarget);
        }}
      >
        <button
          type="button"
          aria-labelledby={contentId}
          style={{
            position: "absolute",
            inset: "0",
            width: "100%",
            height: "100%",
            padding: "0",
            border: "0",
            background: "transparent",
            cursor: "pointer",
          }}
          onClick={(event) =>
            fire($action, $dispatch, undefined, event.currentTarget)
          }
        />
        <div
          data-leopard="listview-item-content"
          id={contentId}
          style={{ position: "relative" }}
        >
          {children}
        </div>
      </div>
    </li>
  );
}

export const listVocabulary = {
  ListView: {
    ...listDefinitions.ListView,
    render: ({ children }) => <ul data-leopard="listview">{children}</ul>,
  },
  ListViewItem: {
    ...listDefinitions.ListViewItem,
    render: (props) => <ListViewItemRender {...props} />,
  },
  Steps: {
    ...listDefinitions.Steps,
    render: ({ steps }) => (
      <ol data-leopard="steps">
        {sequenceItems(steps).map((step, index) => (
          <li key={index} data-leopard="steps-item">
            <div data-leopard="steps-title">{step.title}</div>
            {step.detail !== undefined ? (
              <div data-leopard="steps-detail">{step.detail}</div>
            ) : null}
          </li>
        ))}
      </ol>
    ),
  },
  Timeline: {
    ...listDefinitions.Timeline,
    render: ({ items }) => (
      <ol data-leopard="timeline">
        {sequenceItems(items).map((item, index) => (
          <li key={index} data-leopard="timeline-item">
            {item.time !== undefined ? (
              <div data-leopard="timeline-time">{item.time}</div>
            ) : null}
            <div data-leopard="timeline-title">{item.title}</div>
            {item.detail !== undefined ? (
              <div data-leopard="timeline-detail">{item.detail}</div>
            ) : null}
          </li>
        ))}
      </ol>
    ),
  },
} satisfies GenerativeUILibrary;
