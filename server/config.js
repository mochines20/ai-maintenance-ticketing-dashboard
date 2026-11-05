import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const serverDir = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(serverDir, "..");

dotenv.config({ path: path.join(projectRoot, ".env") });

export const config = {
  port: Number(process.env.PORT || 3001),
  databasePath: path.resolve(
    projectRoot,
    process.env.DATABASE_PATH || "./data/maintenance.sqlite",
  ),
  aiProvider: process.env.AI_PROVIDER || (process.env.GEMINI_API_KEY ? "gemini" : "openai"),
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  openaiModel: process.env.OPENAI_MODEL || "gpt-4o-mini",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
};

