/* Leopard skin for the generative-UI vocabulary: styles the data-leopard markup the
 * forked assistant-ui vocabulary emits, on Leopard's own tokens. */

export type LeopardCssDeclarations = Record<string, string>;
export type LeopardCssMediaBlock = Record<string, LeopardCssDeclarations>;
type LeopardCssRuleset = Record<string, LeopardCssDeclarations | LeopardCssMediaBlock>;

export const leopardUiHairlineBorder =
  "color-mix(in oklab, var(--border) 60%, transparent)";

export const leopardUiCardSurfaceSelectors = [
  '[data-leopard="card"][data-leopard-surface]',
  '[data-leopard="carousel"] [data-leopard="card"]',
] as const;

const cardSurface = (scope?: string) =>
  leopardUiCardSurfaceSelectors.map((s) => (scope ? `${scope} ${s}` : s)).join(", ");
const toneText = (token: string) =>
  `color-mix(in oklab, var(${token}) 55%, currentColor)`;
const inkFill = (pct: number) =>
  `color-mix(in oklab, var(--foreground) ${pct}%, transparent)`;
const tintedCardDefaultBadge =
  '[data-leopard="card"][data-leopard-background][data-leopard-surface] [data-leopard="badge"]:not([data-leopard-variant="info"]):not([data-leopard-variant="success"]):not([data-leopard-variant="warning"]):not([data-leopard-variant="danger"])';
const tintedCardInfoBadge =
  '[data-leopard="card"][data-leopard-background][data-leopard-surface] [data-leopard="badge"][data-leopard-variant="info"]';
const tintedCardDefaultBadgeStyle = {
  "background-color": "var(--muted)",
  color: "var(--secondary-foreground)",
};
const tintedCardInfoBadgeStyle = {
  "background-color": "var(--primary)",
  color: "var(--primary-foreground)",
};

