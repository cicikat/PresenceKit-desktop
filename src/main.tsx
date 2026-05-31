import React from "react";
import ReactDOM from "react-dom/client";
import "./shared/theme/globals.css";
import { ChatWindow } from "./windows/chat/ChatWindow";
import { PetWindow } from "./windows/pet/PetWindow";
import { avatarStore } from "./shared/avatars/store";

const isPetWindow = new URLSearchParams(window.location.search).get("window") === "pet";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isPetWindow ? <PetWindow /> : <ChatWindow />}
  </React.StrictMode>,
);

if (!isPetWindow) avatarStore.init().catch(console.warn);
