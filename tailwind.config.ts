import type { Config } from "tailwindcss";

/** 테마가 바꾸는 색 채널 — `globals.css` 의 `--c-*` 변수를 그대로 씁니다. */
const c = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        /* A48: 설정의 글꼴 세 가지 — 고딕(Pretendard)·명조(Noto Serif KR)·손글씨(Gaegu).
           `--font-app` 은 테마가 아니라 글꼴 설정이 바꾸는 값입니다. */
        sans: ["var(--font-app)", "Pretendard Variable", "Pretendard", "Noto Sans KR", "-apple-system", "BlinkMacSystemFont", "system-ui", "Roboto", "Apple SD Gothic Neo", "sans-serif"],
        serif: ["var(--font-serif)", "Noto Serif KR", "Nanum Myeongjo", "Pretendard Variable", "serif"],
        display: ["var(--font-app)", "Pretendard Variable", "Pretendard", "Noto Sans KR", "system-ui", "sans-serif"],
        hand: ["var(--font-hand)", "Gaegu", "Nanum Pen Script", "Pretendard Variable", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      colors: {
        /* A48: 색은 모두 CSS 변수(`globals.css` 의 테마 블록)를 거칩니다 — 설정에서
           고른 색감 테마 다섯 가지가 화면 전체(바탕·선·글자·포인트)를 바꿉니다.
           알파 표기(bg-ink-900/15)도 그대로 동작하도록 rgb 채널 + <alpha-value> 로 씁니다. */
        white: c("white"),
        black: c("black"),
        /* neutral surfaces — warm off-white canvas, warm gray support */
        paper: {
          50: c("paper-50"),
          100: c("paper-100"),
          200: c("paper-200"),
          300: c("paper-300"),
          400: c("paper-400"),
          500: c("paper-500"),
        },
        /* text scale — body copy stays deep, meta readable */
        ink: {
          900: c("ink-900"),
          800: c("ink-800"),
          700: c("ink-700"),
          600: c("ink-600"),
          500: c("ink-500"),
          400: c("ink-400"),
          300: c("ink-300"),
          200: c("ink-200"),
        },
        /* one soft hairline for every table-like border */
        line: {
          DEFAULT: c("line"),
          soft: c("line-soft"),
          strong: c("line-strong"),
        },
        /* primary accent — dusty rose (events, work) */
        accent: {
          50: c("accent-50"),
          100: c("accent-100"),
          200: c("accent-200"),
          300: c("accent-300"),
          400: c("accent-400"),
          500: c("accent-500"),
          600: c("accent-600"),
          700: c("accent-700"),
        },
        /* routines — soft sage */
        sage: {
          50: c("sage-50"),
          100: c("sage-100"),
          200: c("sage-200"),
          300: c("sage-300"),
          400: c("sage-400"),
          500: c("sage-500"),
          600: c("sage-600"),
        },
        /* study — muted violet */
        dusk: {
          100: c("dusk-100"),
          300: c("dusk-300"),
          500: c("dusk-500"),
          600: c("dusk-600"),
        },
        /* binder weekly ink · saturday · sunday */
        binder: {
          ink: c("binder-ink"),
          sat: c("binder-sat"),
          sun: c("binder-sun"),
        },
        /* cool dusty blue for all-day / focus bands */
        sky: {
          50: c("sky-50"),
          100: c("sky-100"),
          200: c("sky-200"),
          500: c("sky-500"),
          600: c("sky-600"),
          700: c("sky-700"),
        },
        blue: {
          50: c("blue-50"),
          100: c("blue-100"),
          200: c("blue-200"),
          500: c("blue-500"),
          600: c("blue-600"),
          700: c("blue-700"),
        },
        /* danger / 주말 강조 */
        rose: {
          50: c("rose-50"),
          100: c("rose-100"),
          200: c("rose-200"),
          300: c("rose-300"),
          400: c("rose-400"),
          500: c("rose-500"),
          600: c("rose-600"),
          700: c("rose-700"),
        },
        red: {
          50: c("red-50"),
          100: c("red-100"),
          200: c("red-200"),
          300: c("red-300"),
          400: c("red-400"),
          500: c("red-500"),
          600: c("red-600"),
        },
        /* 대기·주의 — 따뜻한 샌드 */
        amber: {
          50: c("amber-50"),
          100: c("amber-100"),
          200: c("amber-200"),
          300: c("amber-300"),
          400: c("amber-400"),
          500: c("amber-500"),
          700: c("amber-700"),
          800: c("amber-800"),
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
