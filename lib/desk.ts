import { env } from "cloudflare:workers";
import type { ChatGPTUser } from "@/app/chatgpt-auth";
import {
  canTransition,
  statusNames,
  priorityNames,
  type Ticket,
  type TicketStatus,
} from "./ticket-rules";
export class DeskError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function database() {
  if (!env.DB) throw new DeskError("Banco indisponível.", 503);
  return env.DB;
}
export type Actor = { user: ChatGPTUser; owner: string; agent: boolean };
export async function actorFor(user: ChatGPTUser): Promise<Actor> {
  const db = database();
  const agent = Boolean(
    env.DESK_ADMIN_EMAIL && user.email.toLowerCase() === env.DESK_ADMIN_EMAIL.trim().toLowerCase(),
  );
  if (agent)
    await db
      .prepare("INSERT OR IGNORE INTO workspaces (id,owner,created_at) VALUES ('fila',?,?)")
      .bind(user.userId, new Date().toISOString())
      .run();
  const workspace = await db
    .prepare("SELECT owner FROM workspaces WHERE id='fila'")
    .first<{ owner: string }>();
  if (!workspace) throw new DeskError("A central ainda não foi aberta pelo responsável.", 503);
  if (agent && workspace.owner !== user.userId)
    throw new DeskError("Esta conta não é a responsável pela central.", 403);
  return { user, owner: workspace.owner, agent };
}
const fields =
  "id,number,title,body,category,priority,status,requester_name,requester_email,assignee,version,created_at,updated_at";
export async function getTicket(actor: Actor, id: string) {
  const condition = actor.agent ? "" : " AND requester_id=?";
  const values = actor.agent ? [id, actor.owner] : [id, actor.owner, actor.user.userId];
  const ticket = await database()
    .prepare("SELECT " + fields + " FROM tickets WHERE id=? AND owner=?" + condition)
    .bind(...values)
    .first<Ticket>();
  if (!ticket) throw new DeskError("Chamado não encontrado.", 404);
  return ticket;
}
export async function openTicket(
  actor: Actor,
  input: { title: string; body: string; category: string; priority: string },
) {
  const db = database();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        "INSERT INTO tickets (id,owner,requester_id,requester_name,requester_email,title,body,category,priority,status,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,'novo',1,?,?)",
      )
      .bind(
        id,
        actor.owner,
        actor.user.userId,
        actor.user.fullName ?? actor.user.email,
        actor.user.email,
        input.title,
        input.body,
        input.category,
        input.priority,
        now,
        now,
      ),
    db
      .prepare(
        "INSERT INTO ticket_events (owner,ticket_id,author_id,author_name,kind,body,visibility,created_at) VALUES (?,?,?,?,'created','Chamado aberto.','public',?)",
      )
      .bind(actor.owner, id, actor.user.userId, actor.user.fullName ?? actor.user.email, now),
  ]);
  return getTicket(actor, id);
}
function eventStatement(
  actor: Actor,
  id: string,
  nonce: string,
  kind: string,
  body: string,
  visibility: string,
  now: string,
) {
  return database()
    .prepare(
      "INSERT INTO ticket_events (owner,ticket_id,author_id,author_name,kind,body,visibility,created_at) SELECT ?,?,?,?,?,?,?,? FROM tickets WHERE id=? AND owner=? AND last_mutation=?",
    )
    .bind(
      actor.owner,
      id,
      actor.user.userId,
      actor.user.fullName ?? actor.user.email,
      kind,
      body,
      visibility,
      now,
      id,
      actor.owner,
      nonce,
    );
}
export async function changeTicket(
  actor: Actor,
  id: string,
  input: {
    version: number;
    status?: TicketStatus;
    priority?: keyof typeof priorityNames;
    assign?: boolean;
  },
) {
  if (!actor.agent) throw new DeskError("Somente o responsável pode alterar a triagem.", 403);
  const ticket = await getTicket(actor, id);
  if (ticket.version !== input.version)
    throw new DeskError("Este chamado mudou. Recarregue antes de alterar.", 409);
  const status = input.status ?? ticket.status;
  const priority = input.priority ?? ticket.priority;
  const assignee =
    input.assign === undefined ? ticket.assignee : input.assign ? actor.user.userId : null;
  if (status !== ticket.status && !canTransition(ticket.status, status))
    throw new DeskError("Essa mudança de status não é permitida.", 422);
  const descriptions: string[] = [];
  if (status !== ticket.status)
    descriptions.push("Status: " + statusNames[ticket.status] + " → " + statusNames[status]);
  if (priority !== ticket.priority) descriptions.push("Prioridade: " + priorityNames[priority]);
  if (assignee !== ticket.assignee)
    descriptions.push(assignee ? "Chamado assumido pelo responsável." : "Responsável removido.");
  if (!descriptions.length) throw new DeskError("Nenhuma alteração para salvar.");
  const nonce = crypto.randomUUID();
  const now = new Date().toISOString();
  const result = await database().batch([
    database()
      .prepare(
        "UPDATE tickets SET status=?,priority=?,assignee=?,version=version+1,last_mutation=?,updated_at=? WHERE id=? AND owner=? AND version=?",
      )
      .bind(status, priority, assignee, nonce, now, id, actor.owner, input.version),
    eventStatement(actor, id, nonce, "change", descriptions.join(" · "), "public", now),
  ]);
  if (!result[0].meta.changes)
    throw new DeskError("Outra alteração foi salva. Recarregue o chamado.", 409);
  return getTicket(actor, id);
}
export async function addReply(
  actor: Actor,
  id: string,
  input: { version: number; body: string; internal?: boolean },
) {
  const ticket = await getTicket(actor, id);
  if (input.internal && !actor.agent)
    throw new DeskError("Notas internas são exclusivas do responsável.", 403);
  if (ticket.version !== input.version)
    throw new DeskError("O chamado mudou. Recarregue e envie novamente.", 409);
  if (["resolvido", "cancelado"].includes(ticket.status))
    throw new DeskError(
      "Este chamado está encerrado. O responsável precisa reabri-lo para receber mensagens.",
      409,
    );
  const status =
    !actor.agent && ticket.status === "aguardando_cliente" ? "em_andamento" : ticket.status;
  const nonce = crypto.randomUUID();
  const now = new Date().toISOString();
  const db = database();
  const statements = [
    db
      .prepare(
        "UPDATE tickets SET status=?,version=version+1,last_mutation=?,updated_at=? WHERE id=? AND owner=? AND version=?",
      )
      .bind(status, nonce, now, id, actor.owner, input.version),
    eventStatement(
      actor,
      id,
      nonce,
      "comment",
      input.body,
      input.internal ? "internal" : "public",
      now,
    ),
  ];
  if (status !== ticket.status)
    statements.push(
      eventStatement(
        actor,
        id,
        nonce,
        "change",
        "Cliente respondeu. Status: Em andamento.",
        "public",
        now,
      ),
    );
  const result = await db.batch(statements);
  if (!result[0].meta.changes)
    throw new DeskError("Outra alteração foi salva. Recarregue antes de responder.", 409);
  return getTicket(actor, id);
}
