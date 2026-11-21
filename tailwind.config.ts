import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        /* One Korean stack everywhere — Pretendard Variable first, Noto Sans KR fallback. */
        sans: [
          "Pretendard Variable",
          "Pretendard",
          "Noto Sans KR",
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          "Roboto",
          "Apple SD Gothic Neo",
          "sans-serif",
        ],
        serif: [
          "Pretendard Variable",
          "Pretendard",
          "Noto Sans KR",
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          "sans-serif",
        ],
        display: [
          "Pretendard Variable",
          "Pretendard",
          "Noto Sans KR",
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      colors: {
        /* neutral surfaces — pure white canvas, cool gray support */
        paper: {
          50: "#ffffff",
          100: "#ffffff",
          200: "#f4f5f7",
          300: "#cbd5e1",
          400: "#94a3b8",
          500: "#64748b",
        },
        /* text scale — body copy stays #111827–#374151, meta at least #6b7280 */
        ink: {
          900: "#111827",
          800: "#111827",
          700: "#374151",
          600: "#4b5563",
          500: "#5b6472",
          400: "#6b7280",
          300: "#9ca3af",
          200: "#cbd5e1",
        },
        /* one crisp hairline for every table-like border */
        line: {
          DEFAULT: "#cbd5e1",
          soft: "#dbe1e8",
          strong: "#94a3b8",
        },
        /* primary accent — crisp pink (events, work) */
        accent: {
          50: "#fdf2f8",
          100: "#fce7f3",
          200: "#fbcfe8",
          300: "#f9a8d4",
          400: "#f472b6",
          500: "#ec4899",
          600: "#db2777",
        },
        /* routines — green heatmap */
        sage: {
          50: "#f0fdf4",
          100: "#dcfce7",
          200: "#bbf7d0",
          300: "#86efac",
          400: "#22c55e",
          500: "#16a34a",
        },
        /* study — violet */
        dusk: {
          100: "#ede9fe",
          300: "#c4b5fd",
          500: "#8b5cf6",
          600: "#7c3aed",
        },
        /* A24: 바인더 주간 날짜의 검정·파랑·빨강 — 쨍하지 않게 한 단계 낮춘 톤.
           검정 #111827 → 진한 차콜, 파랑 #2563eb → 슬레이트 블루, 빨강 #ef4444 → 브릭 로즈.
           흰 바탕 대비 검정 9.7:1 · 파랑 5.2:1 · 빨강 4.7:1 로 읽기는 그대로입니다. */
        binder: {
          ink: "#3b4553",
          sat: "#52708f",
          sun: "#a8605a",
        },
        /* cool sky for all-day / focus bands */
        sky: {
          50: "#f0f9ff",
          100: "#e0f2fe",
          200: "#bae6fd",
          500: "#0ea5e9",
          600: "#0284c7",
        },
      },
      borderRadius: {
        xl2: "1.15rem",
      },
      boxShadow: {
        soft: "0 1px 2px rgba(17,24,39,0.04)",
        lift: "0 1px 2px rgba(17,24,39,0.05), 0 12px 28px -18px rgba(17,24,39,0.35)",
        nav: "0 -1px 0 rgba(17,24,39,0.06)",
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
