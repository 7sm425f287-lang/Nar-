import tailwindcssAnimate from "tailwindcss-animate"

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1440px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
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
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
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
  plugins: [tailwindcssAnimate]
};
