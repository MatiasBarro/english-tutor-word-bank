import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPTransport } from "@hono/mcp";
import type { Context } from "hono";
import { register as registerListCategories } from "./tools/list-categories.js";
import { register as registerGetWordsByCategory } from "./tools/get-words-by-category.js";

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "english-tutor-mcp",
    version: "1.0.0",
  });
  registerListCategories(server);
  registerGetWordsByCategory(server);
  return server;
}

export function createMcpHandler() {
  return async (c: Context) => {
    const server = createMcpServer();
    const transport = new StreamableHTTPTransport();
    await server.connect(transport);
    return transport.handleRequest(c);
  };
}
