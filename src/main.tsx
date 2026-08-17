import React, { Component, lazy, Suspense, type ErrorInfo, type ReactNode } from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./shared/theme/globals.css";
import { initTheme } from "./shared/theme/registry";
import { initUIPrefs } from "./shared/uiPreferences";
import { initI18n, t } from "./shared/i18n";

const windowView = new URLSearchParams(window.location.search).get("window");
const isSatelliteWindow = windowView === "design-satellite";
const isMainWindow = !isSatelliteWindow && windowView !== "pet" && windowView !== "presence-nag" && windowView !== "diary-detail";

const ChatWindow = lazy(() => import("./windows/chat/ChatWindow").then(module => ({ default: module.ChatWindow })));
const ActivityWindow = lazy(() => import("./windows/activity").then(module => ({ default: module.ActivityWindow })));
const ToyWindow = lazy(() => import("./windows/toy").then(module => ({ default: module.ToyWindow })));
const RoomWindow = lazy(() => import("./windows/room").then(module => ({ default: module.RoomWindow })));
const PetWindow = lazy(() => import("./windows/pet/PetWindow").then(module => ({ default: module.PetWindow })));
const PresenceNagWindow = lazy(() => import("./windows/presence-nag/PresenceNagWindow").then(module => ({ default: module.PresenceNagWindow })));
const DiaryDetailWindow = lazy(() => import("./windows/diary-detail/DiaryDetailWindow").then(module => ({ default: module.DiaryDetailWindow })));
const DesignSatelliteWindow = lazy(() => import("./windows/design-satellite/DesignSatelliteWindow").then(module => ({ default: module.DesignSatelliteWindow })));
const OnboardingGate = lazy(() => import("./features/onboarding/OnboardingGate").then(module => ({ default: module.OnboardingGate })));

function LoadingView() {
  return <main style={{ padding: 24, color: "var(--ink-2)" }}>{t("common.loading")}</main>;
}

class RoleLoadBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn("[bootstrap] window role failed to load", error, info.componentStack);
  }

  closeWindow = () => {
    void getCurrentWindow().close().catch(() => {});
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main style={{ padding: 24, color: "var(--ink)" }}>
        <h1>{t("common.loadFailed")}</h1>
        <p>{t("common.windowLoadFailed")}</p>
        <button type="button" onClick={this.closeWindow}>{t("common.close")}</button>
      </main>
    );
  }
}

function AppRoot() {
  const [activeWindow, setActiveWindow] = React.useState<"chat" | "activity" | "toy" | "room">("chat");
  return (
    <>
      <ChatWindow
        onActivityOpen={() => setActiveWindow("activity")}
        onToyOpen={() => setActiveWindow("toy")}
        onRoomOpen={() => setActiveWindow("room")}
        isCovered={activeWindow !== "chat"}
      />
      {activeWindow === "activity" && <ActivityWindow onClose={() => setActiveWindow("chat")} />}
      {activeWindow === "toy" && <ToyWindow onClose={() => setActiveWindow("chat")} />}
      {activeWindow === "room" && <RoomWindow onClose={() => setActiveWindow("chat")} />}
    </>
  );
}

function RoleRoot() {
  if (windowView === "pet") return <PetWindow />;
  if (windowView === "presence-nag") return <PresenceNagWindow />;
  if (windowView === "diary-detail") return <DiaryDetailWindow />;
  if (windowView === "design-satellite") return <DesignSatelliteWindow />;
  return (
    <OnboardingGate>
      <AppRoot />
    </OnboardingGate>
  );
}

initI18n();
if (!isSatelliteWindow) {
  await initUIPrefs();
  initTheme().catch(error => console.warn("[theme] 初始化失败:", error));
  import("./shared/voice/crossWindowPlayback")
    .then(module => module.initCrossWindowAudioPlayback())
    .catch(error => console.warn("[voice] 初始化失败:", error));
}
if (isMainWindow) {
  import("./shared/avatars/store")
    .then(module => module.avatarStore.init())
    .catch(error => console.warn("[avatar] 初始化失败:", error));
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RoleLoadBoundary>
      <Suspense fallback={<LoadingView />}>
        <RoleRoot />
      </Suspense>
    </RoleLoadBoundary>
  </React.StrictMode>,
);
