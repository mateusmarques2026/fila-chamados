CREATE TABLE `ticket_events` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner` text NOT NULL,
	`ticket_id` text NOT NULL,
	`author_id` text NOT NULL,
	`author_name` text NOT NULL,
	`kind` text NOT NULL,
	`body` text NOT NULL,
	`visibility` text DEFAULT 'public' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `events_owner_ticket_idx` ON `ticket_events` (`owner`,`ticket_id`,`seq`);--> statement-breakpoint
CREATE TABLE `tickets` (
	`number` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`owner` text NOT NULL,
	`requester_id` text NOT NULL,
	`requester_name` text NOT NULL,
	`requester_email` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`category` text NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`status` text DEFAULT 'novo' NOT NULL,
	`assignee` text,
	`version` integer DEFAULT 1 NOT NULL,
	`last_mutation` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tickets_id_unique` ON `tickets` (`id`);--> statement-breakpoint
CREATE INDEX `tickets_owner_requester_idx` ON `tickets` (`owner`,`requester_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`created_at` text NOT NULL
);
