import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPTransport } from "@hono/mcp";
import type { Context } from "hono";

export const mcpServer = new McpServer({
  name: "english-tutor-mcp",
  version: "1.0.0",
});

// Tools are registered by importing tool files (side-effect imports in server.ts)

export function createMcpHandler() {
  return async (c: Context) => {
    const transport = new StreamableHTTPTransport();
    await mcpServer.connect(transport);
    return transport.handleRequest(c);
  };
}
