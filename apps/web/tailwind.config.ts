import type { Config } from "tailwindcss";

/**
 * Design tokens for Ledger. This file *is* the design system: colors carry
 * functional meaning (gain/loss/attention/quiet, never decorative), and the
 * type scale is deliberate rather than ad hoc Tailwind sizes. See README
 * "UI design" section for the rationale.
 */
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#090C11",
          900: "#0E121A",
          800: "#141924",
          700: "#1C2330",
          600: "#2A3242",
        },
        text: {
          primary: "#E7EAF1",
          secondary: "#97A1B5",
          tertiary: "#616B7E",
        },
        signal: {
          gain: "#34D0A0",
          loss: "#F2596B",
          attention: "#E8A93B",
          quiet: "#56607A",
        },
        accent: {
          focus: "#5AC8FA",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        display: ["2.5rem", { lineHeight: "1.1", fontWeight: "700" }],
        h1: ["1.75rem", { lineHeight: "1.2", fontWeight: "700" }],
        h2: ["1.25rem", { lineHeight: "1.3", fontWeight: "600" }],
        body: ["0.9375rem", { lineHeight: "1.5", fontWeight: "400" }],
        small: ["0.8125rem", { lineHeight: "1.4", fontWeight: "400" }],
        micro: ["0.6875rem", { lineHeight: "1.3", fontWeight: "500" }],
        "tabular-lg": ["1.5rem", { lineHeight: "1.2", fontWeight: "600" }],
        "tabular-base": ["0.875rem", { lineHeight: "1.4", fontWeight: "500" }],
      },
      keyframes: {
        "flash-update": {
          "0%": { backgroundColor: "rgba(90, 200, 250, 0.16)" },
          "100%": { backgroundColor: "transparent" },
        },
      },
      animation: {
        "flash-update": "flash-update 900ms ease-out",
      },
    },
  },
  plugins: [],
} satisfies Config;
