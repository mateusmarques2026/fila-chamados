import { z, ZodError } from "zod";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import {
  DeskError,
  database,
  actorFor,
  getTicket,
  openTicket,
  changeTicket,
  addReply,
} from "@/lib/desk";
import { statuses } from "@/lib/ticket-rules";
export const dynamic = "force-dynamic";
const create = z
  .object({
    title: z.string().trim().min(6, "Use um título com pelo menos 6 caracteres.").max(120),
    body: z.string().trim().min(20, "Descreva o problema em pelo menos 20 caracteres.").max(5000),
    category: z.enum(["acesso", "erro", "financeiro", "duvida"]),
    priority: z.enum(["baixa", "normal", "alta"]).default("normal"),
  })
  .strict();
const patch = z
  .object({
    version: z.number().int().min(1),
    status: z.enum(statuses).optional(),
    priority: z.enum(["baixa", "normal", "alta"]).optional(),
    assign: z.boolean().optional(),
  })
  .strict();
const reply = z
  .object({
    version: z.number().int().min(1),
    body: z.string().trim().min(2, "Escreva sua resposta.").max(4000),
    internal: z.boolean().optional(),
  })
  .strict();
const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
async function handle(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) throw new DeskError("Entre na sua conta.", 401);
    const actor = await actorFor(user);
    const url = new URL(request.url);
    const [resource, id, action] = url.pathname.replace(/^\/api\//, "").split("/");
    let body: unknown;
    if (request.method !== "GET") {
      const origin = request.headers.get("origin");
      if (origin && origin !== url.origin) throw new DeskError("Origem inválida.", 403);
      if (!request.headers.get("content-type")?.includes("application/json"))
        throw new DeskError("Envie JSON.", 415);
      const raw = await request.text();
      if (raw.length > 16_000) throw new DeskError("Mensagem grande demais.", 413);
      try {
        body = JSON.parse(raw);
      } catch {
        throw new DeskError("JSON inválido.");
      }
    }
    if (resource === "session" && request.method === "GET")
      return json({ name: user.fullName ?? user.email, role: actor.agent ? "agent" : "requester" });
    if (resource === "tickets" && request.method === "POST" && !id)
      return json(await openTicket(actor, create.parse(body)), 201);
    if (resource === "tickets" && request.method === "GET" && !id) {
      const db = database();
      const values: (string | number)[] = [actor.owner];
      let where = "owner=?";
      if (!actor.agent) {
        where += " AND requester_id=?";
        values.push(user.userId);
      }
      const summary = await db
        .prepare(
          "SELECT COUNT(*) AS total,SUM(status='novo') AS new_count,SUM(status='em_andamento') AS doing,SUM(status='aguardando_cliente') AS waiting,SUM(status='resolvido') AS resolved FROM tickets WHERE " +
            where,
        )
        .bind(...values)
        .first();
      const status = url.searchParams.get("status");
      if (status && statuses.includes(status as (typeof statuses)[number])) {
        where += " AND status=?";
        values.push(status);
      }
      const query = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
      if (query) {
        where += " AND (title LIKE ? ESCAPE '\\' OR requester_name LIKE ? ESCAPE '\\')";
        const term = "%" + query.replace(/[\\%_]/g, (c) => "\\" + c) + "%";
        values.push(term, term);
      }
      const result = await db
        .prepare(
          "SELECT id,number,title,body,category,priority,status,requester_name,requester_email,assignee,version,created_at,updated_at FROM tickets WHERE " +
            where +
            " ORDER BY updated_at DESC,number DESC LIMIT 200",
        )
        .bind(...values)
        .all();
      return json({ tickets: result.results, summary, agent: actor.agent });
    }
    if (resource === "tickets" && id && request.method === "GET") {
      const ticket = await getTicket(actor, id);
      const extra = actor.agent ? "" : " AND visibility='public'";
      const events = await database()
        .prepare(
          "SELECT seq,kind,body,author_name,visibility,created_at FROM ticket_events WHERE owner=? AND ticket_id=?" +
            extra +
            " ORDER BY seq",
        )
        .bind(actor.owner, id)
        .all();
      return json({ ticket, events: events.results });
    }
    if (resource === "tickets" && id && request.method === "PATCH") {
      if (!actor.agent) throw new DeskError("A triagem é exclusiva do responsável.", 403);
      return json(await changeTicket(actor, id, patch.parse(body)));
    }
    if (resource === "tickets" && id && action === "replies" && request.method === "POST")
      return json(await addReply(actor, id, reply.parse(body)), 201);
    throw new DeskError("Rota não encontrada.", 404);
  } catch (error) {
    if (error instanceof DeskError) return json({ error: error.message }, error.status);
    if (error instanceof ZodError)
      return json({ error: error.issues[0]?.message ?? "Confira os campos." }, 400);
    console.error("Erro de chamado", error instanceof Error ? error.message : "desconhecido");
    return json({ error: "Não foi possível concluir a operação." }, 500);
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
