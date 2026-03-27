CREATE TYPE "public"."register_type" AS ENUM('formal', 'informal');--> statement-breakpoint
CREATE TABLE "words" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"word" varchar(255) NOT NULL,
	"category" varchar(100) NOT NULL,
	"register" "register_type" NOT NULL,
	"frequency" integer NOT NULL,
	"usage_sentence" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
