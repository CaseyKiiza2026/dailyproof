import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        white: "rgb(var(--ink) / <alpha-value>)",
        proof: {
          bg: "var(--background)",
          panel: "var(--surface)",
          panel2: "var(--raised)",
          border: "var(--border)",
          green: "rgb(var(--green) / <alpha-value>)",
          green2: "#12b95b",
          muted: "#8f9a94",
          red: "#ff554f",
          amber: "#f59e0b",
          violet: "#8b5cf6"
        }
      },
      boxShadow: {
        "proof-card": "0 4px 16px rgba(0,0,0,.06)",
        "proof-glow": "0 0 0 1px rgba(37,216,111,.25), 0 0 34px rgba(37,216,111,.16)",
        "proof-button": "0 10px 35px rgba(37,216,111,.30), inset 0 1px 0 rgba(255,255,255,.28)"
      },
      borderRadius: {
        "4xl": "2rem"
      },
      letterSpacing: {
        "proof": ".24em"
      }
    }
  },
  plugins: []
};

export default config;
