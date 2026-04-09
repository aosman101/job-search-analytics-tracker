import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const repoName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "";
const defaultBase = repoName && !repoName.endsWith(".github.io") ? `/${repoName}/` : "/";

export default defineConfig({
  base: process.env.VITE_BASE_PATH || defaultBase,
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? "1.0.0"),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  plugins: [react()],
});
