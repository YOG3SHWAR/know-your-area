CREATE TABLE "complaints" (
	"id" serial PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"submitter_id" text NOT NULL,
	"category" text NOT NULL,
	"location" geometry(point, 4326) NOT NULL,
	"accuracy_m" integer,
	"photo_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "complaints_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE INDEX "complaints_location_gist" ON "complaints" USING gist ("location");