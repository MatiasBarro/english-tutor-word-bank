import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { config } from "./config.js";
import { pool } from "./db/index.js";

const app = new Hono();

app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

const server = serve(
  { fetch: app.fetch, port: config.PORT },
  (info) => {
    console.log(`Server running on http://localhost:${info.port}`);
  }
);

// Graceful shutdown
const shutdown = async () => {
  console.log("Shutting down...");
  await pool.end();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

export { app };
