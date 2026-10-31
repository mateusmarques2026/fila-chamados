import {
  canTransition,
  categoryNames,
  priorityNames,
  statusNames,
  type Ticket,
  type TicketEvent,
  type TicketStatus,
} from "@/lib/ticket-rules";
import { createStore, DemoError, input, json, text } from "./runtime";
type Row = Ticket & { requester_id: string };
type State = { tickets: Row[]; events: (TicketEvent & { ticket_id: string })[]; next: number };
export const role = () => (location.hash === "#cliente" ? "cliente" : "responsavel");
const actor = () =>
  role() === "responsavel"
    ? { id: "agent-demo", name: "Mateus · demonstração", email: "dono@example.com", agent: true }
    : {
        id: "client-demo",
        name: "Marina · demonstração",
        email: "marina@example.com",
        agent: false,
      };
export const store = createStore<State>("fila-pages-v1", () => {
  const now = new Date().toISOString();
  return {
    next: 4,
    events: [],
    tickets: [
      {
        id: "exemplo-acesso",
        number: 1,
        title: "Não consigo acessar o painel",
        body: "Ao entrar no painel de demonstração, aparece uma mensagem de acesso indisponível.",
        category: "acesso",
        priority: "alta",
        status: "novo",
        requester_id: "client-demo",
        requester_name: "Marina · demonstração",
        requester_email: "marina@example.com",
        assignee: null,
        version: 1,
        created_at: now,
        updated_at: now,
      },
      {
        id: "exemplo-relatorio",
        number: 2,
        title: "Relatório não mostra o mês atual",
        body: "O relatório fictício continua exibindo o mês anterior mesmo após atualizar os filtros.",
        category: "erro",
        priority: "normal",
        status: "em_andamento",
        requester_id: "other-demo",
        requester_name: "Pedro · demonstração",
        requester_email: "pedro@example.com",
        assignee: "agent-demo",
        version: 1,
        created_at: now,
        updated_at: now,
      },
      {
        id: "exemplo-plano",
        number: 3,
        title: "Dúvida sobre o plano contratado",
        body: "Gostaria de entender quais funcionalidades estão incluídas no plano fictício da demonstração.",
        category: "duvida",
        priority: "baixa",
        status: "aguardando_cliente",
        requester_id: "client-demo",
        requester_name: "Marina · demonstração",
        requester_email: "marina@example.com",
        assignee: "agent-demo",
        version: 1,
        created_at: now,
        updated_at: now,
      },
    ],
  };
});
function member<K extends string>(value: unknown, values: Record<K, string>, label: string): K {
  if (typeof value !== "string" || !(value in values))
    throw new DemoError("Confira " + label + ".");
  return value as K;
}
export async function handle(request: Request) {
  const url = new URL(request.url),
    [, , resource, id, action] = url.pathname.split("/"),
    state = store.get(),
    user = actor();
  if (resource === "session")
    return json({ name: user.name, role: user.agent ? "agent" : "requester" });
  if (resource !== "tickets") throw new DemoError("Rota não encontrada.", 404);
  const own = state.tickets.filter((t) => user.agent || t.requester_id === user.id);
  if (request.method === "GET" && !id) {
    const status = url.searchParams.get("status"),
      q = (url.searchParams.get("q") ?? "").toLocaleLowerCase("pt-BR");
    return json({
      tickets: own
        .filter(
          (t) =>
            (!status || t.status === status) &&
            (t.title + " " + t.requester_name).toLocaleLowerCase("pt-BR").includes(q),
        )
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at) || b.number - a.number)
        .slice(0, 200),
      summary: {
        total: own.length,
        new_count: own.filter((t) => t.status === "novo").length,
        doing: own.filter((t) => t.status === "em_andamento").length,
        waiting: own.filter((t) => t.status === "aguardando_cliente").length,
        resolved: own.filter((t) => t.status === "resolvido").length,
      },
      agent: user.agent,
    });
  }
  const body = request.method === "GET" ? {} : await input(request);
  if (request.method === "POST" && !id) {
    const ticket: Row = {
      id: crypto.randomUUID(),
      number: state.next++,
      title: text(body.title, 6, 120, "título"),
      body: text(body.body, 20, 5000, "descrição"),
      category: member(body.category, categoryNames, "a categoria"),
      priority: member(body.priority ?? "normal", priorityNames, "a prioridade"),
      status: "novo",
      requester_id: user.id,
      requester_name: user.name,
      requester_email: user.email,
      assignee: null,
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    state.tickets.push(ticket);
    store.save(state);
    return json(ticket, 201);
  }
  const ticket = own.find((t) => t.id === id);
  if (!ticket) throw new DemoError("Chamado não encontrado nesta visão.", 404);
  if (request.method === "GET")
    return json({
      ticket,
      events: state.events.filter(
        (e) => e.ticket_id === id && (user.agent || e.visibility === "public"),
      ),
    });
  if (ticket.version !== body.version)
    throw new DemoError("O chamado mudou. Atualize antes de continuar.", 409);
  const now = new Date().toISOString();
  const event = (kind: string, message: string, visibility: "public" | "internal" = "public") =>
    state.events.push({
      seq: state.events.length + 1,
      ticket_id: ticket.id,
      kind,
      body: message,
      author_name: user.name,
      visibility,
      created_at: now,
    });
  if (request.method === "PATCH") {
    if (!user.agent) throw new DemoError("Use a visão do responsável para fazer a triagem.", 403);
    const messages: string[] = [];
    let status = ticket.status;
    if (body.status !== undefined) {
      status = member(body.status, statusNames, "o status");
      if (status !== ticket.status && !canTransition(ticket.status, status))
        throw new DemoError("Essa mudança de status não é permitida.", 422);
      if (status !== ticket.status)
        messages.push("Status: " + statusNames[ticket.status] + " → " + statusNames[status]);
    }
    const priority =
      body.priority === undefined
        ? ticket.priority
        : member(body.priority, priorityNames, "a prioridade");
    if (priority !== ticket.priority) messages.push("Prioridade: " + priorityNames[priority]);
    let assignee = ticket.assignee;
    if (typeof body.assign === "boolean") {
      assignee = body.assign ? user.id : null;
      if (assignee !== ticket.assignee)
        messages.push(assignee ? "Chamado assumido pelo responsável." : "Responsável removido.");
    }
    if (!messages.length) throw new DemoError("Nenhuma alteração para salvar.");
    Object.assign(ticket, { status, priority, assignee });
    event("change", messages.join(" · "));
  } else if (request.method === "POST" && action === "replies") {
    if (body.internal && !user.agent)
      throw new DemoError("Notas internas são exclusivas do responsável.", 403);
    if (["resolvido", "cancelado"].includes(ticket.status))
      throw new DemoError("O chamado está encerrado. O responsável precisa reabri-lo.", 409);
    event("comment", text(body.body, 2, 4000, "resposta"), body.internal ? "internal" : "public");
    if (!user.agent && ticket.status === "aguardando_cliente") {
      ticket.status = "em_andamento";
      event("change", "Cliente respondeu. Status: Em andamento.");
    }
  } else throw new DemoError("Ação não encontrada.", 404);
  ticket.version++;
  ticket.updated_at = now;
  store.save(state);
  return json(ticket);
}
