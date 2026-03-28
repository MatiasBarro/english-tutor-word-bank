import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPTransport } from "@hono/mcp";
import type { Context } from "hono";
import { register as registerListCategories } from "./tools/list-categories.js";
import { register as registerGetWordsByCategory } from "./tools/get-words-by-category.js";

export const mcpServer = new McpServer({
  name: "english-tutor-mcp",
  version: "1.0.0",
});

registerListCategories(mcpServer);
registerGetWordsByCategory(mcpServer);

const transport = new StreamableHTTPTransport();

export function createMcpHandler() {
  return async (c: Context) => {
    if (!mcpServer.isConnected()) {
      await mcpServer.connect(transport);
    }
    return transport.handleRequest(c);
  };
}
