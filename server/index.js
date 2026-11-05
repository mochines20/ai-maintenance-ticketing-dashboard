import { config } from "./config.js";
import { createDatabase } from "./database.js";
import { createApp } from "./app.js";

const database = await createDatabase({ filename: config.databasePath });
const app = createApp({ database });

const server = app.listen(config.port, () => {
  console.log(`Maintenance dashboard API running on http://localhost:${config.port}`);
  console.log(
    `AI mode: ${config.aiMode}${config.openaiApiKey ? " (API key configured)" : ""}`,
  );
});

async function shutdown() {
  server.close(async () => {
    await database.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

