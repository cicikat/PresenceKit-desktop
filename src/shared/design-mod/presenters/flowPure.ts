import type { EngineState } from '../../state/store';
import type { FlowTimelineEntry } from './types';

export const FLOW_TIMELINE_WINDOW_MS = 8 * 3_600_000;

export function buildFlowNarrative(
  activity: { id: string | null; text: string } | null,
  focus: string,
  presence: string,
): string {
  if (presence === 'away') return '他不在。';
  if (activity?.id === 'watching_you') return '他坐在那儿，看着你。';
  const rawText = activity ? activity.text.replace(/{book}/g, '读着书') : null;
  const activityPhrase = rawText ? `他${rawText}` : '他坐在那儿';
  const focusPhrase = ({
    '看你': '，眼睛却落在你身上。',
    '看你打字': '，注意到你在打字。',
    '偷看': '，偶尔偷看你这边。',
    '注意到了什么': '，忽然抬头朝这边看。',
    '看屏幕': '，眼神有点放空。',
    '想事情': '，看起来在想事情。',
    '发呆': '，眼神空空的。',
  } as Record<string, string>)[focus] ?? '';
  const main = focusPhrase ? `${activityPhrase}${focusPhrase}` : `${activityPhrase}。`;
  return presence === 'idle' ? `${main}（他安静了一会儿。）` : main;
}

export function flowTimelineEntry(state: Pick<EngineState, 'activity' | 'focus' | 'mood'>, timestamp: number): FlowTimelineEntry {
  return { id: String(timestamp), text: state.activity ? state.activity.text.replace(/{book}/g, '读着书') : state.focus, mood: state.mood, timestamp };
}

export function pruneFlowTimeline(timeline: FlowTimelineEntry[], now: number): FlowTimelineEntry[] {
  return timeline.filter(entry => now - entry.timestamp < FLOW_TIMELINE_WINDOW_MS);
}

export function appendFlowTimeline(timeline: FlowTimelineEntry[], state: Pick<EngineState, 'activity' | 'focus' | 'mood'>, timestamp: number): FlowTimelineEntry[] {
  const entry = flowTimelineEntry(state, timestamp);
  if (timeline[0]?.text === entry.text) return pruneFlowTimeline(timeline, timestamp);
  return pruneFlowTimeline([entry, ...timeline], timestamp);
}
