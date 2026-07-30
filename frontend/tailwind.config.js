/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: "#FCFBF9", // warm white, not pure white
        surface: "#FFFFFF", // card background
        raised: "#F7F5F2", // hover fills, input backgrounds — warm light gray, not cold gray
        border: "#ECE7E2",
        text: "#181818",
        secondary: "#6D6D6D",
        muted: "#9B9B9B",
        // signal = primary accent (burnt orange) — connection/insight, primary actions
        signal: "#C96A28",
        signalHover: "#B55A1F",
        signalLight: "#F7E7DA", // badges, selected items, chips
        // gap = something missing / needs attention — mapped to the error/warning register
        gap: "#E04848",
        success: "#2FA36B",
        warning: "#F59E0B",
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
};
