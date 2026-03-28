import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { config } from "./config.js";
import { pool } from "./db/index.js";
import { createMcpHandler } from "./mcp.js";

// Side-effect imports to register tools on mcpServer
import "./tools/list-categories.js";
import "./tools/get-words-by-category.js";

const app = new Hono();

app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

// MCP endpoint — no auth middleware (AUTH-04, D-08)
app.all("/mcp", createMcpHandler());

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
