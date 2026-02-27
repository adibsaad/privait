-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
CREATE TYPE "public"."UserRole" AS ENUM('OWNER', 'ADMIN', 'MEMBER');--> statement-breakpoint
--> statement-breakpoint
CREATE TABLE "Team" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL,
);
--> statement-breakpoint
CREATE TABLE "MagicLink" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"email" text NOT NULL,
	"expiresAt" timestamp(3) NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "UserTeamMembership" (
	"userId" integer PRIMARY KEY NOT NULL,
	"teamId" integer NOT NULL,
	"role" "UserRole" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "User" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"firstName" text,
	"lastName" text,
	"pictureUrl" text,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL,
	"invitedAt" timestamp(3),
	"invitedByUserId" integer,
	"deletedAt" timestamp(3),
);
--> statement-breakpoint
CREATE TABLE "AuditLog" (
	"id" serial PRIMARY KEY NOT NULL,
	"event" text NOT NULL,
	"data" jsonb NOT NULL,
	"userId" integer,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "UserTeamMembership" ADD CONSTRAINT "UserTeamMembership_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."Team"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "UserTeamMembership" ADD CONSTRAINT "UserTeamMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "User" ADD CONSTRAINT "User_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "public"."User"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "MagicLink_token_key" ON "MagicLink" USING btree ("token" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "UserTeamMembership_userId_teamId_key" ON "UserTeamMembership" USING btree ("userId" int4_ops,"teamId" int4_ops);--> statement-breakpoint
CREATE INDEX "User_deletedAt_idx" ON "User" USING btree ("deletedAt" timestamp_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "User_email_key" ON "User" USING btree ("email" text_ops);--> statement-breakpoint
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog" USING btree ("createdAt" timestamp_ops);--> statement-breakpoint
CREATE INDEX "AuditLog_event_idx" ON "AuditLog" USING btree ("event" text_ops);--> statement-breakpoint
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog" USING btree ("userId" int4_ops);
