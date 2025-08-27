/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./layout/**/*.liquid",
    "./templates/**/*.liquid",
    "./sections/**/*.liquid",
    "./snippets/**/*.liquid",
    "./customers/**/*.liquid",
    "./assets/**/*.css",
  ],
  theme: {
    // 🟢 Spacing overrides (root level, replaces defaults)
    spacing: {
      2: "20px", // overrides default .p-2
      5: "1.25rem", // overrides default .p-5
      18: "4.5rem", // new spacing value
    },

    extend: {
      // 🟢 Brand colors
      colors: {
        brand: "#e60023", // main brand red
        secondary: "#0070f3", // accent blue
        neutral: {
          50: "#fafafa",
          100: "#f4f4f5",
          200: "#e4e4e7",
          900: "#18181b",
        },
      },

      // 🟢 Custom font sizes
      fontSize: {
        xs: ["0.75rem", { lineHeight: "1rem" }], // 12px
        sm: ["0.875rem", { lineHeight: "1.25rem" }], // 14px
        base: ["1rem", { lineHeight: "1.5rem" }], // 16px
        lg: ["1.25rem", { lineHeight: "1.75rem" }], // 20px
        xl: ["1.5rem", { lineHeight: "2rem" }], // 24px
        "2xl": ["1.875rem", { lineHeight: "2.25rem" }], // 30px
      },

      // 🟢 Custom breakpoints
      screens: {
        xs: "480px", // new mobile breakpoint
      },
    },
  },
  plugins: [],
};
