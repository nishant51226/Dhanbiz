/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "rgb(var(--color-surface-rgb) / <alpha-value>)",
          raised: "rgb(var(--color-surface-raised-rgb) / <alpha-value>)",
          muted: "rgb(var(--color-surface-muted-rgb) / <alpha-value>)",
          input: "rgb(var(--color-surface-input-rgb) / <alpha-value>)",
        },
        border: {
          DEFAULT: "rgb(var(--color-border-rgb) / <alpha-value>)",
          subtle: "rgb(var(--color-border-subtle-rgb) / <alpha-value>)",
        },
        brand: {
          DEFAULT: "rgb(var(--color-brand-rgb) / <alpha-value>)",
          hover: "rgb(var(--color-brand-hover-rgb) / <alpha-value>)",
          foreground: "rgb(var(--color-brand-fg-rgb) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "rgb(var(--color-muted-rgb) / <alpha-value>)",
          soft: "rgb(var(--color-muted-soft-rgb) / <alpha-value>)",
        },
        ink: {
          DEFAULT: "rgb(var(--color-ink-rgb) / <alpha-value>)",
          soft: "rgb(var(--color-ink-soft-rgb) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "var(--shadow-card)",
        header: "var(--shadow-header)",
      },
      ringOffsetColor: {
        surface: "rgb(var(--color-surface-rgb) / <alpha-value>)",
      },
    },
  },
  plugins: [],
};