export const leopardUiVocabularyCss: LeopardCssRuleset = {
  "[data-leopard]": {
    "box-sizing": "border-box",
  },

  '[data-leopard="header"]': {
    margin: "0",
    "font-size": "1.25rem",
    "font-weight": "600",
    "letter-spacing": "-0.01em",
    "line-height": "1.2",
  },
  '[data-leopard="text"]': {
    "line-height": "1.5",
  },
  '[data-leopard="caption"]': {
    margin: "0",
    "font-size": "0.75rem",
    "line-height": "1.4",
    color: "color-mix(in oklab, currentColor 62%, transparent)",
  },

  '[data-leopard="text"][data-leopard-size="sm"], [data-leopard="header"][data-leopard-size="sm"]':
    { "font-size": "0.75rem" },
  '[data-leopard="text"][data-leopard-size="md"], [data-leopard="header"][data-leopard-size="md"]':
    { "font-size": "0.875rem" },
  '[data-leopard="text"][data-leopard-size="lg"], [data-leopard="header"][data-leopard-size="lg"]':
    { "font-size": "1.125rem" },
  '[data-leopard="text"][data-leopard-size="xl"], [data-leopard="header"][data-leopard-size="xl"]':
    { "font-size": "1.25rem" },
  '[data-leopard="text"][data-leopard-size="2xl"], [data-leopard="header"][data-leopard-size="2xl"]':
    {
      "font-size": "1.5rem",
      "font-weight": "600",
      "letter-spacing": "-0.02em",
    },
  '[data-leopard="text"][data-leopard-size="3xl"], [data-leopard="header"][data-leopard-size="3xl"]':
    {
      "font-size": "2.25rem",
      "font-weight": "600",
      "letter-spacing": "-0.02em",
    },

  '[data-leopard="text"][data-leopard-weight="normal"]': { "font-weight": "400" },
  '[data-leopard="text"][data-leopard-weight="medium"]': { "font-weight": "500" },
  '[data-leopard="text"][data-leopard-weight="semibold"]': { "font-weight": "600" },
  '[data-leopard="text"][data-leopard-weight="bold"]': { "font-weight": "700" },

  '[data-leopard="text"][data-leopard-color="emphasis"]': {
    color: "var(--foreground)",
  },
  '[data-leopard="text"][data-leopard-color="secondary"]': {
    color: "color-mix(in oklab, currentColor 62%, transparent)",
  },
  '[data-leopard="text"][data-leopard-color="alpha-70"]': {
    color: "color-mix(in oklab, var(--foreground) 70%, transparent)",
  },
  '[data-leopard="text"][data-leopard-color="white"]': { color: "white" },
  '[data-leopard="text"][data-leopard-color="white-70"]': {
    color: "color-mix(in oklab, white 70%, transparent)",
  },
  '[data-leopard="text"][data-leopard-color="white-50"]': {
    color: "color-mix(in oklab, white 50%, transparent)",
  },

  '[data-leopard="fact"]': { margin: "0" },
  '[data-leopard="fact-label"]': {
    margin: "0",
    "font-size": "0.75rem",
    color: "color-mix(in oklab, currentColor 62%, transparent)",
  },
  '[data-leopard="fact-value"]': {
    margin: "0",
    "font-size": "0.875rem",
    "font-variant-numeric": "tabular-nums",
  },
  '[data-leopard="row"] > [data-leopard="fact"] > [data-leopard="fact-value"]': {
    "font-size": "1.25rem",
    "font-weight": "600",
    "line-height": "1.3",
  },
  '[data-leopard="card"] [data-leopard="row"] > [data-leopard="fact"] > [data-leopard="fact-value"]':
    {
      "font-size": "0.9375rem",
      "font-weight": "500",
    },
  '[data-leopard="fact-delta"]': {
    display: "inline-flex",
    "align-items": "center",
    gap: "0.125rem",
    margin: "0 0 0 0.375rem",
    padding: "0.125rem 0.375rem",
    "border-radius": "9999px",
    "font-size": "0.6875rem",
    "font-weight": "500",
    "vertical-align": "middle",
  },
  '[data-leopard="fact-delta"][data-leopard-tone="good"]': {
    "background-color":
      "color-mix(in oklab, var(--leopard-ui-success) 15%, transparent)",
    color: toneText("--leopard-ui-success"),
  },
  '[data-leopard="fact-delta"][data-leopard-tone="bad"]': {
    "background-color":
      "color-mix(in oklab, var(--destructive) 15%, transparent)",
    color: toneText("--destructive"),
  },
  '[data-leopard="fact-delta"][data-leopard-tone="neutral"]': {
    "background-color": "var(--secondary)",
    color: "var(--secondary-foreground)",
  },

  '[data-leopard="button"], [data-leopard="card-confirm"], [data-leopard="card-cancel"]': {
    display: "inline-flex",
    "align-items": "center",
    "justify-content": "center",
    gap: "0.25rem",
    height: "var(--leopard-ui-control-height, 2.5rem)",
    padding: "0 var(--leopard-ui-button-padding-x, 1.25rem)",
    "border-radius": "calc(var(--radius) - 2px)",
    "font-size": "var(--leopard-ui-control-font-size, 0.875rem)",
    "font-weight": "500",
    border: "1px solid transparent",
    cursor: "pointer",
    "background-color": "var(--secondary)",
    color: "var(--secondary-foreground)",
    transition: "background-color 0.15s ease",
    "white-space": "nowrap",
    "flex-shrink": "0",
  },
  '[data-leopard="button"]:focus-visible, [data-leopard="card-confirm"]:focus-visible, [data-leopard="card-cancel"]:focus-visible':
    {
      outline: "2px solid var(--ring)",
      "outline-offset": "2px",
    },
  '[data-leopard="button"][data-leopard-style="primary"], [data-leopard="card-confirm"]': {
    "background-color": "var(--primary)",
    color: "var(--primary-foreground)",
  },
  '[data-leopard="button"][data-leopard-style="primary"]:hover, [data-leopard="card-confirm"]:hover':
    {
      "background-color":
        "color-mix(in oklab, var(--primary) 90%, transparent)",
    },
  '[data-leopard="button"][data-leopard-style="secondary"]': {
    "background-color": "var(--secondary)",
    color: "var(--secondary-foreground)",
  },
  '[data-leopard="button"][data-leopard-style="secondary"]:hover': {
    "background-color":
      "color-mix(in oklab, var(--secondary) 90%, transparent)",
  },
  '[data-leopard="button"][data-leopard-style="outline"]': {
    "background-color": "transparent",
    color: "var(--foreground)",
    "border-color": leopardUiHairlineBorder,
  },
  '[data-leopard="button"][data-leopard-style="outline"]:hover': {
    "background-color": "var(--accent)",
    color: "var(--accent-foreground)",
  },
  '[data-leopard="button"][data-leopard-style="ghost"], [data-leopard="card-cancel"]': {
    "background-color": "transparent",
    color: "var(--foreground)",
  },
  '[data-leopard="button"][data-leopard-style="ghost"]:hover, [data-leopard="card-cancel"]:hover':
    {
      "background-color": "var(--accent)",
      color: "var(--accent-foreground)",
    },
  '[data-leopard="button"][data-leopard-style="danger"]': {
    "background-color": "var(--destructive)",
    color: "var(--primary-foreground)",
  },
  '[data-leopard="button"][data-leopard-style="danger"]:hover': {
    "background-color":
      "color-mix(in oklab, var(--destructive) 90%, transparent)",
  },
  '[data-leopard="button"][data-leopard-state="pending"]': {
    "background-color":
      "color-mix(in oklab, var(--secondary) 72%, transparent)",
    "font-variant-numeric": "tabular-nums",
  },
  '[data-leopard="button-undo-status"]': {
    position: "absolute",
    width: "1px",
    height: "1px",
    padding: "0",
    margin: "-1px",
    overflow: "hidden",
    clip: "rect(0, 0, 0, 0)",
    "white-space": "nowrap",
    border: "0",
  },
  '[data-leopard="button"][data-leopard-block]': { width: "100%" },

  '[data-leopard="select"], [data-leopard="input"], [data-leopard="datepicker"]': {
    display: "block",
    width: "100%",
    "min-width": "0",
    height: "var(--leopard-ui-control-height, 2.5rem)",
    padding: "0 var(--leopard-ui-field-padding-x, 0.875rem)",
    "border-radius": "calc(var(--radius) - 2px)",
    border: "1px solid var(--input)",
    "background-color": "transparent",
    "font-size": "var(--leopard-ui-control-font-size, 0.875rem)",
    color: "var(--foreground)",
  },
  '[data-leopard="datepicker"]': { "max-width": "100%" },
  '[data-leopard="input"][data-leopard-multiline]': {
    height: "auto",
    "min-height": "2.5rem",
    padding: "0.625rem var(--leopard-ui-field-padding-x, 0.875rem)",
    "line-height": "1.5",
    resize: "vertical",
  },
  '[data-leopard="input"]::placeholder': {
    color: "color-mix(in oklab, currentColor 45%, transparent)",
  },
  '[data-leopard="select"]:focus-visible, [data-leopard="input"]:focus-visible, [data-leopard="datepicker"]:focus-visible':
    {
      outline: "2px solid var(--ring)",
      "outline-offset": "2px",
    },
  '[data-leopard="slider-field"]': {
    display: "flex",
    "flex-direction": "column",
    gap: "0.375rem",
  },
  '[data-leopard="slider-label"]': {
    "font-size": "var(--leopard-ui-control-font-size, 0.875rem)",
    "font-weight": "500",
  },
  '[data-leopard="slider"]': {
    width: "100%",
    height: "1.25rem",
    margin: "0",
    cursor: "pointer",
    "accent-color": "var(--foreground)",
    appearance: "none",
    "background-color": "transparent",
  },
  '[data-leopard="slider"]::-webkit-slider-runnable-track': {
    height: "0.25rem",
    "border-radius": "9999px",
    "background-color": "var(--foreground)",
  },
  '[data-leopard="slider"]::-moz-range-track': {
    height: "0.25rem",
    "border-radius": "9999px",
    "background-color": "var(--foreground)",
  },
  '[data-leopard="slider"]::-webkit-slider-thumb': {
    width: "1rem",
    height: "1rem",
    "margin-top": "-0.375rem",
    "border-radius": "9999px",
    appearance: "none",
    "background-color": "var(--foreground)",
  },
  '[data-leopard="slider"]::-moz-range-thumb': {
    width: "1rem",
    height: "1rem",
    border: "0",
    "border-radius": "9999px",
    "background-color": "var(--foreground)",
  },
  '[data-leopard="slider"]:focus-visible': {
    outline: "2px solid var(--ring)",
    "outline-offset": "2px",
  },
  '[data-leopard="slider-value"]': {
    "font-size": "0.75rem",
    "font-variant-numeric": "tabular-nums",
    color: "color-mix(in oklab, currentColor 62%, transparent)",
  },

  '[data-leopard="checkbox"]': {
    display: "inline-flex",
    "align-items": "center",
    gap: "0.5rem",
    cursor: "pointer",
  },
  '[data-leopard="radiogroup-option"], [data-leopard="checkboxgroup-option"]': {
    display: "flex",
    "align-items": "flex-start",
    gap: "0.5rem",
    cursor: "pointer",
  },
  '[data-leopard="option-content"]': {
    display: "flex",
    "flex-direction": "column",
  },
  '[data-leopard="option-description"]': {
    "font-size": "0.75rem",
    "line-height": "1.4",
    color: "color-mix(in oklab, currentColor 62%, transparent)",
  },
  '[data-leopard="checkbox"] input, [data-leopard="radiogroup-option"] input, [data-leopard="checkboxgroup-option"] input':
    {
      "accent-color": "var(--primary)",
      width: "1rem",
      height: "1rem",
      margin: "0",
      cursor: "pointer",
    },
  '[data-leopard="radiogroup-option"] input, [data-leopard="checkboxgroup-option"] input':
    { "margin-top": "0.125rem" },
  '[data-leopard="checkbox"][data-leopard-variant="switch"] input': {
    width: "2.25rem",
    height: "1.25rem",
    border: "0",
    "border-radius": "9999px",
    appearance: "none",
    "background-color":
      "color-mix(in oklab, var(--foreground) 30%, transparent)",
    transition: "background-color 0.15s ease",
  },
  '[data-leopard="checkbox"][data-leopard-variant="switch"] input::before': {
    content: '""',
    display: "block",
    width: "1rem",
    height: "1rem",
    margin: "0.125rem",
    "border-radius": "9999px",
    "background-color": "var(--background)",
    transition: "transform 0.15s ease",
  },
  '[data-leopard="checkbox"][data-leopard-variant="switch"] input:checked': {
    "background-color": "var(--foreground)",
  },
  '[data-leopard="checkbox"][data-leopard-variant="switch"] input:checked::before': {
    transform: "translateX(1rem)",
  },
  '[data-leopard="checkbox"] input:focus-visible, [data-leopard="radiogroup-option"] input:focus-visible, [data-leopard="checkboxgroup-option"] input:focus-visible':
    {
      outline: "2px solid var(--ring)",
      "outline-offset": "2px",
    },
  '[data-leopard="radiogroup"], [data-leopard="checkboxgroup"]': {
    border: "none",
    margin: "0",
    padding: "0",
    display: "flex",
    "flex-direction": "column",
    gap: "0.25rem",
  },
  '[data-leopard="checkboxgroup-progress"]': {
    display: "flex",
    "align-items": "center",
    gap: "0.625rem",
    "margin-bottom": "0.25rem",
    "font-size": "0.75rem",
    "font-variant-numeric": "tabular-nums",
    color: "color-mix(in oklab, currentColor 62%, transparent)",
  },
  '[data-leopard="checkboxgroup-progress-track"]': {
    flex: "1",
    height: "0.375rem",
    "border-radius": "9999px",
    "background-color":
      "color-mix(in oklab, var(--foreground) 10%, transparent)",
    overflow: "hidden",
  },
  '[data-leopard="checkboxgroup-progress-fill"]': {
    display: "block",
    height: "100%",
    "border-radius": "inherit",
    "background-color": "var(--primary)",
    transition: "width 0.2s ease",
  },
  'fieldset[data-leopard="answered"]': {
    border: "0",
    margin: "0",
    padding: "0",
    "min-inline-size": "0",
  },
  'fieldset[data-leopard="answered"] [data-leopard="button"], fieldset[data-leopard="answered"] [data-leopard="card-confirm"], fieldset[data-leopard="answered"] [data-leopard="card-cancel"], fieldset[data-leopard="answered"] [data-leopard="select"], fieldset[data-leopard="answered"] [data-leopard="input"], fieldset[data-leopard="answered"] [data-leopard="datepicker"], fieldset[data-leopard="answered"] [data-leopard="checkbox"], fieldset[data-leopard="answered"] [data-leopard="radiogroup-option"], fieldset[data-leopard="answered"] [data-leopard="checkboxgroup-option"]':
    {
      cursor: "not-allowed",
      opacity: "0.55",
    },

  '[data-leopard="root"]': {
    display: "flex",
    "flex-direction": "column",
    gap: "0.875rem",
    "margin-block": "0.875rem",
  },
  "[data-gf-spec], [data-gf-widget]": { "margin-block": "0.875rem" },
  '[data-leopard="root"]:empty': { display: "none" },

  '[data-leopard="card"]': {
    display: "flex",
    "flex-direction": "column",
    gap: "0.875rem",
    padding: "var(--leopard-ui-card-padding, 1rem 1.125rem)",
    "border-radius": "var(--radius)",
    "background-color": `var(--leopard-ui-panel, ${inkFill(4)})`,
  },
  '[data-leopard="card"] [data-leopard="card"]': {
    "--leopard-ui-card-padding": "0",
    "border-radius": "0",
    "background-color": "transparent",
  },
  [cardSurface()]: {
    "--leopard-ui-card-padding": "1.25rem",
    "background-color": "var(--card)",
    color: "var(--card-foreground)",
    border: `1px solid ${leopardUiHairlineBorder}`,
    "border-radius": "var(--radius)",
    "box-shadow": "none",
  },
  '[data-leopard="card-title"]': {
    margin: "0",
    "font-size": "0.9375rem",
    "font-weight": "600",
  },
  '[data-leopard="card-footer"]': {
    display: "flex",
    "justify-content": "flex-end",
    gap: "0.5rem",
    "padding-top": "0.75rem",
    "border-top": `1px solid ${leopardUiHairlineBorder}`,
  },
  '[data-leopard-padding="0"]': { padding: "0" },
  '[data-leopard-padding="1"]': { padding: "calc(1 * 4px)" },
  '[data-leopard-padding="2"]': { padding: "calc(2 * 4px)" },
  '[data-leopard-padding="3"]': { padding: "calc(3 * 4px)" },
  '[data-leopard-padding="4"]': { padding: "calc(4 * 4px)" },
  '[data-leopard-padding="5"]': { padding: "calc(5 * 4px)" },
  '[data-leopard-padding="6"]': { padding: "calc(6 * 4px)" },
  '[data-leopard-padding="7"]': { padding: "calc(7 * 4px)" },
  '[data-leopard-padding="8"]': { padding: "calc(8 * 4px)" },

  '[data-leopard="row"]': {
    display: "flex",
    "flex-direction": "row",
    gap: "0.5rem",
  },
  '[data-leopard="col"]': {
    display: "flex",
    "flex-direction": "column",
    gap: "0.625rem",
  },
  '[data-leopard="form"]': {
    display: "flex",
    "flex-direction": "column",
    gap: "0.75rem",
    margin: "0",
  },
  '[data-leopard="spacer"]': { flex: "1" },

  '[data-leopard="row"][data-leopard-align="start"], [data-leopard="col"][data-leopard-align="start"]':
    { "align-items": "flex-start" },
  '[data-leopard="row"][data-leopard-align="center"], [data-leopard="col"][data-leopard-align="center"]':
    { "align-items": "center" },
  '[data-leopard="row"][data-leopard-align="end"], [data-leopard="col"][data-leopard-align="end"]':
    {
      "align-items": "flex-end",
    },
  '[data-leopard="row"][data-leopard-justify="start"]': {
    "justify-content": "flex-start",
  },
  '[data-leopard="row"][data-leopard-justify="center"]': {
    "justify-content": "center",
  },
  '[data-leopard="row"][data-leopard-justify="end"]': { "justify-content": "flex-end" },
  '[data-leopard="row"][data-leopard-justify="between"]': {
    "justify-content": "space-between",
  },

  '[data-leopard-gap="0"]': { gap: "0" },
  '[data-leopard-gap="1"]': { gap: "calc(1 * 4px)" },
  '[data-leopard-gap="2"]': { gap: "calc(2 * 4px)" },
  '[data-leopard-gap="3"]': { gap: "calc(3 * 4px)" },
  '[data-leopard-gap="4"]': { gap: "calc(4 * 4px)" },
  '[data-leopard-gap="5"]': { gap: "calc(5 * 4px)" },
  '[data-leopard-gap="6"]': { gap: "calc(6 * 4px)" },
  '[data-leopard-gap="7"]': { gap: "calc(7 * 4px)" },
  '[data-leopard-gap="8"]': { gap: "calc(8 * 4px)" },

  '[data-leopard="box"]': { display: "block" },

  '[data-leopard="icon"]': {
    display: "inline-block",
    "vertical-align": "-0.125em",
    "flex-shrink": "0",
  },

  '[data-leopard="alert"]': {
    "border-width": "1px",
    "border-style": "solid",
    "border-radius": "var(--radius)",
    padding: "0.75rem 0.875rem",
  },
  '[data-leopard="alert"][data-leopard-tone="info"]': {
    "border-color": "color-mix(in oklab, var(--primary) 45%, transparent)",
    "background-color": "color-mix(in oklab, var(--primary) 8%, transparent)",
  },
  '[data-leopard="alert"][data-leopard-tone="success"]': {
    "border-color": "color-mix(in oklab, var(--leopard-ui-success) 45%, transparent)",
    "background-color":
      "color-mix(in oklab, var(--leopard-ui-success) 8%, transparent)",
  },
  '[data-leopard="alert"][data-leopard-tone="warning"]': {
    "border-color": "color-mix(in oklab, var(--leopard-ui-warning) 45%, transparent)",
    "background-color":
      "color-mix(in oklab, var(--leopard-ui-warning) 8%, transparent)",
  },
  '[data-leopard="alert"][data-leopard-tone="danger"]': {
    "border-color": "color-mix(in oklab, var(--destructive) 45%, transparent)",
    "background-color":
      "color-mix(in oklab, var(--destructive) 8%, transparent)",
  },
  '[data-leopard="alert-title"]': { margin: "0 0 0.25rem 0", "font-weight": "500" },
  '[data-leopard="alert-desc"]': {
    margin: "0",
    color: "color-mix(in oklab, currentColor 62%, transparent)",
    "font-size": "0.8125rem",
  },

  '[data-leopard="table"]': { width: "100%", "border-collapse": "collapse" },
  '[data-leopard="table-col"]': {
    "text-align": "left",
    "font-size": "0.75rem",
    "font-weight": "500",
    color: "color-mix(in oklab, currentColor 62%, transparent)",
    padding: "0.5rem 0.75rem",
    "border-bottom": `1px solid ${leopardUiHairlineBorder}`,
  },
  '[data-leopard="table"] td': {
    "font-size": "0.875rem",
    padding: "0.5rem 0.75rem",
    "text-align": "left",
    "font-variant-numeric": "tabular-nums",
  },
  '[data-leopard="table-col"][data-leopard-align="end"], [data-leopard="table"] td[data-leopard-align="end"]':
    { "text-align": "end" },
  '[data-leopard="table-sort"]': {
    appearance: "none",
    padding: "0",
    border: "0",
    "background-color": "transparent",
    color: "inherit",
    "font-family": "inherit",
    "font-size": "inherit",
    "font-weight": "inherit",
    "letter-spacing": "inherit",
    "line-height": "inherit",
    "text-align": "inherit",
    cursor: "pointer",
  },
  '[data-leopard="table-sort-direction"]': {
    margin: "0 0 0 0.25rem",
  },
  '[data-leopard="table-sort"]:focus-visible': {
    outline: "2px solid var(--ring)",
    "outline-offset": "2px",
  },
  '[data-leopard="table"] tbody tr:not(:last-child) td': {
    "border-bottom": `1px solid ${leopardUiHairlineBorder}`,
  },

  '[data-leopard="chart"]': {
    display: "block",
    width: "100%",
    height: "3rem",
    color: "var(--chart-1)",
  },
  '[data-leopard="chart"] polyline, [data-leopard="chart"] polygon': {
    "stroke-width": "1.5",
  },
  '[data-leopard="chart-zero"]': {
    stroke: "var(--muted-foreground)",
    "stroke-opacity": "0.5",
  },
  '[data-leopard="chart"][data-leopard-color] [data-leopard="chart-series"]:only-child': {
    color: "inherit",
  },
  '[data-leopard="chart"][data-leopard-color="emphasis"]': {
    color: "var(--foreground)",
  },
  '[data-leopard="chart"][data-leopard-color="secondary"]': {
    color: "color-mix(in oklab, currentColor 62%, transparent)",
  },
  '[data-leopard="chart"][data-leopard-color="alpha-70"]': {
    color: "color-mix(in oklab, var(--foreground) 70%, transparent)",
  },
  '[data-leopard="chart"][data-leopard-color="white"]': { color: "white" },
  '[data-leopard="chart"][data-leopard-color="white-70"]': {
    color: "color-mix(in oklab, white 70%, transparent)",
  },
  '[data-leopard="chart"][data-leopard-color="white-50"]': {
    color: "color-mix(in oklab, white 50%, transparent)",
  },

  '[data-leopard="chart-frame"]': {
    display: "grid",
    "grid-template-columns": "auto 1fr",
    gap: "0.25rem",
  },
  '[data-leopard="chart-frame"] > [data-leopard="chart-ticks"]': {
    "grid-column": "1",
    "grid-row": "1",
    display: "flex",
    "flex-direction": "column",
    "justify-content": "space-between",
    "text-align": "right",
  },
  '[data-leopard="chart-frame"] > [data-leopard="chart-ticks"], [data-leopard="chart-frame"] > [data-leopard="chart-xlabels"]':
    {
      "font-size": "0.6875rem",
      color: "var(--muted-foreground)",
    },
  '[data-leopard="chart-frame"] > svg[data-leopard="chart"]': {
    "grid-column": "2",
    "grid-row": "1",
    height: "6.5rem",
  },
  '[data-leopard="chart-frame"] > [data-leopard="chart-xlabels"]': {
    "grid-column": "2",
    "grid-row": "2",
    display: "flex",
    "justify-content": "space-between",
  },
  '[data-leopard="chart-frame"] > [data-leopard="chart-legend"]': {
    "grid-column": "1 / -1",
    "grid-row": "3",
    display: "flex",
    gap: "0.75rem",
    "font-size": "0.75rem",
    color: "var(--muted-foreground)",
  },
  '[data-leopard="chart-legend-item"]': {
    display: "inline-flex",
    "align-items": "center",
    gap: "0.25rem",
  },
  '[data-leopard="chart-legend-swatch"]': {
    display: "inline-block",
    width: "0.625rem",
    height: "0.625rem",
    "border-radius": "calc(var(--radius) - 4px)",
    "background-color": "var(--leopard-ui-series-color, currentColor)",
  },
  '[data-leopard="chart-series"][data-leopard-series="0"]': { color: "var(--chart-1)" },
  '[data-leopard="chart-series"][data-leopard-series="1"]': { color: "var(--chart-2)" },
  '[data-leopard="chart-series"][data-leopard-series="2"]': { color: "var(--chart-3)" },
  '[data-leopard="chart-series"][data-leopard-series="3"]': { color: "var(--chart-4)" },
  '[data-leopard="chart-series"][data-leopard-series="4"]': { color: "var(--chart-5)" },
  '[data-leopard="chart-legend-item"][data-leopard-series="0"]': {
    "--leopard-ui-series-color": "var(--chart-1)",
  },
  '[data-leopard="chart-legend-item"][data-leopard-series="1"]': {
    "--leopard-ui-series-color": "var(--chart-2)",
  },
  '[data-leopard="chart-legend-item"][data-leopard-series="2"]': {
    "--leopard-ui-series-color": "var(--chart-3)",
  },
  '[data-leopard="chart-legend-item"][data-leopard-series="3"]': {
    "--leopard-ui-series-color": "var(--chart-4)",
  },
  '[data-leopard="chart-legend-item"][data-leopard-series="4"]': {
    "--leopard-ui-series-color": "var(--chart-5)",
  },
  '[data-leopard="chart-series"][data-leopard-color="emphasis"]': {
    color: "var(--foreground)",
  },
  '[data-leopard="chart-legend-item"][data-leopard-color="emphasis"]': {
    "--leopard-ui-series-color": "var(--foreground)",
  },
  '[data-leopard="chart-series"][data-leopard-color="secondary"]': {
    color: "color-mix(in oklab, var(--foreground) 62%, transparent)",
  },
  '[data-leopard="chart-legend-item"][data-leopard-color="secondary"]': {
    "--leopard-ui-series-color":
      "color-mix(in oklab, var(--foreground) 62%, transparent)",
  },
  '[data-leopard="chart-series"][data-leopard-color="alpha-70"]': {
    color: "color-mix(in oklab, var(--foreground) 70%, transparent)",
  },
  '[data-leopard="chart-legend-item"][data-leopard-color="alpha-70"]': {
    "--leopard-ui-series-color":
      "color-mix(in oklab, var(--foreground) 70%, transparent)",
  },
  '[data-leopard="chart-series"][data-leopard-color="white"]': { color: "white" },
  '[data-leopard="chart-legend-item"][data-leopard-color="white"]': {
    "--leopard-ui-series-color": "white",
  },
  '[data-leopard="chart-series"][data-leopard-color="white-70"]': {
    color: "color-mix(in oklab, white 70%, transparent)",
  },
  '[data-leopard="chart-legend-item"][data-leopard-color="white-70"]': {
    "--leopard-ui-series-color": "color-mix(in oklab, white 70%, transparent)",
  },
  '[data-leopard="chart-series"][data-leopard-color="white-50"]': {
    color: "color-mix(in oklab, white 50%, transparent)",
  },
  '[data-leopard="chart-legend-item"][data-leopard-color="white-50"]': {
    "--leopard-ui-series-color": "color-mix(in oklab, white 50%, transparent)",
  },

  '[data-leopard="carousel-frame"]': {
    "min-width": "0",
  },
  '[data-leopard="carousel"]': {
    display: "flex",
    "overflow-x": "auto",
    "scroll-snap-type": "x mandatory",
    "scroll-behavior": "smooth",
    gap: "0.75rem",
    "padding-bottom": "0.5rem",
    "scrollbar-width": "thin",
  },
  '[data-leopard="carousel"]:focus-visible': {
    outline: "2px solid var(--ring)",
    "outline-offset": "2px",
  },
  '[data-leopard="carousel-slide"]': {
    "scroll-snap-align": "start",
    flex: "0 0 auto",
    "min-width": "14rem",
  },
  '[data-leopard="carousel-controls"]': {
    display: "flex",
    "justify-content": "flex-end",
    gap: "0.25rem",
    margin: "0.5rem 0 0",
  },
  '[data-leopard="carousel-prev"], [data-leopard="carousel-next"]': {
    display: "inline-flex",
    "align-items": "center",
    "justify-content": "center",
    width: "2rem",
    height: "2rem",
    padding: "0",
    border: "0",
    "border-radius": "calc(var(--radius) - 2px)",
    appearance: "none",
    "background-color": "transparent",
    color: "inherit",
    cursor: "pointer",
  },
  '[data-leopard="carousel-prev"]:hover, [data-leopard="carousel-next"]:hover': {
    "background-color": "var(--muted)",
  },
  '[data-leopard="carousel-prev"]:focus-visible, [data-leopard="carousel-next"]:focus-visible':
    {
      outline: "2px solid var(--ring)",
      "outline-offset": "2px",
    },
  '[data-leopard="carousel-prev"]:disabled, [data-leopard="carousel-next"]:disabled': {
    opacity: "0.5",
    cursor: "default",
  },
  "@media (prefers-reduced-motion: reduce)": {
    '[data-leopard="carousel"]': { "scroll-behavior": "auto" },
    '[data-leopard="checkbox"][data-leopard-variant="switch"] input, [data-leopard="checkbox"][data-leopard-variant="switch"] input::before':
      { transition: "none" },
    '[data-leopard="button"][data-leopard-state="pending"]': {
      transition: "none",
    },
    '[data-leopard="checkboxgroup-progress-fill"]': { transition: "none" },
  },

  '[data-leopard="listview"]': {
    "list-style": "none",
    margin: "0",
    padding: "0",
  },
  '[data-leopard="listview-item"] + [data-leopard="listview-item"]': {
    "border-top": `1px solid ${leopardUiHairlineBorder}`,
  },
  '[data-leopard="listview-item-trigger"]': {
    padding: "0.75rem 0.875rem",
    "border-radius": "calc(var(--radius) - 2px)",
    cursor: "pointer",
  },
  '[data-leopard="listview-item-trigger"]:hover': {
    "background-color": "color-mix(in oklab, var(--muted) 50%, transparent)",
  },
  '[data-leopard="listview-item-trigger"] > button:focus-visible': {
    outline: "2px solid var(--ring)",
    "outline-offset": "2px",
    "border-radius": "inherit",
  },

  '[data-leopard="tabs"]': {
    display: "flex",
    "flex-direction": "column",
    gap: "0.75rem",
    "min-width": "0",
  },
  '[data-leopard="tabs-list"]': {
    display: "flex",
    gap: "0.25rem",
    "overflow-x": "auto",
    "border-bottom": `1px solid ${leopardUiHairlineBorder}`,
  },
  '[data-leopard="tabs-tab"]': {
    appearance: "none",
    border: "0",
    "border-bottom": "2px solid transparent",
    "margin-bottom": "-1px",
    padding: "0.5rem 0.75rem",
    background: "transparent",
    color: "color-mix(in oklab, currentColor 62%, transparent)",
    font: "inherit",
    "font-size": "0.875rem",
    "font-weight": "500",
    "white-space": "nowrap",
    cursor: "pointer",
  },
  '[data-leopard="tabs-tab"]:hover': { color: "inherit" },
  '[data-leopard="tabs-tab"][aria-selected="true"]': {
    color: "inherit",
    "border-bottom-color": "currentColor",
  },
  '[data-leopard="tabs-tab"]:focus-visible, [data-leopard="tabs-panel"]:focus-visible':
    {
      outline: "2px solid var(--ring)",
      "outline-offset": "2px",
      "border-radius": "calc(var(--radius) - 4px)",
    },

  '[data-leopard="steps"], [data-leopard="timeline"]': {
    display: "flex",
    "flex-direction": "column",
    gap: "1rem",
    margin: "0",
    padding: "0",
    "list-style": "none",
  },
  '[data-leopard="steps"]': { "counter-reset": "leopard-step" },
  '[data-leopard="steps-item"]': {
    position: "relative",
    "min-height": "1.5rem",
    "padding-inline-start": "2.25rem",
    "counter-increment": "leopard-step",
  },
  '[data-leopard="steps-item"]::before': {
    content: "counter(leopard-step)",
    position: "absolute",
    top: "0",
    "inset-inline-start": "0",
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    width: "1.5rem",
    height: "1.5rem",
    "border-radius": "9999px",
    "background-color": "var(--muted)",
    color: "var(--foreground)",
    "font-size": "0.75rem",
    "font-weight": "600",
    "font-variant-numeric": "tabular-nums",
  },
  '[data-leopard="timeline-item"]': {
    position: "relative",
    "padding-inline-start": "1.5rem",
  },
  '[data-leopard="timeline-item"]::before': {
    content: '""',
    position: "absolute",
    top: "0.4375rem",
    "inset-inline-start": "0.25rem",
    width: "0.5rem",
    height: "0.5rem",
    "border-radius": "9999px",
    "background-color": "currentColor",
  },
  '[data-leopard="steps-item"]:not(:last-child)::after, [data-leopard="timeline-item"]:not(:last-child)::after':
    {
      content: '""',
      position: "absolute",
      bottom: "-0.875rem",
      width: "1px",
      "background-color": leopardUiHairlineBorder,
    },
  '[data-leopard="steps-item"]:not(:last-child)::after': {
    top: "1.875rem",
    "inset-inline-start": "0.75rem",
  },
  '[data-leopard="timeline-item"]:not(:last-child)::after': {
    top: "1.125rem",
    "inset-inline-start": "0.5rem",
  },
  '[data-leopard="steps-title"], [data-leopard="timeline-title"]': {
    "font-weight": "600",
    "line-height": "1.5",
  },
  '[data-leopard="steps-detail"], [data-leopard="timeline-detail"]': {
    "margin-top": "0.125rem",
    "font-size": "0.875rem",
    "line-height": "1.5",
    color: "color-mix(in oklab, currentColor 70%, transparent)",
  },
  '[data-leopard="timeline-time"]': {
    "font-size": "0.75rem",
    "font-weight": "500",
    "line-height": "1.4",
    "font-variant-numeric": "tabular-nums",
    color: "color-mix(in oklab, currentColor 62%, transparent)",
  },

  '[data-leopard="citation"]': {
    position: "relative",
    display: "flex",
    "flex-direction": "column",
    gap: "0.125rem",
    padding: "0.625rem 0.75rem",
    border: `1px solid ${leopardUiHairlineBorder}`,
    "border-radius": "calc(var(--radius) - 2px)",
  },
  '[data-leopard="citation-source"]': {
    "font-size": "0.75rem",
    "line-height": "1.4",
    color: "color-mix(in oklab, currentColor 62%, transparent)",
  },
  '[data-leopard="citation-title"]': {
    color: "inherit",
    "font-weight": "500",
    "line-height": "1.4",
    "text-decoration": "none",
  },
  'a[data-leopard="citation-title"]::after': {
    content: '""',
    position: "absolute",
    inset: "0",
    "border-radius": "calc(var(--radius) - 2px)",
  },
  'a[data-leopard="citation-title"]:hover': {
    "text-decoration": "underline",
    "text-underline-offset": "2px",
  },
  'a[data-leopard="citation-title"]:focus-visible': { outline: "none" },
  'a[data-leopard="citation-title"]:focus-visible::after': {
    outline: "2px solid var(--ring)",
    "outline-offset": "2px",
  },
  '[data-leopard="citation-snippet"]': {
    display: "-webkit-box",
    overflow: "hidden",
    "-webkit-box-orient": "vertical",
    "-webkit-line-clamp": "3",
    "font-size": "0.8125rem",
    "line-height": "1.45",
    color: "color-mix(in oklab, currentColor 70%, transparent)",
  },

  '[data-leopard="divider"]': {
    border: "none",
    "border-top": `1px solid ${leopardUiHairlineBorder}`,
    margin: "0.75rem 0",
  },
  '[data-leopard="divider"][data-leopard-flush]': { margin: "0" },
  '[data-leopard="card"] > [data-leopard="divider"]': { margin: "0" },

  '[data-leopard="diagram"]': {
    display: "flex",
    "flex-direction": "column",
    gap: "0.375rem",
    margin: "0",
  },
  '[data-leopard="diagram-code"]': {
    margin: "0",
    padding: "0.75rem 0.875rem",
    "overflow-x": "auto",
    "border-radius": "calc(var(--radius) - 2px)",
    "background-color": "color-mix(in oklab, var(--muted) 60%, transparent)",
    "font-family":
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    "font-size": "0.8125rem",
    "line-height": "1.5",
  },
  '[data-leopard="diagram-title"]': {
    "font-size": "0.75rem",
    "line-height": "1.4",
    color: "color-mix(in oklab, currentColor 62%, transparent)",
  },
  'ol[data-leopard="map"]': {
    display: "flex",
    "flex-direction": "column",
    gap: "0.5rem",
    margin: "0",
    padding: "0",
    "list-style": "none",
  },
  '[data-leopard="map-place-label"]': {
    color: "inherit",
    "font-weight": "500",
    "text-decoration": "underline",
    "text-underline-offset": "2px",
  },
  '[data-leopard="map-place-detail"]': {
    "font-size": "0.8125rem",
    "line-height": "1.5",
    color: "color-mix(in oklab, currentColor 70%, transparent)",
  },

  '[data-leopard="image"]': {
    "max-width": "100%",
    display: "block",
    "border-radius": "calc(var(--radius) - 2px)",
  },
  '[data-leopard="image"][data-leopard-size="sm"]': { "max-width": "8rem" },
  '[data-leopard="image"][data-leopard-size="md"]': { "max-width": "16rem" },
  '[data-leopard="image"][data-leopard-size="lg"]': { "max-width": "24rem" },
  '[data-leopard="image"][data-leopard-round]': {
    width: "2.5rem",
    height: "2.5rem",
    "border-radius": "9999px",
    "object-fit": "cover",
    "aspect-ratio": "1 / 1",
  },
  '[data-leopard="image"][data-leopard-round][data-leopard-size="sm"]': {
    width: "2rem",
    height: "2rem",
  },
  '[data-leopard="image"][data-leopard-round][data-leopard-size="md"]': {
    width: "2.5rem",
    height: "2.5rem",
  },
  '[data-leopard="image"][data-leopard-round][data-leopard-size="lg"]': {
    width: "3.25rem",
    height: "3.25rem",
  },
  '[data-leopard="row"] > [data-leopard="image"]:not([data-leopard-size="sm"], [data-leopard-sized], [data-leopard-round])':
    {
      flex: "1 1 0",
      "min-width": "max(5rem, 22%)",
      "aspect-ratio": "4 / 3",
      "object-fit": "cover",
    },
  '[data-leopard="row"] > [data-leopard="image"]:first-child:nth-last-child(n+4):not([data-leopard-size="sm"], [data-leopard-sized], [data-leopard-round]), [data-leopard="row"] > [data-leopard="image"]:first-child:nth-last-child(n+4) ~ [data-leopard="image"]:not([data-leopard-size="sm"], [data-leopard-sized], [data-leopard-round])':
    { "min-width": "0" },
  '[data-leopard="row"] > [data-leopard="image"][data-leopard-size="sm"]:not([data-leopard-round])':
    {
      flex: "none",
      width: "4.5rem",
      "aspect-ratio": "1 / 1",
      "object-fit": "cover",
    },

  '[data-leopard="markdown"]': { "font-size": "0.875rem", "line-height": "1.6" },
  '[data-leopard="markdown"] p': { margin: "0 0 0.5rem 0" },
  '[data-leopard="markdown"] p:last-child': { "margin-bottom": "0" },
  '[data-leopard="markdown"] a': {
    color: "var(--primary)",
    "text-decoration": "underline",
    "text-underline-offset": "2px",
  },
  '[data-leopard="markdown"] code': {
    "font-size": "0.8125em",
    "background-color": "color-mix(in oklab, var(--muted) 60%, transparent)",
    padding: "0.125rem 0.375rem",
    "border-radius": "calc(var(--radius) - 4px)",
    "font-family":
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  },
  '[data-leopard="markdown"] pre': {
    "background-color": "color-mix(in oklab, var(--muted) 60%, transparent)",
    padding: "0.75rem",
    "border-radius": "calc(var(--radius) - 2px)",
    "overflow-x": "auto",
  },
  '[data-leopard="markdown"] pre code': {
    "background-color": "transparent",
    padding: "0",
  },
  '[data-leopard="markdown"] ul, [data-leopard="markdown"] ol': {
    "padding-left": "1.25rem",
  },
  '[data-leopard="markdown"] ol': { "list-style-type": "decimal" },
  '[data-leopard="markdown"] ul': { "list-style-type": "disc" },
  '[data-leopard="markdown"] li': { margin: "0.25rem 0" },
  '[data-leopard="markdown"] h1, [data-leopard="markdown"] h2, [data-leopard="markdown"] h3':
    {
      margin: "0.75em 0 0.25em",
      "font-weight": "600",
    },
  '[data-leopard="markdown"] h1': { "font-size": "1.125em" },
  '[data-leopard="markdown"] h2': { "font-size": "1.0625em" },
  '[data-leopard="markdown"] h3': { "font-size": "1em" },
  '[data-leopard="markdown"] blockquote': {
    "border-left": `2px solid ${leopardUiHairlineBorder}`,
    "padding-left": "0.75rem",
    color: "color-mix(in oklab, currentColor 62%, transparent)",
    margin: "0.5em 0",
  },
  '[data-leopard="markdown"] table': {
    display: "block",
    "max-width": "100%",
    "overflow-x": "auto",
    "border-collapse": "collapse",
    margin: "0.5rem 0",
    "font-size": "0.8125rem",
  },
  '[data-leopard="markdown"] th, [data-leopard="markdown"] td': {
    padding: "0.375rem 0.75rem",
    "vertical-align": "top",
  },
  '[data-leopard="markdown"] th:not([align]), [data-leopard="markdown"] td:not([align])':
    { "text-align": "start" },
  '[data-leopard="markdown"] th': {
    "font-weight": "500",
    "border-bottom": `1px solid ${leopardUiHairlineBorder}`,
  },
  '[data-leopard="markdown"] tbody tr:not(:last-child) td': {
    "border-bottom": `1px solid ${leopardUiHairlineBorder}`,
  },

  '[data-leopard="badge"]': {
    display: "inline-flex",
    "align-self": "flex-start",
    "align-items": "center",
    gap: "0.25rem",
    "border-radius": "9999px",
    padding: "0.125rem 0.5rem",
    "font-size": "0.75rem",
    "font-weight": "500",
    "line-height": "1.4",
    "font-variant-numeric": "tabular-nums",
    "background-color": "var(--muted)",
    color: "color-mix(in oklab, currentColor 62%, transparent)",
    "flex-shrink": "0",
    "white-space": "nowrap",
  },
  '[data-leopard="row"][data-leopard-align="start"] > [data-leopard="badge"], [data-leopard="col"][data-leopard-align="start"] > [data-leopard="badge"]':
    {
      "align-self": "flex-start",
    },
  '[data-leopard="row"][data-leopard-align="center"] > [data-leopard="badge"], [data-leopard="col"][data-leopard-align="center"] > [data-leopard="badge"]':
    {
      "align-self": "center",
    },
  '[data-leopard="row"][data-leopard-align="end"] > [data-leopard="badge"], [data-leopard="col"][data-leopard-align="end"] > [data-leopard="badge"]':
    {
      "align-self": "flex-end",
    },
  '[data-leopard="badge"][data-leopard-variant="info"]': {
    "background-color": "color-mix(in oklab, var(--primary) 15%, transparent)",
    color: "var(--primary)",
  },
  [tintedCardDefaultBadge]: tintedCardDefaultBadgeStyle,
  [tintedCardInfoBadge]: tintedCardInfoBadgeStyle,
  '[data-leopard="badge"][data-leopard-variant="success"]': {
    "background-color":
      "color-mix(in oklab, var(--leopard-ui-success) 15%, transparent)",
    color: toneText("--leopard-ui-success"),
  },
  '[data-leopard="badge"][data-leopard-variant="warning"]': {
    "background-color":
      "color-mix(in oklab, var(--leopard-ui-warning) 15%, transparent)",
    color: toneText("--leopard-ui-warning"),
  },
  '[data-leopard="badge"][data-leopard-variant="danger"]': {
    "background-color":
      "color-mix(in oklab, var(--destructive) 15%, transparent)",
    color: toneText("--destructive"),
  },
};

