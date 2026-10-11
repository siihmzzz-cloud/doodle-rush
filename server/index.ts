import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { randomBytes, randomUUID } from 'node:crypto';
import { drawerPoints, normalizeGuess, pickWord, pointsForGuess, type CloseGuess, type Player, type RoomView, type Settings, type Stroke } from '../shared/game.js';

type Member = Player & { socketId: string };
type Room = Omit<RoomView, 'players'> & { members: Map<string, Member>; timer?: NodeJS.Timeout; duration: number; secret?: string; drawerCount: number; scoresAtRoundStart: Record<string, number> };
const rooms = new Map<string, Room>();
const actionWindows = new Map<string, { started: number; count: number }>();
const app = express();
const http = createServer(app);
const io = new Server(http, { cors: { origin: true } });
const port = Number(process.env.PORT || 3001);

function safeRoom(room: Room, viewerId?: string): RoomView {
  const { members, timer, secret, duration, drawerCount, scoresAtRoundStart, ...view } = room;
  const players = [...members.values()].map(({ socketId, ...p }) => ({ ...p, host: p.id === room.hostId }));
  return { ...view, players, closeGuesses: viewerId === room.hostId && ['results', 'finished'].includes(room.phase) ? room.closeGuesses : [], word: viewerId === room.drawerId && room.phase === 'active' ? secret : ['results', 'finished'].includes(room.phase) ? secret : undefined, wordLength: room.phase === 'active' ? secret?.length : undefined };
}
function publish(room: Room) { for (const m of room.members.values()) io.to(m.socketId).emit('room:update', safeRoom(room, m.id)); }
function publicRooms() { return [...rooms.values()].filter(r => r.isPublic && r.phase === 'lobby' && r.members.size < r.settings.capacity).map(r => ({ code: r.code, host: r.members.get(r.hostId)?.name ?? 'Host', players: r.members.size, capacity: r.settings.capacity, rounds: r.settings.rounds, seconds: r.settings.seconds })); }
function publishPublicRooms() { io.emit('rooms:update', publicRooms()); }
function system(room: Room, text: string, kind: 'system'|'correct'|'chat' = 'system') {
  room.feed = [...room.feed.slice(-23), { id: randomUUID(), text, kind }];
}
function code() { let result = ''; do { result = randomBytes(3).toString('hex').slice(0, 5).toUpperCase(); } while (rooms.has(result)); return result; }
function stopTimer(room: Room) { if (room.timer) clearTimeout(room.timer); room.timer = undefined; }
function owns(room: Room | undefined, socketId: string, playerId: string): room is Room { return !!room && room.members.get(playerId)?.socketId === socketId; }
function withinRate(key: string, limit: number, windowMs: number) {
  const now = Date.now(); const current = actionWindows.get(key);
  if (!current || now - current.started >= windowMs) { actionWindows.set(key, { started: now, count: 1 }); return true; }
  if (current.count >= limit) return false;
  current.count += 1; return true;
}
function roundEnd(room: Room) {
  stopTimer(room); room.phase = room.round >= room.settings.rounds ? 'finished' : 'results';
  room.word = room.secret; system(room, `The word was ${room.secret}.`); publish(room);
}
function startRound(room: Room) {
  stopTimer(room); room.phase = 'active'; room.round += 1; room.strokes = []; room.closeGuesses = []; room.drawerCount = 0;
  room.members.forEach((m) => { m.guessed = false; });
  const activePlayers = [...room.members.values()].filter((m) => m.connected);
  const drawer = activePlayers[(room.round - 1) % activePlayers.length];
  room.drawerId = drawer.id; room.secret = pickWord(room.settings.category); room.duration = room.settings.seconds;
  room.endsAt = Date.now() + room.duration * 1000; room.scoresAtRoundStart = Object.fromEntries(activePlayers.map((p) => [p.id, p.score]));
  system(room, `Round ${room.round} — ${drawer.name} is drawing.`); publish(room);
  room.timer = setTimeout(() => roundEnd(room), room.duration * 1000);
}
function leave(socketId: string) {
  for (const room of rooms.values()) {
    const member = [...room.members.values()].find((m) => m.socketId === socketId);
    if (!member) continue;
    room.members.delete(member.id);
    if (!room.members.size) { stopTimer(room); rooms.delete(room.code); publishPublicRooms(); return; }
    if (room.hostId === member.id) { room.hostId = [...room.members.keys()][0]; system(room, `${room.members.get(room.hostId)?.name} is the new host.`); }
    if (room.phase === 'active' && room.drawerId === member.id) roundEnd(room);
    else { system(room, `${member.name} left the room.`); publish(room); }
    publishPublicRooms();
    return;
  }
}
io.on('connection', (socket) => {
  socket.on('rooms:list', (ack) => { if (typeof ack === 'function') ack(publicRooms()); });
  socket.on('room:create', ({ player, settings, isPublic }: { player: { id: string; name: string; avatar: number }; settings?: Partial<Settings>; isPublic?: boolean }, ack) => {
    if (!player?.id || !player.name?.trim()) return ack?.({ error: 'Choose a display name first.' });
    const roomCode = code();
    const room: Room = { code: roomCode, hostId: player.id, isPublic: Boolean(isPublic), members: new Map(), settings: { capacity: 8, seconds: 60, rounds: 5, category: 'Random', difficulty: 'Easy', ...settings }, phase: 'lobby', round: 0, strokes: [], closeGuesses: [], feed: [], duration: 60, drawerCount: 0, scoresAtRoundStart: {} };
    room.members.set(player.id, { ...player, name: player.name.trim().slice(0, 18), score: 0, ready: true, connected: true, host: true, guessed: false, socketId: socket.id });
    rooms.set(roomCode, room); socket.join(roomCode); publish(room); publishPublicRooms(); ack?.({ code: roomCode, room: safeRoom(room, player.id) });
  });
  socket.on('room:join', ({ code: rawCode, player }: { code: string; player: { id: string; name: string; avatar: number } }, ack) => {
    const room = rooms.get(String(rawCode).toUpperCase());
    if (!room) return ack?.({ error: 'Room not found. Check the code and try again.' });
    if (room.phase !== 'lobby') return ack?.({ error: 'This match is already in progress.' });
    if (room.members.size >= room.settings.capacity) return ack?.({ error: 'This room is full.' });
    if (room.members.has(player.id)) return ack?.({ error: 'That guest is already in the room.' });
    if (!player?.id || !player.name?.trim()) return ack?.({ error: 'Choose a display name first.' });
    room.members.set(player.id, { ...player, name: player.name.trim().slice(0, 18), score: 0, ready: true, connected: true, host: false, guessed: false, socketId: socket.id });
    socket.join(room.code); system(room, `${player.name} joined the room.`); publish(room); publishPublicRooms(); ack?.({ code: room.code, room: safeRoom(room, player.id) });
  });
  socket.on('room:settings', ({ code, settings, playerId }) => {
    const r = rooms.get(code); if (!owns(r, socket.id, playerId) || r.hostId !== playerId || r.phase !== 'lobby') return;
    r.settings = { ...r.settings, ...settings, capacity: Math.max(r.members.size, Math.max(2, Math.min(8, Number(settings.capacity) || r.settings.capacity))), seconds: [30,45,60,90,120].includes(Number(settings.seconds)) ? Number(settings.seconds) : r.settings.seconds, rounds: Math.max(1, Math.min(10, Number(settings.rounds) || r.settings.rounds)) };
    publish(r); publishPublicRooms();
  });
  socket.on('room:visibility', ({ code, playerId, isPublic }) => { const r = rooms.get(code); if (!owns(r, socket.id, playerId) || r.hostId !== playerId || r.phase !== 'lobby') return; r.isPublic = Boolean(isPublic); publish(r); publishPublicRooms(); });
  socket.on('game:start', ({ code, playerId }, ack) => {
    const r = rooms.get(code); if (!owns(r, socket.id, playerId) || r.hostId !== playerId) return ack?.({ error: 'Only the host can start the game.' });
    if (r.members.size < 2) return ack?.({ error: 'Invite at least one more player to start.' });
    if (r.phase !== 'lobby') return;
    startRound(r); publishPublicRooms(); ack?.({ ok: true });
  });
  socket.on('game:next', ({ code, playerId }, ack) => {
    const r = rooms.get(code); if (!owns(r, socket.id, playerId) || r.hostId !== playerId || r.phase !== 'results') return;
    startRound(r); ack?.({ ok: true });
  });
  socket.on('game:leave', () => leave(socket.id));
  socket.on('draw:stroke', ({ code, playerId, stroke }: { code: string; playerId: string; stroke: Stroke }) => {
    const r = rooms.get(code); if (!owns(r, socket.id, playerId) || r.phase !== 'active' || r.drawerId !== playerId) return;
    if (!withinRate(`draw:${socket.id}`, 100, 1000) || !stroke || !Array.isArray(stroke.points) || stroke.points.length > 160 || !/^#[0-9a-f]{6}$/i.test(stroke.color) || stroke.width < 1 || stroke.width > 32) return;
    const valid = stroke.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1);
    if (!valid) return;
    const existing = stroke.id ? r.strokes.find((s) => s.id === stroke.id) : undefined;
    if (existing) existing.points.push(...stroke.points);
    else r.strokes = [...r.strokes, { ...stroke, points: [...stroke.points] }].slice(-400);
    socket.to(code).emit('draw:stroke', stroke);
  });
  socket.on('draw:clear', ({ code, playerId }) => { const r = rooms.get(code); if (!owns(r, socket.id, playerId) || r.drawerId !== playerId || r.phase !== 'active') return; r.strokes = []; io.to(code).emit('draw:clear'); });
  socket.on('draw:undo', ({ code, playerId }) => { const r = rooms.get(code); if (!owns(r, socket.id, playerId) || r.drawerId !== playerId || r.phase !== 'active' || !r.strokes.length) return; r.strokes.pop(); io.to(code).emit('draw:undo'); });
  socket.on('guess:submit', ({ code, playerId, guess }: { code: string; playerId: string; guess: string }) => {
    const r = rooms.get(code); const p = r?.members.get(playerId);
    if (!withinRate(`guess:${socket.id}`, 6, 1000) || !owns(r, socket.id, playerId) || !p || r.phase !== 'active' || p.id === r.drawerId || p.guessed || !guess?.trim()) return;
    if (normalizeGuess(guess) === normalizeGuess(r.secret || '')) {
      const secondsLeft = Math.max(0, (r.endsAt! - Date.now()) / 1000);
      const award = pointsForGuess(secondsLeft, r.duration); p.score += award; p.guessed = true;
      r.drawerCount += 1; const drawer = r.members.get(r.drawerId!); if (drawer) drawer.score += drawerPoints(r.drawerCount) - drawerPoints(r.drawerCount - 1);
      system(r, `${p.name} guessed it! +${award} points`, 'correct');
      const eligible = [...r.members.values()].filter((m) => m.id !== r.drawerId && m.connected);
      publish(r); if (eligible.every((m) => m.guessed)) roundEnd(r);
    } else {
      const text = guess.trim().slice(0, 40);
      r.closeGuesses.push({ id: randomUUID(), playerId: p.id, playerName: p.name, text, awarded: false });
      system(r, `${p.name}: ${text}`, 'chat'); publish(r);
    }
  });
  socket.on('host:award-close-guess', ({ code, playerId, guessId }, ack) => {
    const r = rooms.get(code); if (!owns(r, socket.id, playerId) || r.hostId !== playerId || !['results', 'finished'].includes(r.phase)) return ack?.({ error: 'Only the host can award a point after the round.' });
    const closeGuess = r.closeGuesses.find(g => g.id === guessId);
    const player = closeGuess && r.members.get(closeGuess.playerId);
    if (!closeGuess || closeGuess.awarded || !player) return ack?.({ error: 'That guess has already been reviewed.' });
    if (r.closeGuesses.some(g => g.playerId === player.id && g.awarded)) return ack?.({ error: 'A bonus was already awarded to this player for this round.' });
    r.closeGuesses.forEach(g => { if (g.playerId === player.id) g.awarded = true; }); player.score += 50;
    system(r, `${player.name} got a host bonus for “${closeGuess.text}”! +50 points`, 'correct');
    publish(r); ack?.({ ok: true });
  });
  socket.on('disconnect', () => { leave(socket.id); actionWindows.delete(`draw:${socket.id}`); actionWindows.delete(`guess:${socket.id}`); });
});
app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.size }));
http.listen(port, '0.0.0.0', () => console.log(`DoodleRush server listening on http://localhost:${port}`));
