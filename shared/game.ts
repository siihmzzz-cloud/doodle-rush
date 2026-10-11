export type Point = { x: number; y: number };
export type Stroke = { id?: string; points: Point[]; color: string; width: number; erase?: boolean };
export type Player = { id: string; name: string; avatar: number; score: number; ready: boolean; connected: boolean; host: boolean; guessed: boolean };
export type Settings = { capacity: number; seconds: number; rounds: number; category: string; difficulty: string };
export type Phase = 'lobby' | 'active' | 'results' | 'finished';
export type CloseGuess = { id: string; playerId: string; playerName: string; text: string; awarded: boolean };
export type RoomView = { code: string; hostId: string; isPublic: boolean; players: Player[]; settings: Settings; phase: Phase; round: number; drawerId?: string; word?: string; wordLength?: number; endsAt?: number; strokes: Stroke[]; closeGuesses: CloseGuess[]; feed: { id: string; text: string; kind: 'chat'|'correct'|'system' }[] };
export const WORDS: Record<string, string[]> = {
  Animals: ['giraffe','octopus','penguin','hedgehog','dolphin','turtle'],
  Food: ['pancakes','watermelon','taco','popcorn','sushi','cupcake'],
  Objects: ['umbrella','toothbrush','telescope','backpack','hourglass','headphones'],
  Nature: ['rainbow','volcano','waterfall','cactus','lightning','sunflower'],
};
export function normalizeGuess(s: string) { return s.trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, ''); }
export function pointsForGuess(secondsLeft: number, duration: number) { return Math.max(20, Math.round(100 + 300 * Math.max(0, secondsLeft) / duration)); }
export function drawerPoints(correctGuesses: number) { return Math.min(correctGuesses, 7) * 50; }
export function pickWord(category: string, random = Math.random) {
  const words = category === 'Random' ? Object.values(WORDS).flat() : (WORDS[category] ?? Object.values(WORDS).flat());
  return words[Math.floor(random() * words.length)];
}
