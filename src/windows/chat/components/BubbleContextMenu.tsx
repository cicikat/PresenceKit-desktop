import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function deletableBubbleTurn(message: {turnId?: string; isStreaming?: boolean; streamingDone?: boolean; replyIdentity?: {turn_id?: string}}): string | undefined {
  const turnId=message.turnId ?? message.replyIdentity?.turn_id;
  return turnId && (!message.isStreaming || message.streamingDone) ? turnId : undefined;
}

export function BubbleContextMenu({x,y,children}:{x:number;y:number;children:ReactNode}) {
  const root=useRef<HTMLDivElement>(null);
  const [position,setPosition]=useState({left:x,top:y});
  useLayoutEffect(()=>{
    const place=()=>{
      const rect=root.current?.getBoundingClientRect();
      if(!rect)return;
      setPosition({left:Math.max(8,Math.min(x,window.innerWidth-rect.width-8)),top:Math.max(8,Math.min(y,window.innerHeight-rect.height-8))});
    };
    place();window.addEventListener('resize',place);
    return ()=>window.removeEventListener('resize',place);
  },[x,y,children]);
  return createPortal(<div ref={root} role="menu" onMouseDown={event=>event.stopPropagation()} style={{position:'fixed',...position,zIndex:1000,background:'var(--paper)',color:'var(--ink)',border:'1px solid var(--paper-edge)',borderRadius:'var(--radius-md)',padding:6,minWidth:120,boxShadow:'0 12px 32px #0003'}}>{children}</div>,document.body);
}
