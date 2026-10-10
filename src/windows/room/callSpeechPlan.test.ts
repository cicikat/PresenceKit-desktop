import { describe,it,expect } from 'vitest';
import { CallSpeechPlan } from './callSpeechPlan';
const segs = [{type:'say' as const,text:'first',perform:{expression:'sad'}},{type:'say' as const,text:'second',perform:{expression:'angry'}}];
describe('call speech timeline',()=>{
 it('segments before canonical never speak; canonical creates one ordered plan',()=>{ const p=new CallSpeechPlan();p.segments('a',segs,0);p.flush(1);expect(p.lines).toHaveLength(0);p.canonical('a','first\nsecond',2);p.flush(2);expect(p.lines.map(l=>l.perform?.expression)).toEqual(['sad','angry']);expect(p.start('a:0')?.expression).toBe('sad');p.finish('wrong');expect(p.lines).toHaveLength(2);p.finish('a:0');expect(p.start('a:1')?.expression).toBe('angry'); });
 it('canonical first waits only a bounded metadata window',()=>{const p=new CallSpeechPlan();p.canonical('a','first',0);p.flush(149);expect(p.lines).toHaveLength(0);p.flush(150);expect(p.lines[0].text).toBe('first');p.segments('a',segs,200);expect(p.lines).toHaveLength(1);expect(p.lines[0].perform?.expression).toBe('sad');});
 it('late ambiguous or different text never misattributes a sentence',()=>{const p=new CallSpeechPlan();p.canonical('a','whole message',0);p.flush(200);p.segments('a',segs,201);expect(p.lines[0].perform).toBeUndefined();p.finish('a:0');p.segments('a',segs,300);expect(p.lines).toHaveLength(0);});
 it('metadata for a later canonical cannot jump the queue',()=>{const p=new CallSpeechPlan();p.canonical('a','first',0);p.canonical('b','second',1);p.segments('b',[segs[1]],2);p.flush(2);expect(p.lines).toHaveLength(0);p.flush(151);expect(p.lines.map(l=>l.msgId)).toEqual(['a','b']);});
 it('reset clears queued and pending speech and blocks stale finish',()=>{const p=new CallSpeechPlan();p.canonical('a','first',0);p.flush(200);p.reset();p.finish('a:0');expect(p.lines).toHaveLength(0);});
 it('bounded queues refuse excess rather than growing indefinitely',()=>{const p=new CallSpeechPlan();for(let i=0;i<128;i++) expect(p.canonical(String(i),'x',0)).toBe(true);expect(p.canonical('overflow','x',1)).toBe(false);});
});
