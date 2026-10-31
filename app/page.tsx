import { env } from "cloudflare:workers";
import { getChatGPTUser, chatGPTSignInPath } from "./chatgpt-auth";
import { actorFor, DeskError } from "@/lib/desk";
import Desk from "./desk";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await getChatGPTUser();
  const local = env.LOCAL_PREVIEW === "1";
  if (!user)
    return (
      <main className="entry">
        <a className="brand" href="/">
          FILA<span>↗</span>
        </a>
        <span className="eyebrow">CENTRAL DE ATENDIMENTO</span>
        <h1>
          Uma conversa.
          <br />
          Um caminho
          <br />
          até a solução.
        </h1>
        <p>Abra uma solicitação e acompanhe o atendimento em um só lugar.</p>
        <a className="button primary" href={chatGPTSignInPath("/")} target="_top">
          {local ? "Entrar com conta de teste" : "Entrar com ChatGPT"} →
        </a>
        {local && <small>Ambiente local: a conta fictícia do responsável será usada.</small>}
      </main>
    );
  try {
    const actor = await actorFor(user);
    return (
      <Desk
        name={user.fullName ?? user.email}
        email={user.email}
        agent={actor.agent}
        local={local}
      />
    );
  } catch (error) {
    if (error instanceof DeskError)
      return (
        <main className="entry">
          <span className="brand">FILA↗</span>
          <h1>Central indisponível.</h1>
          <p>{error.message}</p>
          <a className="button secondary" href="/signout-with-chatgpt?return_to=/">
            Sair da conta
          </a>
        </main>
      );
    throw error;
  }
}
