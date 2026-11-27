import { deferredComponent } from './shared/ui/deferredComponent';
import React, { Component, lazy, Suspense, type ErrorInfo, type ReactNode } from "react";
import ReactDOM from "react-dom/client";
import { MainWindowFrame } from "./shared/window/MainWindowFrame";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./shared/theme/globals.css";
import { initUIPrefs } from "./shared/uiPreferences";
import { initI18n, t } from "./shared/i18n";
import { LoadingSurface } from "./shared/window/LoadingSurface";

const windowView = new URLSearchParams(window.location.search).get("window");
const isSatelliteWindow = windowView === "design-satellite";
const isMainWindow = !isSatelliteWindow && windowView !== "pet" && windowView !== "presence-nag" && windowView !== "diary-detail" && windowView !== "video-call-invite";

const { Component: AppRoot, preload: loadApplication } = deferredComponent(() => import("./windows/chat/AppRoot").then(module => ({ default: module.AppRoot })));
const PetWindow = lazy(() => import("./windows/pet/PetWindow").then(module => ({ default: module.PetWindow })));
const PresenceNagWindow = lazy(() => import("./windows/presence-nag/PresenceNagWindow").then(module => ({ default: module.PresenceNagWindow })));
const DiaryDetailWindow = lazy(() => import("./windows/diary-detail/DiaryDetailWindow").then(module => ({ default: module.DiaryDetailWindow })));
const DesignSatelliteWindow = lazy(() => import("./windows/design-satellite/DesignSatelliteWindow").then(module => ({ default: module.DesignSatelliteWindow })));
const IncomingCallWindow = lazy(() => import("./windows/room/IncomingCallWindow").then(module => ({ default: module.IncomingCallWindow })));
const { Component: OnboardingGate, preload: loadOnboarding } = deferredComponent(() => import("./features/onboarding/OnboardingGate").then(module => {
  module.prepareOnboarding();
  return { default: module.OnboardingGate };
}));

function LoadingView() {
  return <LoadingSurface />;
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

function RoleRoot() {
  if (windowView === "pet") return <PetWindow />;
  if (windowView === "presence-nag") return <PresenceNagWindow />;
  if (windowView === "diary-detail") return <DiaryDetailWindow />;
  if (windowView === "design-satellite") return <DesignSatelliteWindow />;
  if (windowView === "video-call-invite") return <IncomingCallWindow />;
  return (
    <OnboardingGate>
      <AppRoot />
    </OnboardingGate>
  );
}

initI18n();
// Render the window frame before disk IPC. Code can preload in parallel, but
// preference-dependent components mount only after the authoritative file loads.
const preferencesReady = isSatelliteWindow ? Promise.resolve() : initUIPrefs();
// Load code in parallel with disk IPC; mount only after authoritative preferences.
const roleReady = isMainWindow
  ? Promise.all([preferencesReady, loadApplication(), loadOnboarding()])
  : preferencesReady;
void preferencesReady.then(() => {
  if (!isSatelliteWindow) {
    import("./shared/theme/registry").then(module => module.initTheme())
      .catch(error => console.warn("[theme] 初始化失败:", error));
    import("./shared/voice/crossWindowPlayback")
      .then(module => module.initCrossWindowAudioPlayback())
      .catch(error => console.warn("[voice] 初始化失败:", error));
  }
  if (isMainWindow) {
    import("./shared/avatars/store")
      .then(module => module.avatarStore.init())
      .catch(error => console.warn("[avatar] 初始化失败:", error));
  }
});

function Bootstrap() {
  const [ready, setReady] = React.useState(isSatelliteWindow);
  React.useEffect(() => {
    let disposed = false;
    const finish = () => { if (!disposed) setReady(true); };
    // Resolve code before mounting, so startup cannot waterfall through nested
    // Suspense fallbacks. Failed imports still reach RoleLoadBoundary on render.
    void roleReady.then(finish, finish);
    // Optional remote fonts must never hold up the first frame.
    const frame = requestAnimationFrame(() => {
      document.querySelector<HTMLLinkElement>('#optional-fonts')?.setAttribute('media', 'all');
    });
    return () => { disposed = true; cancelAnimationFrame(frame); };
  }, []);
  return ready ? roleContent : <LoadingView />;
}

const roleContent = (
  <RoleLoadBoundary>
    <Suspense fallback={<LoadingView />}>
      <RoleRoot />
    </Suspense>
  </RoleLoadBoundary>
);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isMainWindow ? <MainWindowFrame><Bootstrap /></MainWindowFrame> : <Bootstrap />}
  </React.StrictMode>,
);
