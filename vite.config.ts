import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // caminhos relativos: funciona em blcker3145.github.io/organizador-pessoal e em qualquer outra pasta
  base: "./",
  server: { port: 5173 },
});
