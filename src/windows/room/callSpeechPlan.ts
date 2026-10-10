import type { NarrativeSegment, PerformSpec } from '../../shared/api/types';
import { normalizeChatDisplayText } from '../chat/chatDisplay';
export interface SpeechLine { id: string; msgId: string; text: string; perform?: PerformSpec; started: boolean }
const text = (s: string) => normalizeChatDisplayText(s).trim();
/** Metadata never creates speech. Only canonical IDs become a pending turn. */
export class CallSpeechPlan {
  private metadata = new Map<string, { segments: NarrativeSegment[]; at: number }>();
  private pending: { msgId: string; content: string; readyAt: number }[] = [];
  lines: SpeechLine[] = [];
  drops = 0;
  canonical(msgId: string, content: string, now: number): boolean {
    if (this.pending.length + this.lines.length >= 128) { this.drops++; return false; }
    this.pending.push({msgId,content,readyAt:now+150}); return true;
  }
  segments(msgId: string, segments: NarrativeSegment[], now: number): void {
    for (const [id,m] of this.metadata) if (now-m.at > 30000) this.metadata.delete(id);
    if (segments.length > 128 || !segments.every(s => typeof s.text === 'string' && s.text.length <= 12000)) { this.drops++; return; }
    if (!this.metadata.has(msgId) && this.metadata.size >= 64) this.metadata.delete(this.metadata.keys().next().value!);
    this.metadata.set(msgId,{segments,at:now});
    const say = segments.filter(s=>s.type==='say');
    // Late cues supplement only a unique exact text match, never reshape a spoken plan.
    this.lines = this.lines.map(line => {
      if (line.msgId !== msgId) return line;
      const matches = say.filter(s=>text(s.text) === line.text);
      return matches.length === 1 ? {...line,perform:matches[0].perform} : line;
    });
  }
  flush(now: number): void {
    const remaining: typeof this.pending = [];
    let blocked = false;
    for (const p of this.pending) {
      const m = this.metadata.get(p.msgId);
      if (blocked || (!m && now<p.readyAt)) { blocked = true; remaining.push(p); continue; }
      const say = m?.segments.filter(s=>s.type==='say' && text(s.text)) ?? [];
      const parts = say.length ? say.map(s=>({text:text(s.text),perform:s.perform})) : [{text:text(p.content),perform:undefined}];
      if (this.lines.length+parts.length > 128) { this.drops++; continue; }
      this.lines.push(...parts.filter(s=>s.text).map((s,i)=>({id:`${p.msgId}:${i}`,msgId:p.msgId,...s,started:false})));
    }
    this.pending=remaining;
  }
  start(id: string): PerformSpec | undefined { const line=this.lines[0]; if (line?.id !== id) return; line.started=true; return line.perform; }
  finish(id: string): void { if (this.lines[0]?.id !== id) return; const msgId=this.lines[0].msgId; this.lines.shift(); if (!this.lines.some(l=>l.msgId===msgId)) this.metadata.delete(msgId); }
  reset(): void { this.metadata.clear(); this.pending=[];this.lines=[]; }
}
