import { createRoot } from "react-dom/client";
import { useState, useEffect } from "react";
import Desk from "@/app/desk";
import "@/app/globals.css";
import DemoToolbar from "./toolbar";
import { installDemoApi, handleLinks } from "./runtime";
import { handle, role, store } from "./api";
installDemoApi(handle);
handleLinks(() => {
  location.hash = "responsavel";
  location.reload();
});
function Demo() {
  const [current, setCurrent] = useState(role);
  useEffect(() => {
    const update = () => setCurrent(role());
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  const agent = current === "responsavel";
  return (
    <>
      <DemoToolbar
        repo="fila-chamados"
        role={current}
        roles={[
          ["responsavel", "Visão do responsável"],
          ["cliente", "Visão do cliente"],
        ]}
        onRole={(value) => {
          location.hash = value;
        }}
        onReset={() => {
          store.reset();
          location.reload();
        }}
      />
      <Desk
        key={current}
        name={agent ? "Mateus · demonstração" : "Marina · demonstração"}
        email={agent ? "dono@example.com" : "marina@example.com"}
        agent={agent}
        local
      />
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Demo />);
