import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import "./shared/theme/globals.css";
import { ChatWindow } from "./windows/chat/ChatWindow";
import { PetWindow } from "./windows/pet/PetWindow";
import { ActivityWindow } from "./windows/activity";
import { ToyWindow } from "./windows/toy";
import { PresenceNagWindow } from "./windows/presence-nag/PresenceNagWindow";
import { DiaryDetailWindow } from "./windows/diary-detail/DiaryDetailWindow";
import { avatarStore } from "./shared/avatars/store";
import { initTheme } from "./shared/theme/registry";

const windowView = new URLSearchParams(window.location.search).get("window");
const isPetWindow = windowView === "pet";
const isPresenceNagWindow = windowView === "presence-nag";
const isDiaryDetailWindow = windowView === "diary-detail";

function AppRoot() {
  const [activeWindow, setActiveWindow] = useState<"chat" | "activity" | "toy">("chat");
  return (
    <>
      <ChatWindow
        onActivityOpen={() => setActiveWindow("activity")}
        onToyOpen={() => setActiveWindow("toy")}
      />
      {activeWindow === "activity" && (
        <ActivityWindow onClose={() => setActiveWindow("chat")} />
      )}
      {activeWindow === "toy" && (
        <ToyWindow onClose={() => setActiveWindow("chat")} />
      )}
    </>
  );
}

initTheme().catch(error => console.warn("[theme] 初始化失败:", error));

function Root() {
  if (isPetWindow) return <PetWindow />;
  if (isPresenceNagWindow) return <PresenceNagWindow />;
  if (isDiaryDetailWindow) return <DiaryDetailWindow />;
  return <AppRoot />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);

if (!isPetWindow && !isPresenceNagWindow && !isDiaryDetailWindow) {
  avatarStore.init().catch(console.warn);
}
