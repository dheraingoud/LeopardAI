import type { GenerativeUILibrary } from "../types";
import { textDefinitions } from "./definitions/text";
import { toTextContent } from "./toTextContent";

export const textVocabulary = {
  Header: {
    ...textDefinitions.Header,
    render: ({ text, size, children }) => (
      <h2 data-leopard="header" data-leopard-size={size ?? "lg"}>
        {toTextContent(text)}
        {children}
      </h2>
    ),
  },
  Text: {
    ...textDefinitions.Text,
    render: ({ value, size, weight, color, children }) => (
      <span
        data-leopard="text"
        data-leopard-size={size ?? "md"}
        data-leopard-weight={weight}
        data-leopard-color={color}
      >
        {toTextContent(value)}
        {children}
      </span>
    ),
  },
  Caption: {
    ...textDefinitions.Caption,
    render: ({ value, children }) => (
      <p data-leopard="caption">
        {toTextContent(value)}
        {children}
      </p>
    ),
  },
} satisfies GenerativeUILibrary;
