import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        // Official screens and /design: the beach themes (see .beach-day / .beach-dark in globals.css)
        beach: {
          bg: "var(--beach-bg)",
          surface: "var(--beach-surface)",
          ink: "var(--beach-ink)",
          muted: "var(--beach-muted)",
          border: "var(--beach-border)",
          focus: "var(--beach-focus)",
          live: "var(--beach-live)",
          pending: "var(--beach-pending)",
          failed: "var(--beach-failed)",
          crash: "var(--beach-crash)",
          outlier: "var(--beach-outlier)",
          missing: "var(--beach-missing)",
          selected: "var(--beach-selected)",
          "on-selected": "var(--beach-on-selected)",
          "on-crash": "var(--beach-on-crash)",
        },
      },
      fontSize: {
        "pad-digit": ["var(--pad-digit)", { lineHeight: "1.1", fontWeight: "800" }],
        "rider-name": ["var(--rider-name)", { lineHeight: "1.2", fontWeight: "700" }],
        timer: ["var(--timer-size)", { lineHeight: "1", fontWeight: "800" }],
      },
      minHeight: { pad: "var(--pad-button-min)", tap: "var(--tap-min)" },
      minWidth: { pad: "var(--pad-button-min)", tap: "var(--tap-min)" },
      borderRadius: { lg: "var(--radius)", md: "calc(var(--radius) - 2px)", sm: "calc(var(--radius) - 4px)" },
    },
  },
  plugins: [animate],
};

export default config;
