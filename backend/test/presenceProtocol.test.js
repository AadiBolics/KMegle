// Real socket.io transport + production room/match/presence handlers.
// Fake identity/DB only; never connects to Firebase or production services.
process.env.AWAY_GRACE_MS = '1000';
const assert = require('node:assert/strict');
const { Server } = require('socket.io');
// Reuse the repository frontend's installed Socket.IO client for protocol tests.
const { io: connect } = require('../../frontend/node_modules/socket.io-client');
const rooms = require('../src/services/roomService');
const presence = require('../src/services/presenceService');
const registerRoom = require('../src/sockets/roomSocket');
const registerMatch = require('../src/sockets/matchSocket');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const io = new Server(0);
  const queue = { nodesMap: new Map(), add() {}, remove() {} };
  io.use((socket, next) => { socket.user = { uid: socket.handshake.auth.testUid }; next(); });
  io.on('connection', socket => {
    registerRoom(socket, queue, rooms, {}, io);
    registerMatch(socket, queue, { isUserBanned: async () => false, getCooldownRemaining: async () => 0 }, rooms, io);
    if (!presence.resume({ io, roomService: rooms, socket })) socket.emit('session_resume_result', { resumed: false });
  });
  const clients = [];
  async function open(uid, sessionId) {
    const c = connect('http://localhost:' + io.httpServer.address().port, { auth: { testUid: uid, sessionId }, reconnection: false });
    clients.push(c);
    c.verdict = await new Promise((resolve, reject) => { c.once('session_resume_result', resolve); c.once('connect_error', reject); });
    return c;
  }
  const a = await open('alice', 'page-session-00000001'), b = await open('bob', 'page-session-00000002');
  const old = a.id;
  rooms.createRoom('protocol', { userId: 'alice', socket: a }, { userId: 'bob', socket: b });
  io.sockets.sockets.get(a.id).join('protocol'); io.sockets.sockets.get(b.id).join('protocol');
  let lost = 0, restored = 0;
  b.on('stranger_disconnected', () => lost++); b.on('partner_reconnected', () => restored++);
  a.disconnect(); await sleep(50);
  const other = await open('alice', 'page-session-00000003');
  assert.equal(other.verdict.resumed, false);
  other.emit('find_match'); await sleep(50);
  assert.equal(rooms.getRoom('protocol').u1.socketId, old);
  assert.equal(lost, 0);
  const owner = await open('alice', 'page-session-00000001');
  assert.equal(owner.verdict.resumed, true);
  assert.equal(rooms.getRoom('protocol').u1.socketId, owner.id);
  await sleep(1100); assert.equal(lost, 0); assert.equal(restored, 1);
  console.log('PASS protocol: different tab connect/search cannot consume or cancel held room; owner reconnect restores it');
  owner.disconnect(); await sleep(50);
  const reload = await open('alice', 'page-session-00000004');
  assert.equal(reload.verdict.resumed, false);
  await sleep(1100); assert.equal(lost, 1); assert.equal(rooms.hasRoom('protocol'), false);
  console.log('PASS protocol: reload starts fresh; old peer freed at grace expiry');
  for (const c of clients) c.disconnect();
  await io.close();
})().catch(e => { console.error(e); process.exit(1); });
