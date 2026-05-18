import type { Mood } from './store';

const BACKEND_TO_MOOD: Record<string, Mood> = {
  neutral:   '平静',
  gentle:    '平静',
  sleepy:    '平静',
  thinking:  '分心',
  happy:     '开心',
  sad:       '低落',
  yandere:   '病娇',
  angry:     '生气',
  surprised: '惊讶',
};

export function backendMoodToFrontend(token: string): Mood {
  return BACKEND_TO_MOOD[token] ?? '平静';
}
