import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import "./shared/theme/globals.css";
import { ChatWindow } from "./windows/chat/ChatWindow";
import { PetWindow } from "./windows/pet/PetWindow";
import { ActivityWindow } from "./windows/activity";
import { ToyWindow } from "./windows/toy";
import { RoomWindow } from "./windows/room";
import { PresenceNagWindow } from "./windows/presence-nag/PresenceNagWindow";
import { DiaryDetailWindow } from "./windows/diary-detail/DiaryDetailWindow";
import { avatarStore } from "./shared/avatars/store";
import { initTheme } from "./shared/theme/registry";
import { initUIPrefs } from "./shared/uiPreferences";
import { initI18n } from "./shared/i18n";

const windowView = new URLSearchParams(window.location.search).get("window");
const isPetWindow = windowView === "pet";
const isPresenceNagWindow = windowView === "presence-nag";
const isDiaryDetailWindow = windowView === "diary-detail";

function AppRoot() {
  const [activeWindow, setActiveWindow] = useState<"chat" | "activity" | "toy" | "room">("chat");
  return (
    <>
      <ChatWindow
        onActivityOpen={() => setActiveWindow("activity")}
        onToyOpen={() => setActiveWindow("toy")}
        onRoomOpen={() => setActiveWindow("room")}
      />
      {activeWindow === "activity" && (
        <ActivityWindow onClose={() => setActiveWindow("chat")} />
      )}
      {activeWindow === "toy" && (
        <ToyWindow onClose={() => setActiveWindow("chat")} />
      )}
      {activeWindow === "room" && (
        <RoomWindow onClose={() => setActiveWindow("chat")} />
      )}
    </>
  );
}

function Root() {
  if (isPetWindow) return <PetWindow />;
  if (isPresenceNagWindow) return <PresenceNagWindow />;
  if (isDiaryDetailWindow) return <DiaryDetailWindow />;
  return <AppRoot />;
}

await initUIPrefs();
initTheme().catch(error => console.warn("[theme] 初始化失败:", error));
initI18n();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);

if (!isPetWindow && !isPresenceNagWindow && !isDiaryDetailWindow) {
  avatarStore.init().catch(console.warn);
}
