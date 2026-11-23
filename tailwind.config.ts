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
        /* A46: 따뜻한 뉴트럴 + 톤다운(더스티 파스텔) 팔레트.
           흰 바탕과 얇은 선은 그대로 두고, 색이 들어가는 곳만 채도를 낮춰 차분하게 맞췄습니다.
           글자 대비는 유지했습니다(ink-400 ≈ 5.5:1 on white). */
        /* neutral surfaces — warm off-white canvas, warm gray support */
        paper: {
          50: "#ffffff",
          100: "#ffffff",
          200: "#f6f4f0",
          300: "#dcd7ce",
          400: "#bab3a8",
          500: "#8d867b",
        },
        /* text scale — body copy stays #1f1d1a–#3b3730, meta at least #6e685e */
        ink: {
          900: "#1f1d1a",
          800: "#26241f",
          700: "#3b3730",
          600: "#4b463e",
          500: "#5c564d",
          400: "#6e685e",
          300: "#9b948a",
          200: "#d6d1c8",
        },
        /* one soft warm hairline for every table-like border */
        line: {
          DEFAULT: "#d9d4cb",
          soft: "#e6e1d9",
          strong: "#b3aca1",
        },
        /* primary accent — dusty rose (events, work) */
        accent: {
          50: "#fbf5f2",
          100: "#f5e7e1",
          200: "#e9d2c9",
          300: "#d6b0a3",
          400: "#bf9182",
          500: "#a87a69",
          600: "#8d6354",
          700: "#755145",
        },
        /* routines — soft sage */
        sage: {
          50: "#f4f6f1",
          100: "#e7eddd",
          200: "#d2ddc4",
          300: "#b0c19d",
          400: "#8da578",
          500: "#718a5d",
          600: "#5c7349",
        },
        /* study — muted violet */
        dusk: {
          100: "#ebe7f0",
          300: "#c6bcd4",
          500: "#8d82a3",
          600: "#716890",
        },
        /* A24 → A42: 바인더 주간 날짜의 먹색·파랑·빨강. A46 에서 주말 색도 같은 결로 낮췄습니다. */
        binder: {
          ink: "#3f4854",
          sat: "#4e7593",
          sun: "#a8695f",
        },
        /* cool dusty blue for all-day / focus bands */
        sky: {
          50: "#f3f6f8",
          100: "#e5ecf1",
          200: "#cbdae3",
          500: "#7696aa",
          600: "#5c7d91",
          700: "#4a6879",
        },
        blue: {
          50: "#f3f6f8",
          100: "#e5ecf1",
          200: "#cbdae3",
          500: "#7696aa",
          600: "#5c7d91",
          700: "#4a6879",
        },
        /* danger / 주말 강조 — 낮은 채도의 로즈 */
        rose: {
          50: "#fbf4f3",
          100: "#f4e6e3",
          200: "#e9d0cb",
          300: "#d7aaa2",
          400: "#c08d84",
          500: "#a86f66",
          600: "#8f5a52",
          700: "#754940",
        },
        red: {
          50: "#fbf4f3",
          100: "#f6e7e5",
          200: "#ecd3cf",
          300: "#d9aca5",
          400: "#c48b83",
          500: "#a96b62",
          600: "#8f544c",
        },
        /* 대기·주의 — 따뜻한 샌드 */
        amber: {
          50: "#faf6ee",
          100: "#f3ead9",
          200: "#e6d6b8",
          300: "#d3bc93",
          400: "#bfa173",
          500: "#a98a5c",
          700: "#8a6d41",
          800: "#6f5733",
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
