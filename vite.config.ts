import vinext from "vinext";
import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";

// Cloudflare bindings for local development. In production the real database
// id is injected by the deployment platform; a placeholder is used locally.
const D1_BINDING = "DB";
const PLACEHOLDER_DATABASE_ID = "00000000-0000-4000-8000-000000000000";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: [
    {
      binding: D1_BINDING,
      database_name: "equipment-monitor-d1",
      database_id: PLACEHOLDER_DATABASE_ID,
    },
  ],
  r2_buckets: [],
};

export default defineConfig({
  plugins: [
    vinext(),
    cloudflare({
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
      config: localBindingConfig,
    }),
  ],
});
