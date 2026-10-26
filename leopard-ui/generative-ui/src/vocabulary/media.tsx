import type { GenerativeUILibrary } from "../types";
import { mediaDefinitions } from "./definitions/media";
import { allowedImageSrc, imageStyle } from "./imageStyle";
import { mapPlaces, placeHref } from "./structureValues";
import { toTextContent } from "./toTextContent";

export const mediaVocabulary = {
  Image: {
    ...mediaDefinitions.Image,
    render: ({ src, alt, size, round, $imageOrigins }) => {
      if (!allowedImageSrc(src, $imageOrigins)) return alt ?? null;
      const { numericSize, style } = imageStyle(size, round);

      return (
        <img
          data-leopard="image"
          data-leopard-size={numericSize === undefined ? size : undefined}
          data-leopard-sized={numericSize !== undefined || undefined}
          data-leopard-round={round || undefined}
          src={src}
          alt={alt}
          style={style}
        />
      );
    },
  },
  Divider: {
    ...mediaDefinitions.Divider,
    render: ({ flush }) => (
      <hr data-leopard="divider" data-leopard-flush={flush || undefined} />
    ),
  },
  Diagram: {
    ...mediaDefinitions.Diagram,
    render: ({ code, title }) => {
      const caption = toTextContent(title);
      return (
        <figure data-leopard="diagram">
          <pre data-leopard="diagram-code">
            <code>{toTextContent(code)}</code>
          </pre>
          {caption != null ? (
            <figcaption data-leopard="diagram-title">{caption}</figcaption>
          ) : null}
        </figure>
      );
    },
  },
  Map: {
    ...mediaDefinitions.Map,
    render: ({ places }) => (
      <ol data-leopard="map">
        {mapPlaces(places).map((place, index) => (
          <li key={index} data-leopard="map-place">
            <a
              data-leopard="map-place-label"
              href={placeHref(place)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {place.label}
            </a>
            {place.detail !== undefined ? (
              <div data-leopard="map-place-detail">{place.detail}</div>
            ) : null}
          </li>
        ))}
      </ol>
    ),
  },
} satisfies GenerativeUILibrary;
