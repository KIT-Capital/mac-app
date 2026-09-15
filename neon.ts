import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  auth: false,
  branch: (branch) => {
    if (branch.isDefault || branch.name === "production" || branch.name === "development") {
      return {};
    }
    if (!branch.exists) {
      return { ttl: "7d" };
    }
    return {};
  },
});