export const leopardUiToneVars = {
  light: {
    "--leopard-ui-success": "oklch(0.6 0.15 149)",
    "--leopard-ui-warning": "oklch(0.68 0.16 70)",
    "--leopard-ui-panel": inkFill(4),
  },
  dark: {
    "--leopard-ui-success": "oklch(0.72 0.17 149)",
    "--leopard-ui-warning": "oklch(0.8 0.17 75)",
    "--leopard-ui-panel": inkFill(6),
  },
} as const;

const T = '[data-leopard-ui-theme]';
const TD = `.dark ${T}`;
const themeHairline = inkFill(6);
const themeMonoStack =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

export const leopardUiSurfaceThemeVars = {
  light: {
    "--leopard-ui-live": "var(--leopard-amber)",
  },
  dark: {
    "--leopard-ui-live": "var(--leopard-amber)",
  },
} as const;

export const leopardUiSurfaceThemeCss: LeopardCssRuleset = {
  [`${T} [data-leopard="card"]`]: { "border-radius": "14px" },
  [cardSurface(T)]: {
    border: `1px solid ${leopardUiHairlineBorder}`,
    "border-radius": "20px",
    "background-color": "var(--background)",
    "box-shadow": "none",
  },
  [cardSurface(TD)]: {
    "background-color": "var(--popover)",
    "box-shadow": "none",
  },
  [`${T} [data-leopard="card-footer"]`]: {
    "border-top": "none",
    "padding-top": "0.25rem",
  },

  [`${T} [data-leopard="select"], ${T} [data-leopard="input"], ${T} [data-leopard="datepicker"]`]:
    {
      border: "none",
      "border-radius": "12px",
      "background-color": inkFill(4),
      "caret-color": "var(--leopard-ui-live)",
      transition: "background-color 0.15s ease",
    },
  [`${TD} [data-leopard="select"], ${TD} [data-leopard="input"], ${TD} [data-leopard="datepicker"]`]:
    {
      "background-color": inkFill(6),
    },
  [`${T} [data-leopard="select"]:focus-visible, ${T} [data-leopard="input"]:focus-visible, ${T} [data-leopard="datepicker"]:focus-visible`]:
    {
      outline: "none",
      "background-color": inkFill(7),
    },
  [`${TD} [data-leopard="select"]:focus-visible, ${TD} [data-leopard="input"]:focus-visible, ${TD} [data-leopard="datepicker"]:focus-visible`]:
    {
      "background-color": inkFill(9),
    },
  [`${T} [data-leopard="input"]::placeholder`]: {
    color: inkFill(35),
  },

  [`${T} [data-leopard="button"], ${T} [data-leopard="card-confirm"], ${T} [data-leopard="card-cancel"]`]:
    {
      border: "none",
      "border-radius": "9999px",
      transition:
        "background-color 0.15s ease, color 0.15s ease, opacity 0.15s ease, transform 0.15s cubic-bezier(0.23, 1, 0.32, 1)",
    },
  [`${T} [data-leopard="button"]:active, ${T} [data-leopard="card-confirm"]:active, ${T} [data-leopard="card-cancel"]:active`]:
    {
      transform: "scale(0.96)",
    },
  [`${T} [data-leopard="button"]:focus-visible, ${T} [data-leopard="card-confirm"]:focus-visible, ${T} [data-leopard="card-cancel"]:focus-visible`]:
    {
      outline: `2px solid ${inkFill(20)}`,
      "outline-offset": "2px",
    },
  [`${T} [data-leopard="button"][data-leopard-style="primary"], ${T} [data-leopard="card-confirm"]`]:
    {
      "background-color": "var(--foreground)",
      color: "var(--background)",
    },
  [`${T} [data-leopard="button"][data-leopard-style="primary"]:hover, ${T} [data-leopard="card-confirm"]:hover`]:
    {
      "background-color": "var(--foreground)",
      opacity: "0.9",
    },
  [`${T} [data-leopard="button"][data-leopard-style="secondary"], ${T} [data-leopard="button"][data-leopard-style="outline"], ${T} [data-leopard="button"]:not([data-leopard-style])`]:
    {
      "background-color": inkFill(4),
      color: "var(--foreground)",
      "border-color": "transparent",
    },
  [`${T} [data-leopard="button"][data-leopard-style="secondary"]:hover, ${T} [data-leopard="button"][data-leopard-style="outline"]:hover, ${T} [data-leopard="button"]:not([data-leopard-style]):hover`]:
    {
      "background-color": inkFill(7),
      color: "var(--foreground)",
    },
  [`${TD} [data-leopard="button"][data-leopard-style="secondary"], ${TD} [data-leopard="button"][data-leopard-style="outline"], ${TD} [data-leopard="button"]:not([data-leopard-style])`]:
    {
      "background-color": inkFill(6),
    },
  [`${T} [data-leopard="button"][data-leopard-style="ghost"], ${T} [data-leopard="card-cancel"], ${T} [data-leopard="carousel-prev"], ${T} [data-leopard="carousel-next"]`]:
    {
      "background-color": "transparent",
      color: inkFill(55),
    },
  [`${T} [data-leopard="button"][data-leopard-style="ghost"]:hover, ${T} [data-leopard="card-cancel"]:hover, ${T} [data-leopard="carousel-prev"]:hover, ${T} [data-leopard="carousel-next"]:hover`]:
    {
      "background-color": inkFill(6),
      color: inkFill(90),
    },

  [`${T} [data-leopard="checkbox"] input, ${T} [data-leopard="radiogroup-option"] input, ${T} [data-leopard="checkboxgroup-option"] input`]:
    {
      "accent-color": "var(--foreground)",
    },

  [`${T} [data-leopard="alert"]`]: {
    "border-radius": "14px",
  },
  [`${T} [data-leopard="alert"]:not([data-leopard-tone])`]: {
    "border-color": leopardUiHairlineBorder,
  },
  [`${T} [data-leopard="alert-title"]`]: {
    "font-size": "0.875rem",
    "font-weight": "500",
  },
  [`${T} [data-leopard="alert-desc"]`]: {
    "font-size": "0.8125rem",
  },

  [`${T} [data-leopard="divider"]`]: {
    "border-top-color": themeHairline,
  },
  [`${T} [data-leopard="listview-item"] + [data-leopard="listview-item"]`]: {
    "border-top-color": themeHairline,
  },
  [`${T} [data-leopard="listview-item-trigger"]`]: {
    "border-radius": "10px",
  },
  [`${T} [data-leopard="listview-item-trigger"]:hover`]: {
    "background-color": inkFill(4),
  },

  [`${T} [data-leopard="tabs-list"]`]: {
    "border-bottom-color": themeHairline,
  },
  [`${T} [data-leopard="steps-item"]::before`]: {
    "background-color": inkFill(6),
  },
  [`${T} [data-leopard="steps-item"]:not(:last-child)::after, ${T} [data-leopard="timeline-item"]:not(:last-child)::after`]:
    {
      "background-color": themeHairline,
    },
  [`${T} [data-leopard="citation"]`]: {
    "border-color": themeHairline,
    "border-radius": "14px",
  },
  [`${T} a[data-leopard="citation-title"]::after`]: {
    "border-radius": "14px",
  },
  [`${T} [data-leopard="checkboxgroup-progress-track"]`]: {
    "background-color": inkFill(6),
  },
  [`${T} [data-leopard="checkboxgroup-progress-fill"]`]: {
    "background-color": "var(--foreground)",
  },

  [`${T} [data-leopard="table-col"]`]: {
    "font-family": themeMonoStack,
    "font-size": "0.6875rem",
    "letter-spacing": "-0.01em",
    "text-transform": "none",
    color: inkFill(35),
    "border-bottom-color": themeHairline,
  },
  [`${T} [data-leopard="table"] tbody tr:not(:last-child) td`]: {
    "border-bottom-color": themeHairline,
  },

  [`${T} [data-leopard="fact-label"]`]: {
    "font-family": themeMonoStack,
    "letter-spacing": "-0.01em",
    "text-transform": "none",
    color: inkFill(35),
  },

  [`${T} [data-leopard="badge"]`]: {
    "align-self": "center",
  },
  [`${T} [data-leopard="badge"]:not([data-leopard-variant])`]: {
    "background-color": inkFill(6),
    color: inkFill(70),
  },
  [`${T} [data-leopard="badge"][data-leopard-variant="info"]`]: {
    "background-color": "color-mix(in oklab, var(--leopard-ui-live) 12%, transparent)",
    color: "var(--leopard-ui-live)",
  },
  [`${T} [data-leopard="badge"][data-leopard-variant="success"]`]: {
    "background-color":
      "color-mix(in oklab, var(--leopard-ui-success) 15%, transparent)",
    color: toneText("--leopard-ui-success"),
  },
  [`${T} [data-leopard="badge"][data-leopard-variant="warning"]`]: {
    "background-color":
      "color-mix(in oklab, var(--leopard-ui-warning) 15%, transparent)",
    color: toneText("--leopard-ui-warning"),
  },
  [`${T} [data-leopard="badge"][data-leopard-variant="danger"]`]: {
    "background-color":
      "color-mix(in oklab, var(--destructive) 15%, transparent)",
    color: toneText("--destructive"),
  },
  [`${T} ${tintedCardDefaultBadge}`]: tintedCardDefaultBadgeStyle,
  [`${TD} ${tintedCardDefaultBadge}`]: tintedCardDefaultBadgeStyle,
  [`${T} ${tintedCardInfoBadge}`]: tintedCardInfoBadgeStyle,
  [`${TD} ${tintedCardInfoBadge}`]: tintedCardInfoBadgeStyle,

  [`${T} [data-leopard="chart"]`]: {
    color: inkFill(70),
  },
  [`${T} [data-leopard="chart"] polygon`]: {
    "fill-opacity": "0.12",
  },
  [`${T} [data-leopard="chart-series"][data-leopard-series="0"]`]: {
    color: inkFill(80),
  },
  [`${T} [data-leopard="chart-series"][data-leopard-series="1"]`]: {
    color: "var(--leopard-ui-live)",
  },
  [`${T} [data-leopard="chart-series"][data-leopard-series="2"]`]: {
    color: inkFill(45),
  },
  [`${T} [data-leopard="chart-series"][data-leopard-series="3"]`]: {
    color: "var(--leopard-ui-success)",
  },
  [`${T} [data-leopard="chart-series"][data-leopard-series="4"]`]: {
    color: inkFill(30),
  },
  [`${T} [data-leopard="chart-legend-item"][data-leopard-series="0"]`]: {
    "--leopard-ui-series-color": inkFill(80),
  },
  [`${T} [data-leopard="chart-legend-item"][data-leopard-series="1"]`]: {
    "--leopard-ui-series-color": "var(--leopard-ui-live)",
  },
  [`${T} [data-leopard="chart-legend-item"][data-leopard-series="2"]`]: {
    "--leopard-ui-series-color": inkFill(45),
  },
  [`${T} [data-leopard="chart-legend-item"][data-leopard-series="3"]`]: {
    "--leopard-ui-series-color": "var(--leopard-ui-success)",
  },
  [`${T} [data-leopard="chart-legend-item"][data-leopard-series="4"]`]: {
    "--leopard-ui-series-color": inkFill(30),
  },
  [`${T} [data-leopard="chart-series"][data-leopard-color="emphasis"]`]: {
    color: "var(--foreground)",
  },
  [`${T} [data-leopard="chart-legend-item"][data-leopard-color="emphasis"]`]: {
    "--leopard-ui-series-color": "var(--foreground)",
  },
  [`${T} [data-leopard="chart-series"][data-leopard-color="secondary"]`]: {
    color: "color-mix(in oklab, var(--foreground) 62%, transparent)",
  },
  [`${T} [data-leopard="chart-legend-item"][data-leopard-color="secondary"]`]: {
    "--leopard-ui-series-color":
      "color-mix(in oklab, var(--foreground) 62%, transparent)",
  },
  [`${T} [data-leopard="chart-series"][data-leopard-color="alpha-70"]`]: {
    color: "color-mix(in oklab, var(--foreground) 70%, transparent)",
  },
  [`${T} [data-leopard="chart-legend-item"][data-leopard-color="alpha-70"]`]: {
    "--leopard-ui-series-color":
      "color-mix(in oklab, var(--foreground) 70%, transparent)",
  },
  [`${T} [data-leopard="chart-series"][data-leopard-color="white"]`]: {
    color: "white",
  },
  [`${T} [data-leopard="chart-legend-item"][data-leopard-color="white"]`]: {
    "--leopard-ui-series-color": "white",
  },
  [`${T} [data-leopard="chart-series"][data-leopard-color="white-70"]`]: {
    color: "color-mix(in oklab, white 70%, transparent)",
  },
  [`${T} [data-leopard="chart-legend-item"][data-leopard-color="white-70"]`]: {
    "--leopard-ui-series-color": "color-mix(in oklab, white 70%, transparent)",
  },
  [`${T} [data-leopard="chart-series"][data-leopard-color="white-50"]`]: {
    color: "color-mix(in oklab, white 50%, transparent)",
  },
  [`${T} [data-leopard="chart-legend-item"][data-leopard-color="white-50"]`]: {
    "--leopard-ui-series-color": "color-mix(in oklab, white 50%, transparent)",
  },
  [`${T} [data-leopard="chart-legend-swatch"]`]: {
    "border-radius": "9999px",
  },

  [`${T} [data-leopard="image"]`]: {
    "border-radius": "12px",
    outline: "1px solid oklch(0 0 0 / 0.08)",
    "outline-offset": "-1px",
  },
  [`${TD} [data-leopard="image"]`]: {
    outline: "1px solid oklch(1 0 0 / 0.1)",
  },

  [`${T} [data-leopard="markdown"] a`]: {
    color: "var(--leopard-ui-live)",
  },
  [`${T} [data-leopard="markdown"] code, ${T} [data-leopard="markdown"] pre`]: {
    "background-color": inkFill(5),
  },
};

