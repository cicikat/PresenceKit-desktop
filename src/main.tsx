import React from "react";
import ReactDOM from "react-dom/client";
import "./shared/theme/globals.css";
import { ChatWindow } from "./windows/chat/ChatWindow";
import { avatarStore } from "./shared/avatars/store";

avatarStore.init().catch(console.warn);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ChatWindow />
  </React.StrictMode>,
);
