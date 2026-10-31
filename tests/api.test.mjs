import { test } from "node:test";
import assert from "node:assert/strict";
const base = process.env.FILA_TEST_URL ?? "http://127.0.0.1:5176";
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname))
  throw new Error("Use apenas a prévia local.");
let cookie = "";
async function call(route, method = "GET", body, profile) {
  const response = await fetch(base + "/api/" + route, {
    method,
    headers: {
      cookie,
      origin: base,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(profile ? { "x-studio-test-user": profile } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: await response.json() };
}
test("cliente, responsável, notas internas, concorrência e trilha de alterações", async () => {
  assert.equal((await call("tickets")).status, 401);
  const login = await fetch(base + "/signin-with-chatgpt?return_to=/", { redirect: "manual" });
  cookie = login.headers
    .getSetCookie()
    .map((v) => v.split(";")[0])
    .join("; ");
  assert.equal((await call("session")).data.role, "agent");
  assert.equal(
    (await call("session", "GET", undefined, "alice")).data.role,
    "requester",
    "Use npm run dev:roles",
  );
  const created = await call(
    "tickets",
    "POST",
    {
      title: "Teste de acesso " + Date.now(),
      body: "Não consigo acessar o painel de demonstração e preciso de ajuda para continuar.",
      category: "acesso",
      priority: "normal",
    },
    "alice",
  );
  assert.equal(created.status, 201);
  const id = created.data.id;
  assert.equal((await call("tickets/" + id, "GET", undefined, "bruno")).status, 404);
  assert.equal(
    (await call("tickets/" + id, "PATCH", { version: 1, status: "em_andamento" }, "alice")).status,
    403,
  );
  assert.equal(
    (
      await call(
        "tickets/" + id + "/replies",
        "POST",
        { version: 1, body: "Tentativa privada", internal: true },
        "alice",
      )
    ).status,
    403,
  );
  const race = await Promise.all([
    call("tickets/" + id, "PATCH", { version: 1, status: "em_andamento", assign: true }),
    call("tickets/" + id, "PATCH", { version: 1, status: "em_andamento", priority: "alta" }),
  ]);
  assert.deepEqual(race.map((r) => r.status).sort(), [200, 409]);
  let detail = (await call("tickets/" + id)).data;
  assert.equal(
    detail.events.filter((e) => e.kind === "change").length,
    1,
    "A mudança perdedora não pode gerar evento",
  );
  const note = await call("tickets/" + id + "/replies", "POST", {
    version: detail.ticket.version,
    body: "Análise interna que não pode aparecer para o cliente.",
    internal: true,
  });
  assert.equal(note.status, 201);
  detail = (await call("tickets/" + id)).data;
  const client = (await call("tickets/" + id, "GET", undefined, "alice")).data;
  assert.ok(!client.events.some((e) => e.visibility === "internal"));
  assert.ok(!JSON.stringify(client).includes("Análise interna"));
  assert.ok(detail.events.some((e) => e.visibility === "internal"));
  const waiting = await call("tickets/" + id, "PATCH", {
    version: detail.ticket.version,
    status: "aguardando_cliente",
  });
  assert.equal(waiting.status, 200);
  const answer = await call(
    "tickets/" + id + "/replies",
    "POST",
    { version: waiting.data.version, body: "Consegui coletar mais detalhes para o atendimento." },
    "alice",
  );
  assert.equal(answer.status, 201);
  assert.equal(answer.data.status, "em_andamento");
  const resolved = await call("tickets/" + id, "PATCH", {
    version: answer.data.version,
    status: "resolvido",
  });
  assert.equal(resolved.status, 200);
  assert.equal(
    (
      await call(
        "tickets/" + id + "/replies",
        "POST",
        { version: resolved.data.version, body: "Mensagem após fechar." },
        "alice",
      )
    ).status,
    409,
  );
  const reopened = await call("tickets/" + id, "PATCH", {
    version: resolved.data.version,
    status: "em_andamento",
  });
  assert.equal(reopened.status, 200);
  const clientList = (await call("tickets", "GET", undefined, "bruno")).data;
  assert.ok(!clientList.tickets.some((t) => t.id === id));
});
