// Vercel serves Socket.IO WebSocket upgrades from this function route.
// The shared game server exports its HTTP server instead of listening on a port
// when the VERCEL runtime is active.
import server from '../server/index.js';

export default server;
