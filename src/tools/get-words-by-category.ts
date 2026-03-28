import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { mcpServer } from "../mcp.js";
import { db } from "../db/index.js";
import { words } from "../db/schema.js";

mcpServer.registerTool(
  "get_words_by_category",
  {
    description: "Get all active words for a given category, including register, frequency weight, and usage sentence.",
    inputSchema: z.object({
      category: z.string().describe("The category name (e.g. 'emphasis', 'summary')"),
    }),
    // No outputSchema — per research Pitfall 1, omitting avoids isError validation conflict
  },
  async ({ category }) => {
    try {
      const rows = await db
        .select({
          word: words.word,
          register: words.register,
          frequency: words.frequency,
          usageSentence: words.usageSentence,
        })
        .from(words)
        .where(and(eq(words.active, true), eq(words.category, category)));

      // Per D-03: human-readable text summary, NOT JSON serialization
      // Per Pitfall 5: handle null usageSentence with ?? "" to avoid "null" strings
      const summary = rows
        .map((r) => `${r.word} (${r.register}, freq:${r.frequency})`)
        .join(", ");

      const text = rows.length > 0
        ? `Words in '${category}': ${summary}`
        : `No active words found in category '${category}'`;

      return {
        content: [{ type: "text" as const, text }],
        structuredContent: {
          category,
          words: rows,
          count: rows.length,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown database error";
      return {
        isError: true,
        content: [{ type: "text" as const, text: `Failed to get words for category '${category}': ${message}` }],
      };
    }
  }
);
