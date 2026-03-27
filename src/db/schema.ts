import {
  pgTable,
  uuid,
  varchar,
  integer,
  text,
  boolean,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";

export const registerEnum = pgEnum("register_type", ["formal", "informal"]);

export const words = pgTable("words", {
  id: uuid("id").primaryKey().defaultRandom(),
  word: varchar("word", { length: 255 }).notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  register: registerEnum("register").notNull(),
  frequency: integer("frequency").notNull(),
  usageSentence: text("usage_sentence"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
