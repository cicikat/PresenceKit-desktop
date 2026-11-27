import React, { lazy, Suspense } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { wsClient } from "../../shared/api/ws";
import { getActiveCharacterInfo } from "../../shared/activeCharacter";
import { showIncomingVideoCall } from "../room/incomingCall";
import { hangupVideoCallInvite } from "../../shared/api/backend";
import { ChatWindow } from "./ChatWindow";
import { LoadingSurface } from "../../shared/window/LoadingSurface";

const ToyWindow = lazy(() => import("../toy").then(module => ({ default: module.ToyWindow })));
const RoomWindow = lazy(() => import("../room").then(module => ({ default: module.RoomWindow })));

export function AppRoot() {
  const [activeWindow, setActiveWindow] = React.useState<"chat" | "toy" | "room">("chat");
  const [acceptedInviteId, setAcceptedInviteId] = React.useState<string | null>(null);
  const closeRoom = () => {
    const inviteId = acceptedInviteId;
    setAcceptedInviteId(null);
    setActiveWindow('chat');
    if (inviteId) void hangupVideoCallInvite(inviteId).catch(error => console.warn('[video-call] hangup report failed', error));
  };
  React.useEffect(() => {
    const stopInvite = wsClient.on('video_call_invite', call => {
      if (call.char_id !== getActiveCharacterInfo().id) return;
      void showIncomingVideoCall(call);
    });
    let stopAccepted: (() => void) | undefined;
    void listen<{ invite_id: string; char_id: string }>('video-call-invite-accepted', event => {
      if (event.payload.char_id !== getActiveCharacterInfo().id) return;
      setAcceptedInviteId(event.payload.invite_id);
      setActiveWindow('room');
      void getCurrentWindow().setFocus();
    }).then(stop => { stopAccepted = stop; });
    return () => { stopInvite(); stopAccepted?.(); };
  }, []);
  return (
    <>
      <ChatWindow
        onToyOpen={() => setActiveWindow("toy")}
        onRoomOpen={() => { setAcceptedInviteId(null); setActiveWindow("room"); }}
        isCovered={activeWindow !== "chat"}
      />
      {/* Keep first-load suspension inside the overlay. The auth gate and main
          window must stay mounted while a new role's chunk is loading. */}
      <Suspense fallback={<div style={{ position: 'fixed', inset: 0, zIndex: 110, background: 'var(--paper)' }}><LoadingSurface /></div>}>

        {activeWindow === "toy" && <ToyWindow onClose={() => setActiveWindow("chat")} />}
        {activeWindow === "room" && <RoomWindow key={acceptedInviteId ?? 'manual'} onClose={closeRoom} />}
      </Suspense>
    </>
  );
}

