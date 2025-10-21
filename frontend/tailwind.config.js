/** @type {import('tailwindcss').Config} */
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      colors: {
        earth: {
          paper: "#F6F1EA",
          stein: "#D8D6D1",
          ocker: "#C78E3F",
          umbra: "#5B3A29",
          salbei: "#9AA77A",
          wald: "#27432F",
          rauch: "#6E6E6E"
        }
      },
      fontFamily: {
        serif: ['"EB Garamond"', "Georgia", "serif"],
        sans: ["Inter", "system-ui", "sans-serif"]
      },
      borderRadius: {
        soft: "12px",
        softer: "18px"
      },
      boxShadow: {
        soft: "0 1px 1px rgba(20,20,20,.04), 0 8px 24px rgba(20,20,20,.06)",
        depth: "0 2px 4px rgba(0,0,0,.06), 0 16px 40px rgba(0,0,0,.10)"
      },
      transitionDuration: {
        calm: "200ms"
      },
      keyframes: {
        fade: { from: { opacity: 0 }, to: { opacity: 1 } },
        rise: { from: { transform: "translateY(6px)", opacity: 0 }, to: { transform: "translateY(0)", opacity: 1 } }
      },
      animation: {
        fade: "fade .24s ease-out",
        rise: "rise .28s ease-out"
      }
    }
  },
  plugins: []
};
