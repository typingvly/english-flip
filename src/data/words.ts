export const WORDS: string[] = [
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'I',
  'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
  'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
  'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what',
  'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me',
  'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know', 'take',
  'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other',
  'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also',
  'back', 'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well', 'way',
  'even', 'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us',
  'is', 'are', 'was', 'were', 'been', 'has', 'had', 'did', 'said', 'each',
  'many', 'more', 'very', 'where', 'much', 'through', 'long', 'little', 'still', 'own',
  'same', 'another', 'while', 'last', 'never', 'here', 'why', 'off', 'down', 'under',
  'again', 'around', 'every', 'few', 'right', 'too', 'old', 'great', 'small', 'big',
  'high', 'different', 'place', 'world', 'school', 'state', 'home', 'house', 'water', 'food',
  'hand', 'part', 'child', 'eye', 'thing', 'man', 'woman', 'life', 'head', 'name',
  'friend', 'family', 'country', 'problem', 'fact', 'case', 'week', 'month', 'night', 'morning',
  'money', 'room', 'book', 'word', 'story', 'idea', 'group', 'number', 'point', 'end',
  'start', 'help', 'feel', 'try', 'leave', 'call', 'keep', 'put', 'let', 'begin',
  'seem', 'show', 'hear', 'play', 'run', 'move', 'live', 'believe', 'bring', 'happen',
];

export const RANKS: ReadonlyArray<readonly [string, number]> = [
  ['L을가져가', 200],
  ['L+', 187],
  ['L', 175],
  ['X+', 163],
  ['X', 150],
  ['X-', 138],
  ['SS+', 127],
  ['SS', 116],
  ['SS-', 105],
  ['S+', 97],
  ['S', 90],
  ['S-', 84],
  ['A+', 78],
  ['A', 72],
  ['B+', 66],
  ['B', 60],
  ['C+', 54],
  ['C', 48],
  ['D+', 42],
  ['D', 36],
  ['E+', 30],
  ['E', 0],
];

export const DIFFICULTY_OPTIONS: ReadonlyArray<{
  speed: 200 | 400 | 600 | 800;
  label: string;
  tier: string;
}> = [
  { speed: 200, label: '200타', tier: '초급' },
  { speed: 400, label: '400타', tier: '보통' },
  { speed: 600, label: '600타', tier: '빠름' },
  { speed: 800, label: '800타', tier: '최고속' },
];

export function getRank(flips: number): string {
  const found = RANKS.find(([, cutoff]) => flips >= cutoff);
  return found ? found[0] : 'A';
}

export function shuffleWords(list: string[]): string[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
