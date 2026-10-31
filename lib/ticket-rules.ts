export const statuses = [
  "novo",
  "em_andamento",
  "aguardando_cliente",
  "resolvido",
  "cancelado",
] as const;
export type TicketStatus = (typeof statuses)[number];
export const statusNames: Record<TicketStatus, string> = {
  novo: "Novo",
  em_andamento: "Em andamento",
  aguardando_cliente: "Aguardando cliente",
  resolvido: "Resolvido",
  cancelado: "Cancelado",
};
export const priorityNames = { baixa: "Baixa", normal: "Normal", alta: "Alta" };
export const categoryNames = {
  acesso: "Acesso",
  erro: "Erro no sistema",
  financeiro: "Financeiro",
  duvida: "Dúvida",
};
export const transitions: Record<TicketStatus, TicketStatus[]> = {
  novo: ["em_andamento", "cancelado"],
  em_andamento: ["aguardando_cliente", "resolvido", "cancelado"],
  aguardando_cliente: ["em_andamento", "resolvido", "cancelado"],
  resolvido: ["em_andamento"],
  cancelado: [],
};
export function canTransition(from: TicketStatus, to: TicketStatus) {
  return transitions[from].includes(to);
}
export type Ticket = {
  id: string;
  number: number;
  title: string;
  body: string;
  category: keyof typeof categoryNames;
  priority: keyof typeof priorityNames;
  status: TicketStatus;
  requester_name: string;
  requester_email: string;
  assignee: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};
export type TicketEvent = {
  seq: number;
  kind: string;
  body: string;
  author_name: string;
  visibility: "public" | "internal";
  created_at: string;
};