export function isDeclarationBlock(
  rule: LeopardCssDeclarations | LeopardCssMediaBlock,
): rule is LeopardCssDeclarations {
  return Object.values(rule).every((value) => typeof value === "string");
}

function formatDeclarationBlock(
  selector: string,
  declarations: LeopardCssDeclarations,
): string {
  const body = Object.entries(declarations)
    .map(([property, value]) => `  ${property}: ${value};`)
    .join("\n");
  return `${selector} {\n${body}\n}`;
}

function indent(text: string): string {
  return text
    .split("\n")
    .map((line) => (line ? `  ${line}` : line))
    .join("\n");
}

function serializeRuleset(ruleset: LeopardCssRuleset): string {
  return Object.entries(ruleset)
    .map(([selector, rule]) =>
      isDeclarationBlock(rule)
        ? formatDeclarationBlock(selector, rule)
        : `${selector} {\n${indent(
            Object.entries(rule)
              .map(([nestedSelector, declarations]) =>
                formatDeclarationBlock(nestedSelector, declarations),
              )
              .join("\n\n"),
          )}\n}`,
    )
    .join("\n\n");
}

export function leopardUiCssText(): string {
  return serializeRuleset(leopardUiVocabularyCss);
}

export function leopardUiSurfaceThemeCssText(): string {
  return serializeRuleset(leopardUiSurfaceThemeCss);
}

function formatVarsBlock(
  selector: string,
  vars: Record<string, string>,
): string {
  return formatDeclarationBlock(selector, vars);
}

export function leopardUiVarsText(): string {
  return [
    formatVarsBlock(":root", leopardUiToneVars.light),
    formatVarsBlock(".dark", leopardUiToneVars.dark),
    formatVarsBlock(
      "[data-leopard-ui-theme]",
      leopardUiSurfaceThemeVars.light,
    ),
    formatVarsBlock(
      ".dark [data-leopard-ui-theme]",
      leopardUiSurfaceThemeVars.dark,
    ),
  ].join("\n\n");
}
