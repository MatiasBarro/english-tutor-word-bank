import { eq } from "drizzle-orm";
import { mcpServer } from "../mcp.js";
import { db } from "../db/index.js";
import { words } from "../db/schema.js";

mcpServer.registerTool(
  "list_categories",
  {
    description: "List all word categories that have at least one active word. Returns category names for use with get_words_by_category.",
    // No inputSchema — this tool takes no arguments
    // No outputSchema — per research Pitfall 1, omitting avoids isError validation conflict
  },
  async () => {
    try {
      const rows = await db
        .selectDistinct({ category: words.category })
        .from(words)
        .where(eq(words.active, true));

      const categories = rows.map((r) => r.category).sort();

      return {
        content: [
          {
            type: "text" as const,
            text: `Available categories: ${categories.join(", ")} (${categories.length} total)`,
          },
        ],
        structuredContent: { categories },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown database error";
      return {
        isError: true,
        content: [{ type: "text" as const, text: `Failed to list categories: ${message}` }],
      };
    }
  }
);
