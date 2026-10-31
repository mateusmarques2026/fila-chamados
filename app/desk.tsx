"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Clock3,
  Inbox,
  LockKeyhole,
  MessageSquare,
  Plus,
  RotateCw,
  Search,
  Send,
  UserRound,
  X,
} from "lucide-react";
import {
  statusNames,
  priorityNames,
  categoryNames,
  transitions,
  type Ticket,
  type TicketEvent,
  type TicketStatus,
} from "@/lib/ticket-rules";
type Detail = { ticket: Ticket; events: TicketEvent[] };
type Summary = {
  total: number;
  new_count: number;
  doing: number;
  waiting: number;
  resolved: number;
};
const stamp = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Fortaleza",
  }).format(new Date(value));
const code = (n: number) => "FILA-" + String(n).padStart(4, "0");
async function api<T>(route: string, method = "GET", body?: unknown) {
  const response = await fetch("/api/" + route, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Não foi possível concluir.");
  return data;
}
export default function Desk({
  name,
  email,
  agent,
  local,
}: {
  name: string;
  email: string;
  agent: boolean;
  local: boolean;
}) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [summary, setSummary] = useState<Summary>({
    total: 0,
    new_count: 0,
    doing: 0,
    waiting: 0,
    resolved: 0,
  });
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [replyText, setReplyText] = useState("");
  const [internal, setInternal] = useState(false);
  const listSerial = useRef(0);
  const detailSerial = useRef(0);
  const load = useCallback(
    async (silent = false) => {
      const token = ++listSerial.current;
      if (!silent) setLoading(true);
      try {
        const result = await api<{ tickets: Ticket[]; summary: Summary }>(
          "tickets?status=" + status + "&q=" + encodeURIComponent(query),
        );
        if (token === listSerial.current) {
          setTickets(result.tickets);
          setSummary(result.summary);
        }
      } catch (e) {
        if (token === listSerial.current) setError((e as Error).message);
      } finally {
        if (token === listSerial.current) setLoading(false);
      }
    },
    [status, query],
  );
  const open = useCallback(async (id: string) => {
    const token = ++detailSerial.current;
    setSelected(id);
    setCreating(false);
    setDetailLoading(true);
    try {
      const result = await api<Detail>("tickets/" + id);
      if (token === detailSerial.current) setDetail(result);
    } catch (e) {
      if (token === detailSerial.current) setError((e as Error).message);
    } finally {
      if (token === detailSerial.current) setDetailLoading(false);
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 180);
    return () => {
      clearTimeout(timer);
      listSerial.current++;
    };
  }, [load]);
  useEffect(() => {
    const tick = setInterval(() => {
      if (document.visibilityState === "visible" && !pending) void load(true);
    }, 30000);
    return () => clearInterval(tick);
  }, [load, pending]);
  async function mutate(action: () => Promise<unknown>, message: string) {
    setPending(true);
    setError("");
    try {
      await action();
      setNotice(message);
      await load(true);
      if (selected) await open(selected);
      return true;
    } catch (e) {
      setError((e as Error).message);
      if (selected) await open(selected);
      return false;
    } finally {
      setPending(false);
    }
  }
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setPending(true);
    setError("");
    try {
      const result = await api<Ticket>("tickets", "POST", {
        title: data.get("title"),
        body: data.get("body"),
        category: data.get("category"),
        priority: data.get("priority"),
      });
      setNotice("Chamado aberto. Você pode acompanhar o atendimento aqui.");
      setCreating(false);
      await load();
      await open(result.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  async function send(e: FormEvent) {
    e.preventDefault();
    if (!detail) return;
    const success = await mutate(
      () =>
        api("tickets/" + detail.ticket.id + "/replies", "POST", {
          version: detail.ticket.version,
          body: replyText,
          ...(agent ? { internal } : {}),
        }),
      internal ? "Nota interna adicionada." : "Resposta enviada.",
    );
    if (success) {
      setReplyText("");
      setInternal(false);
    }
  }
  async function samples() {
    setPending(true);
    setError("");
    try {
      for (const [title, category, body] of [
        [
          "Não consigo acessar o painel",
          "acesso",
          "Ao entrar no painel de demonstração, recebo uma mensagem de acesso indisponível.",
        ],
        [
          "Relatório não mostra o mês atual",
          "erro",
          "O relatório de demonstração continua exibindo o mês anterior mesmo após atualizar os filtros.",
        ],
        [
          "Dúvida sobre o plano contratado",
          "financeiro",
          "Gostaria de entender quais funcionalidades estão incluídas no plano fictício desta demonstração.",
        ],
      ])
        await api("tickets", "POST", { title, category, body, priority: "normal" });
      setNotice("Três chamados fictícios foram criados.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  const ticket = detail?.ticket;
  const closed = ticket && ["resolvido", "cancelado"].includes(ticket.status);
  return (
    <>
      <header className="top">
        <a href="/" className="brand">
          FILA<span>↗</span>
        </a>
        <span className="brand-sub">
          CENTRAL DE
          <br />
          ATENDIMENTO
        </span>
        <span className="mode-label">{agent ? "RESPONSÁVEL" : "CLIENTE"}</span>
        <details className="account">
          <summary>
            <UserRound size={17} />
            <span>{name}</span>
          </summary>
          <div>
            <strong>{name}</strong>
            <p>{email}</p>
            <small>
              {agent ? "Responsável pela central" : "Cliente · minhas solicitações"}
              {local ? " / teste local" : ""}
            </small>
            <a href="/signout-with-chatgpt?return_to=/">Sair da conta</a>
          </div>
        </details>
      </header>
      <div className="shell">
        <aside className="rail">
          <span className="rail-label">ATENDIMENTO</span>
          <button
            className={!creating ? "active" : ""}
            onClick={() => {
              setCreating(false);
              setSelected(null);
              setDetail(null);
            }}
          >
            <Inbox size={18} />
            {agent ? "Todos os chamados" : "Meus chamados"}
            <span>{summary.total}</span>
          </button>
          <button
            className={creating ? "active" : ""}
            onClick={() => {
              setCreating(true);
              setSelected(null);
              setDetail(null);
              setError("");
            }}
          >
            <Plus size={18} />
            Novo chamado
          </button>
          <div className="rail-note">
            <MessageSquare size={22} />
            <strong>Contexto faz diferença.</strong>
            <p>Registre o problema e acompanhe cada resposta no histórico.</p>
            <span>{local ? "DADOS DE TESTE LOCAIS" : "ACESSO AUTENTICADO"}</span>
          </div>
        </aside>
        <main>
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {agent ? "PAINEL DO RESPONSÁVEL" : "MINHA ÁREA DE ATENDIMENTO"}
              </span>
              <h1>
                {creating
                  ? "Novo chamado."
                  : selected
                    ? "Atendimento."
                    : agent
                      ? "Fila de chamados."
                      : "Meus chamados."}
              </h1>
              <p>
                {creating
                  ? "Descreva o que aconteceu e o que você precisa resolver."
                  : selected
                    ? "Toda a conversa e cada mudança, no mesmo lugar."
                    : agent
                      ? "Priorize, responda e acompanhe as solicitações recebidas."
                      : "Abra uma solicitação e acompanhe o retorno do responsável."}
              </p>
            </div>
            {!creating && !selected && (
              <button
                className="button primary"
                onClick={() => {
                  setCreating(true);
                  setError("");
                }}
              >
                <Plus size={17} />
                Novo chamado
              </button>
            )}
            {selected && (
              <button
                className="button secondary"
                disabled={pending}
                onClick={() => {
                  void load(true);
                  void open(selected);
                }}
              >
                <RotateCw size={15} />
                Atualizar
              </button>
            )}
          </div>
          {error && (
            <div className="message error" role="alert">
              <span>{error}</span>
              <button onClick={() => setError("")} aria-label="Dispensar erro">
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="message success" role="status">
              <Check size={17} />
              <span>{notice}</span>
              <button onClick={() => setNotice("")} aria-label="Dispensar confirmação">
                <X size={16} />
              </button>
            </div>
          )}
          {creating ? (
            <form className="new-ticket" onSubmit={create}>
              <div className="form-section">
                <span className="eyebrow">INFORMAÇÕES DO CHAMADO</span>
                <label>
                  Título
                  <input
                    name="title"
                    minLength={6}
                    maxLength={120}
                    required
                    disabled={pending}
                    placeholder="Resuma o problema em uma frase"
                  />
                </label>
                <div className="form-row">
                  <label>
                    Categoria
                    <select aria-label="Categoria" name="category" disabled={pending}>
                      {Object.entries(categoryNames).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Prioridade
                    <select
                      aria-label="Prioridade"
                      name="priority"
                      defaultValue="normal"
                      disabled={pending}
                    >
                      {Object.entries(priorityNames).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  Descrição
                  <textarea
                    name="body"
                    rows={7}
                    minLength={20}
                    maxLength={5000}
                    required
                    disabled={pending}
                    placeholder="O que você estava fazendo? Qual resultado esperava? Inclua detalhes que ajudem o atendimento."
                  />
                </label>
                <p className="form-hint">
                  Evite incluir senhas, dados de cartão ou outras informações sensíveis.
                </p>
                <div className="form-actions">
                  <button
                    type="button"
                    className="button secondary"
                    disabled={pending}
                    onClick={() => setCreating(false)}
                  >
                    Voltar
                  </button>
                  <button className="button primary" disabled={pending}>
                    {pending ? "Abrindo…" : "Abrir chamado"}
                    <ArrowUpRight size={17} />
                  </button>
                </div>
              </div>
              <aside className="new-ticket-note">
                <span>01 / DESCREVA</span>
                <h2>
                  Uma boa descrição
                  <br />
                  acelera a resposta.
                </h2>
                <p>Conte o que aconteceu, quando começou e quais tentativas você já fez.</p>
                <p>
                  Você poderá complementar as informações na conversa depois de abrir o chamado.
                </p>
              </aside>
            </form>
          ) : selected ? (
            <>
              {detailLoading ? (
                <div className="empty">
                  <RotateCw size={22} />
                  Carregando atendimento…
                </div>
              ) : (
                ticket && (
                  <>
                    <button
                      className="text-button back"
                      onClick={() => {
                        setSelected(null);
                        setDetail(null);
                        setReplyText("");
                        setInternal(false);
                      }}
                    >
                      <ArrowLeft size={15} />
                      Voltar aos chamados
                    </button>
                    <div className="detail-layout">
                      <section className="conversation">
                        <div className="ticket-heading">
                          <span className="ticket-code">{code(ticket.number)}</span>
                          <h2>{ticket.title}</h2>
                          <div>
                            <span className={"status " + ticket.status}>
                              {statusNames[ticket.status]}
                            </span>
                            <span className="subtle">Aberto em {stamp(ticket.created_at)}</span>
                          </div>
                        </div>
                        <article className="initial-message">
                          <div>
                            <span className="avatar">
                              {ticket.requester_name[0]?.toUpperCase()}
                            </span>
                            <div>
                              <strong>{ticket.requester_name}</strong>
                              <small>Solicitante</small>
                            </div>
                          </div>
                          <p>{ticket.body}</p>
                        </article>
                        <div className="timeline">
                          {detail.events
                            .filter((event) => event.kind !== "created")
                            .map((event) =>
                              event.kind === "change" ? (
                                <div className="event-change" key={event.seq}>
                                  <Clock3 size={13} />
                                  <span>{event.body}</span>
                                  <small>{stamp(event.created_at)}</small>
                                </div>
                              ) : (
                                <article
                                  key={event.seq}
                                  className={
                                    "reply " + (event.visibility === "internal" ? "internal" : "")
                                  }
                                >
                                  <div>
                                    <strong>{event.author_name}</strong>
                                    <span>
                                      {event.visibility === "internal" && (
                                        <span className="internal-label">
                                          <LockKeyhole size={11} />
                                          Nota interna
                                        </span>
                                      )}
                                      <small>{stamp(event.created_at)}</small>
                                    </span>
                                  </div>
                                  <p>{event.body}</p>
                                </article>
                              ),
                            )}
                        </div>
                        {closed ? (
                          <div className="closed-note">
                            <Check size={18} />
                            <p>
                              {agent && ticket.status === "resolvido"
                                ? "Atendimento resolvido. Altere o status para reabrir a conversa."
                                : "Este atendimento está encerrado."}
                            </p>
                          </div>
                        ) : (
                          <form className="reply-form" onSubmit={send}>
                            <label htmlFor="reply-text">
                              {internal
                                ? "Nota interna — somente o responsável pode ver"
                                : "Responder ao chamado"}
                            </label>
                            <textarea
                              id="reply-text"
                              minLength={2}
                              maxLength={4000}
                              rows={4}
                              required
                              disabled={pending}
                              value={replyText}
                              onChange={(e) => setReplyText(e.target.value)}
                              placeholder={
                                internal
                                  ? "Registre um detalhe para o atendimento interno."
                                  : "Escreva sua mensagem…"
                              }
                            />
                            <div>
                              {agent ? (
                                <label className="checkbox">
                                  <input
                                    type="checkbox"
                                    checked={internal}
                                    disabled={pending}
                                    onChange={(e) => setInternal(e.target.checked)}
                                  />
                                  <LockKeyhole size={13} />
                                  Nota interna
                                </label>
                              ) : (
                                <span className="form-hint">
                                  Sua resposta fica no histórico do chamado.
                                </span>
                              )}
                              <button
                                className="button primary"
                                disabled={pending || replyText.trim().length < 2}
                              >
                                {pending ? "Enviando…" : "Enviar resposta"}
                                <Send size={14} />
                              </button>
                            </div>
                          </form>
                        )}
                      </section>
                      <aside className="ticket-meta">
                        <span className="eyebrow">DETALHES DO ATENDIMENTO</span>
                        <div>
                          <label>Status</label>
                          {agent ? (
                            <select
                              aria-label="Alterar status"
                              value={ticket.status}
                              disabled={pending}
                              onChange={(e) =>
                                void mutate(
                                  () =>
                                    api("tickets/" + ticket.id, "PATCH", {
                                      version: ticket.version,
                                      status: e.target.value,
                                    }),
                                  "Status atualizado.",
                                )
                              }
                            >
                              {[ticket.status, ...transitions[ticket.status]].map((value) => (
                                <option key={value} value={value}>
                                  {statusNames[value]}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <strong>{statusNames[ticket.status]}</strong>
                          )}
                        </div>
                        <div>
                          <label>Prioridade</label>
                          {agent ? (
                            <select
                              aria-label="Alterar prioridade"
                              value={ticket.priority}
                              disabled={pending}
                              onChange={(e) =>
                                void mutate(
                                  () =>
                                    api("tickets/" + ticket.id, "PATCH", {
                                      version: ticket.version,
                                      priority: e.target.value,
                                    }),
                                  "Prioridade atualizada.",
                                )
                              }
                            >
                              {Object.entries(priorityNames).map(([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <strong>{priorityNames[ticket.priority]}</strong>
                          )}
                        </div>
                        <div>
                          <label>Categoria</label>
                          <strong>{categoryNames[ticket.category]}</strong>
                        </div>
                        <div>
                          <label>Responsável</label>
                          <strong>
                            {ticket.assignee ? "Responsável pela central" : "Ainda não atribuído"}
                          </strong>
                          {agent && !closed && (
                            <button
                              className="text-button"
                              disabled={pending}
                              onClick={() =>
                                void mutate(
                                  () =>
                                    api("tickets/" + ticket.id, "PATCH", {
                                      version: ticket.version,
                                      assign: !ticket.assignee,
                                      ...(!ticket.assignee && ticket.status === "novo"
                                        ? { status: "em_andamento" }
                                        : {}),
                                    }),
                                  ticket.assignee
                                    ? "Responsável removido."
                                    : "Você assumiu este chamado.",
                                )
                              }
                            >
                              {ticket.assignee ? "Remover atribuição" : "Assumir chamado"}
                              <ArrowUpRight size={13} />
                            </button>
                          )}
                        </div>
                        <div>
                          <label>Solicitante</label>
                          <strong>{ticket.requester_name}</strong>
                          <small>{ticket.requester_email}</small>
                        </div>
                        <div className="version-note">
                          Versão {ticket.version} · Atualizado em {stamp(ticket.updated_at)}
                        </div>
                      </aside>
                    </div>
                  </>
                )
              )}
            </>
          ) : (
            <>
              <section className="metrics">
                <div>
                  <span>Novos</span>
                  <strong>{summary.new_count ?? 0}</strong>
                </div>
                <div>
                  <span>Em andamento</span>
                  <strong>{summary.doing ?? 0}</strong>
                </div>
                <div>
                  <span>Aguardando cliente</span>
                  <strong>{summary.waiting ?? 0}</strong>
                </div>
                <div>
                  <span>Resolvidos</span>
                  <strong>{summary.resolved ?? 0}</strong>
                </div>
              </section>
              <div className="list-toolbar">
                <div className="filters">
                  <button className={!status ? "selected" : ""} onClick={() => setStatus("")}>
                    Todos
                  </button>
                  {Object.entries(statusNames).map(([value, label]) => (
                    <button
                      key={value}
                      className={status === value ? "selected" : ""}
                      onClick={() => setStatus(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <label className="search">
                  <Search size={15} />
                  <input
                    aria-label="Buscar chamado"
                    placeholder="Buscar chamado"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
              </div>
              <section className="ticket-table">
                <div className="ticket-table-head">
                  <span>CHAMADO / ASSUNTO</span>
                  <span>PRIORIDADE</span>
                  <span>STATUS</span>
                  <span>ATUALIZADO</span>
                  <span />
                </div>
                {loading ? (
                  <div className="empty">Carregando chamados…</div>
                ) : !tickets.length ? (
                  <div className="empty">
                    <Inbox size={30} />
                    <h3>
                      {query || status
                        ? "Nenhum chamado neste filtro."
                        : "Nenhuma solicitação por aqui."}
                    </h3>
                    <p>Os chamados aparecem aqui com todo o histórico de atendimento.</p>
                    <button className="text-button" onClick={() => setCreating(true)}>
                      Abrir primeiro chamado
                      <Plus size={14} />
                    </button>
                  </div>
                ) : (
                  tickets.map((t) => (
                    <button
                      key={t.id}
                      className="ticket-row"
                      onClick={() => {
                        setError("");
                        setReplyText("");
                        void open(t.id);
                      }}
                    >
                      <span>
                        <small className="ticket-code">{code(t.number)}</small>
                        <strong>{t.title}</strong>
                        <small>{agent ? t.requester_name : categoryNames[t.category]}</small>
                      </span>
                      <span className={"priority " + t.priority}>
                        <i />
                        {priorityNames[t.priority]}
                      </span>
                      <span className={"status " + t.status}>{statusNames[t.status]}</span>
                      <span className="subtle">{stamp(t.updated_at)}</span>
                      <ArrowUpRight size={16} />
                    </button>
                  ))
                )}
              </section>
              <div className="list-footer">
                <span>{tickets.length} resultados · até 200 por consulta</span>
                {agent && (
                  <button className="text-button" disabled={pending} onClick={() => void samples()}>
                    Criar três exemplos fictícios
                    <ArrowUpRight size={13} />
                  </button>
                )}
              </div>
            </>
          )}
          <footer>
            <span>FILA / Central de atendimento</span>
            <span>
              {agent ? "Responsável pela central" : "Área do cliente"}
              {local ? " · conta de teste" : ""}
            </span>
          </footer>
        </main>
      </div>
    </>
  );
}
