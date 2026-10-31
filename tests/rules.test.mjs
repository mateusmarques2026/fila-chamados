import { test } from "node:test";
import assert from "node:assert/strict";
import { canTransition, transitions } from "../lib/ticket-rules.ts";
test("novo precisa entrar em atendimento antes de ser resolvido", () => {
  assert.equal(canTransition("novo", "em_andamento"), true);
  assert.equal(canTransition("novo", "resolvido"), false);
});
test("chamado resolvido pode ser reaberto", () => {
  assert.equal(canTransition("resolvido", "em_andamento"), true);
  assert.equal(canTransition("resolvido", "novo"), false);
});
test("cancelado é terminal e não há transição para o mesmo estado", () => {
  assert.deepEqual(transitions.cancelado, []);
  for (const [from, targets] of Object.entries(transitions)) assert.ok(!targets.includes(from));
});
test("aguardando cliente pode voltar para atendimento ou ser finalizado", () => {
  assert.equal(canTransition("aguardando_cliente", "em_andamento"), true);
  assert.equal(canTransition("aguardando_cliente", "resolvido"), true);
});
