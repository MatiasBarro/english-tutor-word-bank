import "dotenv/config";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/db/index.js";
import { words } from "../src/db/schema.js";

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}/mcp`;

// Test category name unlikely to collide with real data
const TEST_CATEGORY = "__mcp_smoke_test__";

interface ToolResult {
  content?: Array<{ type: string; text?: string }>;
  structuredContent?: unknown;
  isError?: boolean;
}

async function seed() {
  console.log("Seeding test data...");
  // Insert 2 active words and 1 inactive word in the test category
  await db.insert(words).values([
    {
      word: "therefore",
      category: TEST_CATEGORY,
      register: "formal",
      frequency: 80,
      usageSentence: "Therefore, we must act now.",
      active: true,
    },
    {
      word: "hence",
      category: TEST_CATEGORY,
      register: "formal",
      frequency: 60,
      usageSentence: null,
      active: true,
    },
    {
      word: "hidden_word",
      category: TEST_CATEGORY,
      register: "informal",
      frequency: 10,
      usageSentence: "This should not appear.",
      active: false, // INACTIVE — must NOT appear in tool results
    },
  ]);
  console.log("Seeded 3 test rows (2 active, 1 inactive)");
}

async function cleanup() {
  console.log("Cleaning up test data...");
  await db.delete(words).where(eq(words.category, TEST_CATEGORY));
  console.log("Cleaned up");
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

async function runTests() {
  const client = new Client({ name: "mcp-smoke-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(BASE_URL));

  console.log(`Connecting to MCP server at ${BASE_URL}...`);
  await client.connect(transport);
  console.log("Connected (no auth required — AUTH-04 verified)\n");

  // --- Test 1: list_categories ---
  console.log("=== Test 1: list_categories ===");
  const catResult = await client.callTool({ name: "list_categories", arguments: {} }) as ToolResult;
  console.log("Response:", JSON.stringify(catResult, null, 2));

  // Verify content array exists with text type
  assert(Array.isArray(catResult.content), "list_categories: content must be an array");
  assert(catResult.content!.length > 0, "list_categories: content must not be empty");
  assert(catResult.content![0].type === "text", "list_categories: content[0].type must be 'text'");
  assert(typeof catResult.content![0].text === "string", "list_categories: content[0].text must be a string");
  assert(!catResult.content![0].text!.startsWith("{"), "list_categories: text content must not be JSON (D-03)");

  // Verify structuredContent exists
  assert(catResult.structuredContent !== undefined, "list_categories: structuredContent must be present (MCP-04)");
  const catStructured = catResult.structuredContent as { categories: string[] };
  assert(Array.isArray(catStructured.categories), "list_categories: structuredContent.categories must be an array");
  assert(catStructured.categories.includes(TEST_CATEGORY), `list_categories: must include test category '${TEST_CATEGORY}'`);

  // Verify not an error
  assert(!catResult.isError, "list_categories: must not be an error");
  console.log("list_categories: PASSED\n");

  // --- Test 2: get_words_by_category ---
  console.log("=== Test 2: get_words_by_category ===");
  const wordsResult = await client.callTool({
    name: "get_words_by_category",
    arguments: { category: TEST_CATEGORY },
  }) as ToolResult;
  console.log("Response:", JSON.stringify(wordsResult, null, 2));

  // Verify content array
  assert(Array.isArray(wordsResult.content), "get_words_by_category: content must be an array");
  assert(wordsResult.content!.length > 0, "get_words_by_category: content must not be empty");
  assert(wordsResult.content![0].type === "text", "get_words_by_category: content[0].type must be 'text'");
  assert(!wordsResult.content![0].text!.startsWith("{"), "get_words_by_category: text content must not be JSON (D-03)");

  // Verify structuredContent
  assert(wordsResult.structuredContent !== undefined, "get_words_by_category: structuredContent must be present (MCP-04)");
  const wordsStructured = wordsResult.structuredContent as {
    category: string;
    words: Array<{ word: string; register: string; frequency: number; usageSentence: string | null }>;
    count: number;
  };
  assert(wordsStructured.category === TEST_CATEGORY, "get_words_by_category: structuredContent.category must match input");
  assert(Array.isArray(wordsStructured.words), "get_words_by_category: structuredContent.words must be an array");

  // MCP-03: Only active words returned — seeded 2 active + 1 inactive, expect exactly 2
  assert(wordsStructured.count === 2, `get_words_by_category: expected 2 active words, got ${wordsStructured.count} (MCP-03)`);
  assert(wordsStructured.words.length === 2, `get_words_by_category: expected 2 word objects, got ${wordsStructured.words.length}`);

  // Verify inactive word "hidden_word" is NOT in results
  const wordNames = wordsStructured.words.map((w) => w.word);
  assert(!wordNames.includes("hidden_word"), "get_words_by_category: inactive word 'hidden_word' must NOT appear (MCP-03)");
  assert(wordNames.includes("therefore"), "get_words_by_category: active word 'therefore' must appear");
  assert(wordNames.includes("hence"), "get_words_by_category: active word 'hence' must appear");

  // Verify word fields (MCP-02)
  const firstWord = wordsStructured.words.find((w) => w.word === "therefore")!;
  assert(firstWord.register === "formal", "word.register must be present");
  assert(firstWord.frequency === 80, "word.frequency must be present");
  assert(firstWord.usageSentence === "Therefore, we must act now.", "word.usageSentence must be present when not null");

  // Verify null usageSentence is handled
  const secondWord = wordsStructured.words.find((w) => w.word === "hence")!;
  assert(secondWord.usageSentence === null, "word.usageSentence should be null when not set");

  // Verify not an error
  assert(!wordsResult.isError, "get_words_by_category: must not be an error");
  console.log("get_words_by_category: PASSED\n");

  await client.close();
  console.log("MCP client closed");
}

async function main() {
  let exitCode = 0;
  try {
    await seed();
    await runTests();
    console.log("\n=== ALL TESTS PASSED ===");
  } catch (error) {
    console.error("\n=== TEST FAILED ===");
    console.error(error instanceof Error ? error.message : error);
    exitCode = 1;
  } finally {
    await cleanup();
    await pool.end();
  }
  process.exit(exitCode);
}

main();
