import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#172026",
        paper: "#f7f7f2",
        line: "#d8ddd8",
        brand: "#0f766e",
        coral: "#d95f43"
      }
    }
  },
  plugins: []
};

export default config;
