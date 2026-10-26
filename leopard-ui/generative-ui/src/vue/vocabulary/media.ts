import { defineComponent, h } from "vue";
import { mediaDefinitions } from "../../vocabulary/definitions/media";
import { allowedImageSrc, imageStyle } from "../../vocabulary/imageStyle";
import { mapPlaces, placeHref } from "../../vocabulary/structureValues";
import { toTextContent } from "../../vocabulary/toTextContent";

export const mediaVocabulary = {
  Image: {
    ...mediaDefinitions.Image,
    component: defineComponent({
      name: "GenerativeUIImage",
      props: ["src", "alt", "size", "round", "imageOrigins"],
      setup(props) {
        return () => {
          if (
            !allowedImageSrc(
              props.src as string | undefined,
              props.imageOrigins as readonly string[] | undefined,
            )
          )
            return props.alt ?? null;
          const { numericSize, style } = imageStyle(
            props.size as string | number | undefined,
            props.round as boolean | undefined,
          );
          return h("img", {
            "data-leopard": "image",
            "data-leopard-size": numericSize === undefined ? props.size : undefined,
            "data-leopard-sized": numericSize !== undefined || undefined,
            "data-leopard-round": props.round || undefined,
            src: props.src,
            alt: props.alt,
            style,
          });
        };
      },
    }),
  },
  Divider: {
    ...mediaDefinitions.Divider,
    component: defineComponent({
      name: "GenerativeUIDivider",
      props: ["flush"],
      setup(props) {
        return () =>
          h("hr", {
            "data-leopard": "divider",
            "data-leopard-flush": props.flush || undefined,
          });
      },
    }),
  },
  Diagram: {
    ...mediaDefinitions.Diagram,
    component: defineComponent({
      name: "GenerativeUIDiagram",
      props: ["code", "title"],
      setup(props) {
        return () => {
          const caption = toTextContent(props.title);
          return h("figure", { "data-leopard": "diagram" }, [
            h("pre", { "data-leopard": "diagram-code" }, [
              h("code", {}, [toTextContent(props.code)]),
            ]),
            caption != null
              ? h("figcaption", { "data-leopard": "diagram-title" }, caption)
              : null,
          ]);
        };
      },
    }),
  },
  Map: {
    ...mediaDefinitions.Map,
    component: defineComponent({
      name: "GenerativeUIMap",
      props: ["places"],
      setup(props) {
        return () =>
          h(
            "ol",
            { "data-leopard": "map" },
            mapPlaces(props.places).map((place, index) =>
              h("li", { key: index, "data-leopard": "map-place" }, [
                h(
                  "a",
                  {
                    "data-leopard": "map-place-label",
                    href: placeHref(place),
                    target: "_blank",
                    rel: "noopener noreferrer",
                  },
                  place.label,
                ),
                place.detail !== undefined
                  ? h("div", { "data-leopard": "map-place-detail" }, place.detail)
                  : null,
              ]),
            ),
          );
      },
    }),
  },
};
