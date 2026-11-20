import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Pretendard Variable",
          "Pretendard",
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          "Roboto",
          "Apple SD Gothic Neo",
          "sans-serif",
        ],
        serif: ["'Nanum Myeongjo'", "'Noto Serif KR'", "serif"],
      },
      colors: {
        paper: {
          50: "#fdfcf9",
          100: "#f8f5ef",
          200: "#f1ece2",
          300: "#e6dfd1",
          400: "#d5cbb9",
          500: "#b9ad98",
        },
        ink: {
          900: "#2c2823",
          800: "#3b3630",
          700: "#514b43",
          600: "#6b645a",
          500: "#8a8278",
          400: "#a9a199",
        },
        accent: {
          50: "#fbf3ec",
          100: "#f4e3d3",
          200: "#e9c6a8",
          300: "#dda47c",
          400: "#cf8355",
          500: "#b96a3e",
          600: "#9c5530",
        },
        sage: {
          50: "#f2f5f0",
          100: "#e3eade",
          200: "#c9d6c0",
          300: "#a9bd9d",
          400: "#8aa47c",
          500: "#6d8860",
        },
        dusk: {
          100: "#e7e4ef",
          300: "#b3abc9",
          500: "#7b6f9e",
        },
      },
      borderRadius: {
        xl2: "1.15rem",
      },
      boxShadow: {
        soft: "0 1px 2px rgba(44,40,35,0.04), 0 8px 24px -12px rgba(44,40,35,0.18)",
        lift: "0 2px 6px rgba(44,40,35,0.06), 0 18px 40px -20px rgba(44,40,35,0.28)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          from: { opacity: "0", transform: "translateX(24px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "pop-in": {
          from: { opacity: "0", transform: "scale(0.97)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "fade-in": "fade-in 160ms ease-out",
        "slide-up": "slide-up 200ms cubic-bezier(0.22,1,0.36,1)",
        "slide-in-right": "slide-in-right 220ms cubic-bezier(0.22,1,0.36,1)",
        "pop-in": "pop-in 140ms ease-out",
      },
      transitionTimingFunction: {
        drawer: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
