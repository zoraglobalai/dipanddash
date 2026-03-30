/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          gold: "var(--color-gold)",
          red: "var(--color-red)",
          black: "var(--color-black)",
          white: "var(--color-white)"
        }
      },
      boxShadow: {
        premium: "0 18px 40px rgba(15, 15, 15, 0.08)"
      },
      borderRadius: {
        card: "var(--radius-card)"
      },
      fontFamily: {
        heading: ["Sora", "sans-serif"],
        body: ["Manrope", "sans-serif"]
      }
    }
  },
  plugins: []
};

