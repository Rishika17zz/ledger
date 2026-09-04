// @ts-check
import reactHooks from "eslint-plugin-react-hooks";
import { baseConfig } from "@ledger/config/eslint.base.js";

export default [
  ...baseConfig,
  {
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    ignores: [".next/**", "postcss.config.cjs"],
  },
];
