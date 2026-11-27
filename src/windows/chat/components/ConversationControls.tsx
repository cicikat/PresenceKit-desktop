import { useCallback, useEffect, useRef, useState } from 'react';
import { conversationRequest, getConversationState, operationId, selectExecutionToStop, type ConversationState, type DeletedTurn, type DeletedDetail } from '../../../shared/api/conversation';
import { wsClient } from '../../../shared/api/ws';
import { getActiveCharacterInfo } from '../../../shared/activeCharacter';
import { useI18n } from '../../../shared/i18n';

const button = {border: '1px solid var(--paper-edge)', borderRadius: 8, background: 'var(--paper)', color: 'var(--ink)', padding: '6px 12px', cursor: 'pointer', font: 'inherit'};
const overlay = {position: 'fixed' as const, inset: 0, zIndex: 100, background: '#0006', display: 'grid', placeItems: 'center', padding: 24};
export function ConversationControls({pendingRequests, deleteTurn, clearDelete, onSnapshot, onRefresh, onStopped}: {
  pendingRequests: string[]; deleteTurn?: string; clearDelete: () => void;
  onSnapshot: (state: ConversationState) => void; onRefresh: () => void; onStopped: (requestId: string) => void;
}) {
  const {t} = useI18n();
  const [state, setState] = useState<ConversationState>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [rows, setRows] = useState<DeletedTurn[]>([]);
  const [nextBefore,setNextBefore] = useState<number | null>(null);
  const [detail, setDetail] = useState<DeletedDetail>();
  const modalRoot=useRef<HTMLElement | null>(null);
  const busyRef=useRef(busy);busyRef.current=busy;
  const closeDeleteRef=useRef(clearDelete);closeDeleteRef.current=clearDelete;
  const modalOpen=Boolean(recovery || deleteTurn);
  useEffect(()=>{
    if(!modalOpen)return;
    const previous=document.activeElement as HTMLElement | null;
    const root=modalRoot.current;
    root?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const keydown=(event:KeyboardEvent)=>{
      if(event.key==='Escape' && !busyRef.current){event.preventDefault();closeDeleteRef.current();setRecovery(false);setDetail(undefined);setError(false);return;}
      if(event.key!=='Tab'||!root)return;
      const buttons=[...root.querySelectorAll<HTMLElement>('button:not(:disabled),[tabindex="0"]')];
      const first=buttons[0],last=buttons[buttons.length-1];
      if(!first){event.preventDefault();return;}
      if(event.shiftKey && (document.activeElement===first || !root.contains(document.activeElement))){event.preventDefault();last.focus();}
      else if(!event.shiftKey && (document.activeElement===last || !root.contains(document.activeElement))){event.preventDefault();first.focus();}
    };
    document.addEventListener('keydown',keydown);
    return ()=>{document.removeEventListener('keydown',keydown);if(previous?.isConnected)previous.focus();};
  },[modalOpen,deleteTurn]);
  const callbacks = useRef({onSnapshot,onRefresh,onStopped}); callbacks.current={onSnapshot,onRefresh,onStopped};
  const revision = useRef<number | undefined>(undefined);
  const mounted = useRef(true);
  const operations = useRef(new Map<string,string>());
  const syncBusy = useRef(false);
  const syncWait = useRef<Promise<void> | undefined>(undefined);
  const sync = useCallback((): Promise<void> => {
    if (syncBusy.current) return syncWait.current ?? Promise.resolve();
    syncBusy.current=true;
    const work=(async()=>{ try {
      const next=await getConversationState();
      if (!mounted.current) return;
      setState(next); callbacks.current.onSnapshot(next);
      if (revision.current !== undefined && next.revision !== revision.current) callbacks.current.onRefresh();
      revision.current=next.revision;
    } catch { /* No automatic mutations on disconnect. */ }
    finally { syncBusy.current=false; } })();
    syncWait.current=work;return work;
  },[]);
  useEffect(() => {
    mounted.current=true; void sync();
    const timer=window.setInterval(() => void sync(),2000);
    const off=wsClient.on('conversation_changed', message => {
      if (message.char_id===getActiveCharacterInfo().id && message.domain==='reality') void sync();
    });
    const wake=() => void sync(); window.addEventListener('focus',wake);
    return () => {mounted.current=false;clearInterval(timer);off();window.removeEventListener('focus',wake);};
  },[sync]);
  const op=(key:string) => {const id=operations.current.get(key) ?? operationId();operations.current.set(key,id);return id;};
  const run=async (work:()=>Promise<void>) => {
    if (busy) return; setBusy(true);setError(false);
    try { await work(); await syncWait.current; await sync(); callbacks.current.onRefresh(); }
    catch { if (mounted.current) setError(true); }
    finally { if (mounted.current) setBusy(false); }
  };
  const load=async (more=false) => {const data=await conversationRequest<{deletions:DeletedTurn[];next_before:number|null}>('list','',more?{before:nextBefore}:{});setRows(previous=>more?[...previous,...data.deletions.filter(item=>!previous.some(old=>old.deletion_id===item.deletion_id))]:data.deletions);setNextBefore(data.next_before);};
  const active=state?.executions.filter(item => item.state!=='committing') ?? [];
  const stop=() => run(async () => {
    const target=selectExecutionToStop(state?.executions ?? []);
    if(target) {
      const stopped=await conversationRequest<{state:string}>('stop',target.execution_id);
      if(stopped.state==='stopped')callbacks.current.onStopped(target.request_id);
      return;
    }
    const known=new Set(state?.executions.map(item=>item.request_id));
    const request=pendingRequests.find(id=>!known.has(id));
    if(request) {
      const stopped=await conversationRequest<{state:string}>('stop_request',request);
      if(stopped.state==='stopped')callbacks.current.onStopped(request);
    }
  });
  const dismiss=() => {setRecovery(false);setDetail(undefined);setError(false);};
  return <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:8,fontSize:12}}>
    {(active.length>0 || pendingRequests.length>0) && <button style={button} disabled={busy} onClick={()=>void stop()}>{t('chat.control.stop')}</button>}
    <button style={{...button,marginLeft:'auto'}} onClick={()=>{setRecovery(true);setError(false);void load().catch(()=>setError(true));}}>{t('chat.control.archive')}</button>
    {error && !recovery && !deleteTurn && <span role="alert">{t('chat.control.failed')}</span>}
    {deleteTurn && <div style={overlay}><section ref={modalRoot} role="alertdialog" aria-modal="true" aria-label={t('chat.control.delete')} style={{background:'var(--paper)',color:'var(--ink)',padding:24,borderRadius:16,width:'min(440px,100%)',boxSizing:'border-box'}}>
      <h3>{t('chat.control.delete')}</h3><p>{t('chat.control.deleteHint')}</p>
      {error && <p role="alert">{t('chat.control.failed')}</p>}
      <div style={{display:'flex',justifyContent:'end',gap:8}}>
        <button style={button} disabled={busy} onClick={clearDelete}>{t('chat.control.cancel')}</button>
        <button style={button} disabled={busy} onClick={()=>void run(async()=>{
          const result=await conversationRequest<{state:string}>('delete',deleteTurn,{operation_id:op('delete:'+deleteTurn)});
          if (result.state!=='completed') throw new Error('repair_pending');
          operations.current.delete('delete:'+deleteTurn);
          clearDelete();
        })}>{t('chat.control.delete')}</button>
      </div>
    </section></div>}
    {recovery && <div style={overlay}><section ref={modalRoot} role="dialog" aria-modal="true" aria-label={t('chat.control.archive')} style={{background:'var(--paper)',color:'var(--ink)',borderRadius:16,padding:24,width:'min(680px,100%)',boxSizing:'border-box',maxHeight:'80vh',overflow:'auto'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}><h3>{t('chat.control.archive')}</h3><button style={button} onClick={dismiss}>{t('chat.control.close')}</button></div>
      <p>{t('chat.control.archiveHint')}</p>
      {error && <p role="alert">{t('chat.control.failed')}</p>}
      {!rows.length && <p>{t('chat.control.empty')}</p>}
      {rows.map(row=><div key={row.deletion_id} style={{display:'flex',gap:8,alignItems:'center',padding:'10px 0',borderBottom:'1px solid var(--paper-edge)'}}>
        <span style={{flex:1}}>{new Date(row.created_at*1000).toLocaleString()}</span>
        <button style={button} disabled={busy} onClick={()=>void run(async()=>setDetail(await conversationRequest<DeletedDetail>('detail',row.deletion_id)))}>{t('chat.control.view')}</button>
        {row.state==='restored' ? <span>{t('chat.control.restored')}</span> : <button style={button} disabled={busy} onClick={()=>void run(async()=>{
          if (['repair_pending','applying','prepared'].includes(row.state)) await conversationRequest('repair',row.deletion_id);
          else await conversationRequest('restore',row.deletion_id,{operation_id:op('restore:'+row.deletion_id),expected_revision:row.revision});
          await load();setDetail(undefined);
        })}>{t(['repair_pending','applying','prepared'].includes(row.state)?'chat.control.repair':'chat.control.restore')}</button>}
      </div>)}
      {nextBefore!==null && <button style={button} disabled={busy} onClick={()=>void run(()=>load(true))}>{t('chat.control.more')}</button>}
      {detail && <div style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',marginTop:16,padding:16,background:'var(--paper-2)',borderRadius:8}}>
        {(detail.history.length ? detail.history.map(item=>typeof item.entry.content==='string'?item.entry.content:JSON.stringify(item.entry.content)) : detail.stopped.length ? detail.stopped.flatMap(item=>[item.user_text,item.assistant_text]) : detail.events.map(item=>item.visible_text)).map((text,i)=><p key={i}>{text}</p>)}
      </div>}
    </section></div>}
  </div>;
}
