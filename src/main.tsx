import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import "./shared/theme/globals.css";
import { ChatWindow } from "./windows/chat/ChatWindow";
import { PetWindow } from "./windows/pet/PetWindow";
import { ActivityWindow } from "./windows/activity";
import { avatarStore } from "./shared/avatars/store";

const isPetWindow = new URLSearchParams(window.location.search).get("window") === "pet";

function AppRoot() {
  const [activeWindow, setActiveWindow] = useState<"chat" | "activity">("chat");
  return (
    <>
      <ChatWindow onActivityOpen={() => setActiveWindow("activity")} />
      {activeWindow === "activity" && (
        <ActivityWindow onClose={() => setActiveWindow("chat")} />
      )}
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isPetWindow ? <PetWindow /> : <AppRoot />}
  </React.StrictMode>,
);

if (!isPetWindow) avatarStore.init().catch(console.warn);
