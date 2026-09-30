import path from "node:path";
import fs from "node:fs";
import { defineConfig } from "prisma/config";
if (fs.existsSync(".env")) process.loadEnvFile(".env");
export default defineConfig({ schema: path.join(import.meta.dirname, "prisma", "schema.prisma") });
