import "dotenv/config";
import { db, pool } from "../src/db/index.js";
import { words } from "../src/db/schema.js";
import { eq } from "drizzle-orm";

async function main() {
  console.log("Testing database connection and words table...\n");

  // Insert a test word
  const [inserted] = await db
    .insert(words)
    .values({
      word: "ephemeral",
      category: "adjectives",
      register: "formal",
      frequency: 42,
      usageSentence: "The ephemeral beauty of cherry blossoms reminds us to appreciate the present.",
      active: true,
    })
    .returning();

  console.log("Inserted word:", inserted);
  console.log(`  id: ${inserted.id}`);
  console.log(`  word: ${inserted.word}`);
  console.log(`  category: ${inserted.category}`);
  console.log(`  register: ${inserted.register}`);
  console.log(`  frequency: ${inserted.frequency}`);
  console.log(`  active: ${inserted.active}`);

  // Read it back
  const [fetched] = await db
    .select()
    .from(words)
    .where(eq(words.id, inserted.id));

  if (!fetched) {
    console.error("\nFAILED: Could not read back inserted word");
    process.exit(1);
  }

  console.log("\nRead back word:", fetched.word);

  // Verify fields match
  const checks = [
    ["word", fetched.word === "ephemeral"],
    ["category", fetched.category === "adjectives"],
    ["register", fetched.register === "formal"],
    ["frequency", fetched.frequency === 42],
    ["active", fetched.active === true],
    ["id is UUID", /^[0-9a-f-]{36}$/.test(fetched.id)],
  ] as const;

  let allPassed = true;
  for (const [name, passed] of checks) {
    console.log(`  ${passed ? "PASS" : "FAIL"}: ${name}`);
    if (!passed) allPassed = false;
  }

  // Clean up test data
  await db.delete(words).where(eq(words.id, inserted.id));
  console.log("\nCleaned up test word");

  await pool.end();

  if (!allPassed) {
    console.error("\nSome checks FAILED");
    process.exit(1);
  }

  console.log("\nAll checks PASSED — database is working correctly");
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
