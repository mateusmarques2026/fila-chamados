import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  owner: text("owner").notNull(),
  createdAt: text("created_at").notNull(),
});
export const tickets = sqliteTable(
  "tickets",
  {
    number: integer("number").primaryKey({ autoIncrement: true }),
    id: text("id").notNull().unique(),
    owner: text("owner").notNull(),
    requesterId: text("requester_id").notNull(),
    requesterName: text("requester_name").notNull(),
    requesterEmail: text("requester_email").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    category: text("category").notNull(),
    priority: text("priority").notNull().default("normal"),
    status: text("status").notNull().default("novo"),
    assignee: text("assignee"),
    version: integer("version").notNull().default(1),
    lastMutation: text("last_mutation"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("tickets_owner_requester_idx").on(t.owner, t.requesterId, t.updatedAt)],
);
export const events = sqliteTable(
  "ticket_events",
  {
    seq: integer("seq").primaryKey({ autoIncrement: true }),
    owner: text("owner").notNull(),
    ticketId: text("ticket_id").notNull(),
    authorId: text("author_id").notNull(),
    authorName: text("author_name").notNull(),
    kind: text("kind").notNull(),
    body: text("body").notNull(),
    visibility: text("visibility").notNull().default("public"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("events_owner_ticket_idx").on(t.owner, t.ticketId, t.seq)],
);
