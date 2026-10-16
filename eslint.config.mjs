import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    files: ["hooks/use-active-chat.tsx"],
    rules: {
      "no-restricted-globals": [
        "error",
        {
          name: "requestAnimationFrame",
          message:
            "RAF is suspended whenever the compositor is not painting (hidden/backgrounded tab, headless). Use a setTimeout tick, which fires in every visibility state.",
        },
      ],
    },
  },
]);

export default eslintConfig;
