import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // The shadcn names point at the beach tokens, so a base component and a /design screen can never drift apart.
        // The card line is the soft 1 px line; a control's frame (input) is the stronger 4.5:1 one; the ring is the focus colour.
        border: "var(--beach-line)",
        input: "var(--beach-border)",
        ring: "var(--beach-focus)",
        background: "var(--beach-bg)",
        foreground: "var(--beach-ink)",
        primary: { DEFAULT: "var(--beach-accent)", foreground: "var(--beach-on-accent)" },
        secondary: { DEFAULT: "var(--beach-surface)", foreground: "var(--beach-ink)" },
        destructive: { DEFAULT: "var(--beach-crash)", foreground: "var(--beach-on-crash)" },
        muted: { DEFAULT: "var(--beach-surface)", foreground: "var(--beach-muted)" },
        accent: { DEFAULT: "var(--beach-surface)", foreground: "var(--beach-ink)" },
        card: { DEFAULT: "var(--beach-bg)", foreground: "var(--beach-ink)" },
        // Official screens and /design: the beach themes (see .beach-day / .beach-dark in globals.css)
        beach: {
          bg: "var(--beach-bg)",
          surface: "var(--beach-surface)",
          line: "var(--beach-line)",
          ink: "var(--beach-ink)",
          muted: "var(--beach-muted)",
          border: "var(--beach-border)",
          focus: "var(--beach-focus)",
          accent: "var(--beach-accent)",
          "on-accent": "var(--beach-on-accent)",
          live: "var(--beach-live)",
          pending: "var(--beach-pending)",
          failed: "var(--beach-failed)",
          crash: "var(--beach-crash)",
          "on-crash": "var(--beach-on-crash)",
          outlier: "var(--beach-outlier)",
          missing: "var(--beach-missing)",
          "tint-crash": "var(--beach-tint-crash)",
          "tint-grey": "var(--beach-tint-grey)",
          "tint-grade0": "var(--beach-tint-grade0)",
          "tint-grade1": "var(--beach-tint-grade1)",
          "tint-grade2": "var(--beach-tint-grade2)",
          "tint-grade3": "var(--beach-tint-grade3)",
          "tint-grade4": "var(--beach-tint-grade4)",
          "tint-dist0": "var(--beach-tint-dist0)",
          "tint-dist1": "var(--beach-tint-dist1)",
          "tint-dist2": "var(--beach-tint-dist2)",
          "tint-dist3": "var(--beach-tint-dist3)",
        },
      },
      fontSize: {
        body: ["var(--size-body)", { lineHeight: "1.4" }],
        small: ["var(--size-small)", { lineHeight: "1.3" }],
        name: ["var(--size-name)", { lineHeight: "1.25" }],
        digit: ["var(--size-digit)", { lineHeight: "1.1" }],
        readout: ["var(--size-readout)", { lineHeight: "1.05" }],
        heading: ["var(--size-heading)", { lineHeight: "1.2" }],
        composed: ["var(--size-composed)", { lineHeight: "1.2" }],
        "timer-slim": ["var(--size-timer-slim)", { lineHeight: "1" }],
        "timer-head": ["var(--size-timer-head)", { lineHeight: "1" }],
      },
      minHeight: { pad: "var(--size-pad-height)", tap: "var(--size-tap)", row: "var(--size-row)", bar: "var(--size-bar)" },
      minWidth: { pad: "var(--size-pad-height)", tap: "var(--size-tap)" },
      borderRadius: { lg: "var(--radius)", md: "calc(var(--radius) - 2px)", sm: "calc(var(--radius) - 4px)", card: "var(--size-radius, 14px)" },
    },
  },
  plugins: [animate],
};

export default config;
