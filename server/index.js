import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const assetDir = path.join(distDir, 'assets');
const fallbackStylePath = path.join(rootDir, 'src', 'styles.css');
const dataDir = process.env.DATA_DIR || path.join(rootDir, 'server', 'data');
const storePath = path.join(dataDir, 'store.json');
const isDev = process.argv.includes('--dev');
const port = Number(process.env.PORT || 3000);
const maxVoiceSeats = Number(process.env.MAX_VOICE_SEATS || 10);

const defaultChannels = [
  {
    id: 'study',
    name: 'Study Lounge',
    description: 'Open voice room for homework and focus.',
    kind: 'public',
    ownerId: null,
    memberIds: [],
    createdAt: Date.now()
  },
  {
    id: 'game',
    name: 'Game Night',
    description: 'Open voice room for games and party chat.',
    kind: 'public',
    ownerId: null,
    memberIds: [],
    createdAt: Date.now()
  },
  {
    id: 'movie',
    name: 'Movie Night',
    description: 'Open voice room for watch parties.',
    kind: 'public',
    ownerId: null,
    memberIds: [],
    createdAt: Date.now()
  }
];

const tones = ['cyan', 'mint', 'rose', 'amber', 'lime', 'violet', 'blue', 'coral', 'plum', 'green'];

await fsp.mkdir(dataDir, { recursive: true });
let store = await loadStore();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: true,
    methods: ['GET', 'POST']
  }
});

const sockets = new Map();
const roomMembers = new Map();
const pendingVoiceInvites = new Map();

app.use(express.json({ limit: '512kb' }));

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, service: 'echoroom' });
});

app.get('/styles.css', (_request, response) => {
  response.type('text/css');
  response.sendFile(fallbackStylePath);
});

app.post('/api/auth/register', async (request, response) => {
  const email = normalizeEmail(request.body?.email);
  const nickname = cleanText(request.body?.nickname, 24);
  const password = String(request.body?.password || '');

  if (!isValidEmail(email)) {
    response.status(400).json({ ok: false, error: 'Enter a valid email' });
    return;
  }
  if (nickname.length < 2) {
    response.status(400).json({ ok: false, error: 'Nickname must be at least 2 characters' });
    return;
  }
  if (password.length < 6) {
    response.status(400).json({ ok: false, error: 'Password must be at least 6 characters' });
    return;
  }
  if (store.users.some((user) => user.email === email)) {
    response.status(409).json({ ok: false, error: 'Email is already registered' });
    return;
  }
  if (store.users.some((user) => user.nickname.toLowerCase() === nickname.toLowerCase())) {
    response.status(409).json({ ok: false, error: 'Nickname is already taken' });
    return;
  }

  const user = {
    id: crypto.randomUUID(),
    email,
    nickname,
    tone: tones[store.users.length % tones.length],
    password: hashPassword(password),
    avatar: '',
    status: 'Online',
    bio: '',
    friendIds: [],
    createdAt: Date.now()
  };
  store.users.push(user);

  const token = createSession(user.id);
  await saveStore();
  response.json({ ok: true, token, user: publicUser(user) });
});

app.post('/api/auth/login', async (request, response) => {
  const email = normalizeEmail(request.body?.email);
  const password = String(request.body?.password || '');
  const user = store.users.find((item) => item.email === email);

  if (!user || !verifyPassword(password, user.password)) {
    response.status(401).json({ ok: false, error: 'Wrong email or password' });
    return;
  }

  const token = createSession(user.id);
  await saveStore();
  response.json({ ok: true, token, user: publicUser(user) });
});

app.post('/api/auth/logout', requireAuth, async (request, response) => {
  store.sessions = store.sessions.filter((session) => session.token !== request.token);
  await saveStore();
  response.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (request, response) => {
  response.json({
    ok: true,
    user: publicUser(request.user),
    friends: request.user.friendIds.map(findUser).filter(Boolean).map(publicUser)
  });
});

app.get('/api/config', requireAuth, (request, response) => {
  response.json({
    maxVoiceSeats,
    channels: getChannelList(request.user.id),
    iceServers: getIceServers()
  });
});

app.get('/api/channels/:channelId/messages', requireAuth, (request, response) => {
  const channel = findChannel(request.params.channelId);
  if (!channel || !canAccessChannel(request.user.id, channel)) {
    response.status(404).json({ ok: false, error: 'Channel not found' });
    return;
  }
  response.json({
    ok: true,
    messages: store.messages[channel.id] || []
  });
});

app.get('/api/users/search', requireAuth, (request, response) => {
  const query = cleanText(request.query.q, 32).toLowerCase();
  if (query.length < 2) {
    response.json({ ok: true, users: [] });
    return;
  }

  const currentUser = request.user;
  const results = store.users
    .filter((user) => user.id !== currentUser.id)
    .filter((user) => user.nickname.toLowerCase().includes(query))
    .slice(0, 10)
    .map((user) => ({
      ...publicUser(user),
      online: isUserOnline(user.id),
      friend: currentUser.friendIds.includes(user.id)
    }));

  response.json({ ok: true, users: results });
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  const user = getUserByToken(token);
  if (!user) {
    next(new Error('Unauthorized'));
    return;
  }
  socket.data.userId = user.id;
  next();
});

io.on('connection', (socket) => {
  const user = findUser(socket.data.userId);
  if (!user) {
    socket.disconnect(true);
    return;
  }

  sockets.set(socket.id, {
    socketId: socket.id,
    userId: user.id,
    name: user.nickname,
    tone: user.tone,
    avatar: user.avatar || '',
    status: user.status || 'Online',
    bio: user.bio || '',
    muted: false,
    deafened: false,
    camera: false,
    screen: false,
    speaking: false,
    roomId: null,
    joinedAt: Date.now()
  });

  emitUserLists();
  emitChannelsFor(socket);

  socket.on('profile:update', async ({ nickname, status, bio, avatar } = {}, reply) => {
    const cleanNickname = cleanText(nickname, 24);
    const cleanStatus = cleanText(status, 40) || 'Online';
    const cleanBio = cleanText(bio, 160);
    const cleanAvatar = normalizeAvatar(avatar);
    if (cleanNickname.length < 2) {
      reply?.({ ok: false, error: 'Nickname must be at least 2 characters' });
      return;
    }
    const taken = store.users.some(
      (item) => item.id !== user.id && item.nickname.toLowerCase() === cleanNickname.toLowerCase()
    );
    if (taken) {
      reply?.({ ok: false, error: 'Nickname is already taken' });
      return;
    }

    user.nickname = cleanNickname;
    user.status = cleanStatus;
    user.bio = cleanBio;
    user.avatar = cleanAvatar;
    const member = sockets.get(socket.id);
    if (member) {
      member.name = cleanNickname;
      member.status = cleanStatus;
      member.bio = cleanBio;
      member.avatar = cleanAvatar;
    }
    await saveStore();
    broadcastMembersForSocket(socket.id);
    emitUserLists();
    reply?.({ ok: true, user: publicUser(user) });
  });

  socket.on('channel:create', async ({ name, description, inviteIds } = {}, reply) => {
    const cleanName = cleanText(name, 32);
    const cleanDescription = cleanText(description, 120);
    if (cleanName.length < 2) {
      reply?.({ ok: false, error: 'Channel name must be at least 2 characters' });
      return;
    }

    const invitedIds = Array.isArray(inviteIds)
      ? inviteIds
        .map((id) => String(id || ''))
        .filter((id, index, list) => id && list.indexOf(id) === index)
        .filter((id) => id !== user.id && user.friendIds.includes(id) && findUser(id))
      : [];

    const channel = {
      id: `ch-${crypto.randomUUID().slice(0, 8)}`,
      name: cleanName,
      description: cleanDescription,
      kind: 'private',
      ownerId: user.id,
      memberIds: [user.id, ...invitedIds],
      createdAt: Date.now()
    };
    store.channels.push(channel);
    store.messages[channel.id] = [];
    ensureRoomMembers(channel.id);
    await saveStore();
    emitChannelsForAll();
    for (const invitedId of invitedIds) {
      const invitedUser = findUser(invitedId);
      if (invitedUser) {
        sendVoiceInvite(user, invitedUser, channel, `${user.nickname} added you to ${channel.name}`);
      }
    }
    reply?.({ ok: true, channel: channelSummary(channel, user.id) });
  });

  socket.on('channel:invite', async ({ channelId, userId } = {}, reply) => {
    const channel = findChannel(channelId);
    const target = findUser(userId);
    if (!channel || !canAccessChannel(user.id, channel)) {
      reply?.({ ok: false, error: 'Channel not found' });
      return;
    }
    if (!target) {
      reply?.({ ok: false, error: 'User not found' });
      return;
    }
    if (channel.kind === 'public') {
      reply?.({ ok: true, message: 'Public channels are already visible to everyone' });
      return;
    }
    if (!channel.memberIds.includes(target.id)) {
      channel.memberIds.push(target.id);
      await saveStore();
    }
    emitChannelsForAll();
    emitToUser(target.id, 'notice', `${user.nickname} added you to ${channel.name}`);
    reply?.({ ok: true });
  });

  socket.on('voice:invite', async ({ channelId, userId } = {}, reply) => {
    const channel = findChannel(channelId);
    const target = findUser(userId);
    if (!channel || !canAccessChannel(user.id, channel)) {
      reply?.({ ok: false, error: 'Channel not found' });
      return;
    }
    if (!target || target.id === user.id) {
      reply?.({ ok: false, error: 'User not found' });
      return;
    }

    let changed = false;
    if (channel.kind !== 'public' && !channel.memberIds.includes(target.id)) {
      channel.memberIds.push(target.id);
      changed = true;
    }
    if (changed) await saveStore();

    emitChannelsForAll();
    const invite = sendVoiceInvite(user, target, channel, `${user.nickname} invited you to ${channel.name}`);
    reply?.({ ok: true, channel: channelSummary(channel, user.id), inviteId: invite.id });
  });

  socket.on('voice:accept', async ({ inviteId, channelId } = {}, reply) => {
    cleanExpiredVoiceInvites();
    const pending = inviteId ? pendingVoiceInvites.get(String(inviteId)) : null;
    const channel = findChannel(pending?.channelId || channelId);

    if (!channel) {
      reply?.({ ok: false, error: 'Invite room not found' });
      return;
    }

    const validPendingInvite =
      pending &&
      pending.toUserId === user.id &&
      pending.channelId === channel.id &&
      pending.expiresAt > Date.now();

    if (!validPendingInvite && !canAccessChannel(user.id, channel)) {
      reply?.({ ok: false, error: 'Invite expired. Ask your friend to invite you again.' });
      return;
    }

    if (channel.kind !== 'public' && !channel.memberIds.includes(user.id)) {
      channel.memberIds.push(user.id);
      await saveStore();
    }

    if (validPendingInvite) {
      pendingVoiceInvites.delete(pending.id);
      emitToUser(pending.fromUserId, 'notice', `${user.nickname} accepted your invite to ${channel.name}`);
    }

    emitChannelsForAll();
    reply?.({ ok: true, channel: channelSummary(channel, user.id) });
  });

  socket.on('friend:add', async ({ userId } = {}, reply) => {
    const target = findUser(userId);
    if (!target || target.id === user.id) {
      reply?.({ ok: false, error: 'User not found' });
      return;
    }

    addFriend(user, target.id);
    addFriend(target, user.id);
    await saveStore();
    emitUserLists();
    reply?.({ ok: true, friends: user.friendIds.map(findUser).filter(Boolean).map(publicUser) });
  });

  socket.on('room:join', ({ roomId, state } = {}, reply) => {
    const channel = findChannel(roomId);
    if (!channel || !canAccessChannel(user.id, channel)) {
      reply?.({ ok: false, error: 'Channel not found' });
      return;
    }

    updateSocketState(socket.id, state);

    const current = sockets.get(socket.id);
    const targetMembers = ensureRoomMembers(roomId);
    const alreadyInRoom = current?.roomId === roomId;
    if (!alreadyInRoom && targetMembers.size >= maxVoiceSeats) {
      reply?.({ ok: false, error: `Room is full: ${maxVoiceSeats}/${maxVoiceSeats}` });
      return;
    }

    leaveRoom(socket, false);

    const existingPeerIds = Array.from(targetMembers.keys()).filter((id) => id !== socket.id);
    current.roomId = roomId;
    current.joinedAt = Date.now();
    current.name = user.nickname;
    current.tone = user.tone;
    current.avatar = user.avatar || '';
    current.status = user.status || 'Online';
    current.bio = user.bio || '';
    targetMembers.set(socket.id, current);
    socket.join(roomId);

    const members = publicMembers(roomId);
    io.to(roomId).emit('room:members', { roomId, members });
    emitChannelsForAll();

    reply?.({
      ok: true,
      roomId,
      roomName: channel.name,
      members,
      existingPeerIds
    });
  });

  socket.on('room:leave', () => {
    leaveRoom(socket, true);
  });

  socket.on('voice:state', (state = {}) => {
    updateSocketState(socket.id, state);
    const member = sockets.get(socket.id);
    if (member?.roomId) {
      socket.to(member.roomId).emit('peer:state', {
        socketId: socket.id,
        muted: member.muted,
        deafened: member.deafened,
        camera: member.camera,
        screen: member.screen,
        speaking: member.speaking
      });
      io.to(member.roomId).emit('room:members', {
        roomId: member.roomId,
        members: publicMembers(member.roomId)
      });
    }
  });

  socket.on('chat:message', async ({ channelId, body } = {}, reply) => {
    const channel = findChannel(channelId);
    if (!channel || !canAccessChannel(user.id, channel)) {
      reply?.({ ok: false, error: 'Channel not found' });
      return;
    }

    const cleanBody = cleanText(body, 500);
    if (!cleanBody) {
      reply?.({ ok: false, error: 'Message is empty' });
      return;
    }

    const message = {
      id: `${Date.now()}-${socket.id}`,
      channelId: channel.id,
      authorId: user.id,
      author: user.nickname,
      tone: user.tone,
      avatar: user.avatar || '',
      status: user.status || 'Online',
      time: new Date().toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit'
      }),
      body: cleanBody
    };

    store.messages[channel.id] = [...(store.messages[channel.id] || []), message].slice(-80);
    await saveStore();
    emitToChannelMembers(channel, 'chat:message', message);
    reply?.({ ok: true });
  });

  socket.on('signal:offer', ({ targetId, description }) => {
    io.to(targetId).emit('signal:offer', {
      from: socket.id,
      description,
      peer: publicMember(socket.id)
    });
  });

  socket.on('signal:answer', ({ targetId, description }) => {
    io.to(targetId).emit('signal:answer', {
      from: socket.id,
      description
    });
  });

  socket.on('signal:ice-candidate', ({ targetId, candidate }) => {
    io.to(targetId).emit('signal:ice-candidate', {
      from: socket.id,
      candidate
    });
  });

  socket.on('disconnect', () => {
    leaveRoom(socket, true);
    sockets.delete(socket.id);
    emitUserLists();
  });
});

if (isDev) {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    root: rootDir,
    server: { middlewareMode: true },
    appType: 'spa'
  });
  app.use(vite.middlewares);
} else {
  if (!fs.existsSync(distDir)) {
    console.warn('dist directory was not found. Run npm run build before npm start.');
  }
  app.use('/assets', express.static(assetDir, {
    fallthrough: false,
    immutable: true,
    maxAge: '1y'
  }));
  app.use(express.static(distDir, {
    index: false,
    maxAge: '1h'
  }));
  app.use((request, response, next) => {
    if (request.method !== 'GET' || request.path.startsWith('/api/')) {
      next();
      return;
    }
    if (path.extname(request.path)) {
      response.status(404).send('Asset not found');
      return;
    }
    response.sendFile(path.join(distDir, 'index.html'));
  });
}

server.listen(port, '0.0.0.0', () => {
  console.log(`EchoRoom listening on http://0.0.0.0:${port}`);
});

async function loadStore() {
  try {
    const raw = await fsp.readFile(storePath, 'utf8');
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, ''));
    return normalizeStore(parsed);
  } catch {
    return normalizeStore({});
  }
}

function normalizeStore(candidate) {
  const rawChannels = Array.isArray(candidate.channels) && candidate.channels.length
    ? candidate.channels
    : defaultChannels;
  const users = Array.isArray(candidate.users)
    ? candidate.users.map((user, index) => ({
      ...user,
      tone: user.tone || tones[index % tones.length],
      avatar: normalizeAvatar(user.avatar),
      status: cleanText(user.status, 40) || 'Online',
      bio: cleanText(user.bio, 160),
      friendIds: Array.isArray(user.friendIds) ? user.friendIds : []
    }))
    : [];
  const channels = rawChannels.map((channel) => ({
    ...channel,
    id: String(channel.id || `ch-${crypto.randomUUID().slice(0, 8)}`),
    name: cleanText(channel.name, 32) || 'Untitled chat',
    description: cleanText(channel.description, 120),
    kind: channel.kind === 'public' ? 'public' : 'private',
    ownerId: channel.ownerId || null,
    memberIds: Array.isArray(channel.memberIds) ? [...new Set(channel.memberIds)] : [],
    createdAt: Number(channel.createdAt) || Date.now()
  }));

  return {
    users,
    sessions: Array.isArray(candidate.sessions) ? candidate.sessions : [],
    channels,
    messages: candidate.messages && typeof candidate.messages === 'object' ? candidate.messages : {}
  };
}

async function saveStore() {
  await fsp.writeFile(storePath, JSON.stringify(store, null, 2), 'utf8');
}

function requireAuth(request, response, next) {
  const header = request.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const user = getUserByToken(token);
  if (!user) {
    response.status(401).json({ ok: false, error: 'Unauthorized' });
    return;
  }
  request.token = token;
  request.user = user;
  next();
}

function getUserByToken(token) {
  if (!token) return null;
  const session = store.sessions.find((item) => item.token === token);
  if (!session) return null;
  return findUser(session.userId);
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  store.sessions.push({
    token,
    userId,
    createdAt: Date.now()
  });
  return token;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 32, 'sha256').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.pbkdf2Sync(password, salt, 120000, 32, 'sha256').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(candidate, 'hex'));
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeAvatar(value) {
  const avatar = String(value || '').trim();
  if (!avatar) return '';
  if (avatar.length > 220000) return '';
  if (!/^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/=]+$/i.test(avatar)) return '';
  return avatar;
}

function findUser(userId) {
  return store.users.find((user) => user.id === userId) || null;
}

function findChannel(channelId) {
  return store.channels.find((channel) => channel.id === channelId) || null;
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    nickname: user.nickname,
    tone: user.tone,
    avatar: user.avatar || '',
    status: user.status || 'Online',
    bio: user.bio || ''
  };
}

function onlineUsersFor(userId) {
  const seen = new Set();
  return Array.from(sockets.values())
    .filter((member) => member.userId !== userId)
    .filter((member) => {
      if (seen.has(member.userId)) return false;
      seen.add(member.userId);
      return true;
    })
    .map((member) => {
      const user = findUser(member.userId);
      return {
        ...publicUser(user),
        online: true,
        inChannelId: member.roomId
      };
    });
}

function isUserOnline(userId) {
  return Array.from(sockets.values()).some((member) => member.userId === userId);
}

function addFriend(user, friendId) {
  if (!user.friendIds) user.friendIds = [];
  if (!user.friendIds.includes(friendId)) user.friendIds.push(friendId);
}

function canAccessChannel(userId, channel) {
  return channel.kind === 'public' || channel.ownerId === userId || channel.memberIds.includes(userId);
}

function channelSummary(channel, userId = null) {
  return {
    id: channel.id,
    name: channel.name,
    description: channel.description || '',
    kind: channel.kind,
    ownerId: channel.ownerId,
    members: channel.memberIds.length,
    participants: ensureRoomMembers(channel.id).size,
    mine: userId ? canAccessChannel(userId, channel) : false
  };
}

function getChannelList(userId) {
  return store.channels
    .filter((channel) => canAccessChannel(userId, channel))
    .map((channel) => channelSummary(channel, userId));
}

function ensureRoomMembers(roomId) {
  if (!roomMembers.has(roomId)) {
    roomMembers.set(roomId, new Map());
  }
  return roomMembers.get(roomId);
}

function updateSocketState(socketId, state = {}) {
  const member = sockets.get(socketId);
  if (!member) return;
  if (typeof state.muted === 'boolean') member.muted = state.muted;
  if (typeof state.deafened === 'boolean') member.deafened = state.deafened;
  if (typeof state.camera === 'boolean') member.camera = state.camera;
  if (typeof state.screen === 'boolean') member.screen = state.screen;
  if (typeof state.speaking === 'boolean') member.speaking = state.speaking;
}

function leaveRoom(socket, notify) {
  const member = sockets.get(socket.id);
  if (!member?.roomId) return;

  const roomId = member.roomId;
  const members = ensureRoomMembers(roomId);
  members.delete(socket.id);
  socket.leave(roomId);
  member.roomId = null;

  if (notify) {
    socket.to(roomId).emit('peer:left', { socketId: socket.id });
  }

  io.to(roomId).emit('room:members', { roomId, members: publicMembers(roomId) });
  emitChannelsForAll();
}

function broadcastMembersForSocket(socketId) {
  const member = sockets.get(socketId);
  if (!member?.roomId) return;
  io.to(member.roomId).emit('room:members', {
    roomId: member.roomId,
    members: publicMembers(member.roomId)
  });
}

function publicMember(socketId) {
  const member = sockets.get(socketId);
  if (!member) return null;
  return {
    socketId: member.socketId,
    userId: member.userId,
    name: member.name,
    tone: member.tone,
    avatar: member.avatar || '',
    status: member.status || 'Online',
    bio: member.bio || '',
    muted: member.muted,
    deafened: member.deafened,
    camera: member.camera,
    screen: member.screen,
    speaking: member.speaking,
    joinedAt: member.joinedAt
  };
}

function publicMembers(roomId) {
  return Array.from(ensureRoomMembers(roomId).keys())
    .map(publicMember)
    .filter(Boolean)
    .sort((a, b) => a.joinedAt - b.joinedAt);
}

function emitChannelsFor(socket) {
  const member = sockets.get(socket.id);
  if (!member) return;
  socket.emit('channels:update', getChannelList(member.userId));
}

function emitChannelsForAll() {
  for (const [socketId, socket] of io.sockets.sockets) {
    if (sockets.has(socketId)) emitChannelsFor(socket);
  }
}

function emitUserLists() {
  for (const [socketId, socket] of io.sockets.sockets) {
    const member = sockets.get(socketId);
    const user = member ? findUser(member.userId) : null;
    if (!user) continue;
    socket.emit('online:update', onlineUsersFor(user.id));
    socket.emit('friends:update', user.friendIds.map(findUser).filter(Boolean).map((friend) => ({
      ...publicUser(friend),
      online: isUserOnline(friend.id)
    })));
  }
}

function emitToUser(userId, event, payload) {
  for (const [socketId, socket] of io.sockets.sockets) {
    const member = sockets.get(socketId);
    if (member?.userId === userId) {
      socket.emit(event, payload);
    }
  }
}

function sendVoiceInvite(fromUser, targetUser, channel, noticeText) {
  cleanExpiredVoiceInvites();
  const invite = {
    id: crypto.randomUUID(),
    fromUserId: fromUser.id,
    toUserId: targetUser.id,
    channelId: channel.id,
    createdAt: Date.now(),
    expiresAt: Date.now() + 10 * 60 * 1000
  };
  pendingVoiceInvites.set(invite.id, invite);

  const payload = {
    id: invite.id,
    from: publicUser(fromUser),
    channel: channelSummary(channel, targetUser.id),
    createdAt: invite.createdAt,
    expiresAt: invite.expiresAt
  };

  emitToUser(targetUser.id, 'voice:invite', payload);
  if (noticeText) emitToUser(targetUser.id, 'notice', noticeText);
  return payload;
}

function cleanExpiredVoiceInvites() {
  const now = Date.now();
  for (const [inviteId, invite] of pendingVoiceInvites) {
    if (invite.expiresAt <= now) pendingVoiceInvites.delete(inviteId);
  }
}

function emitToChannelMembers(channel, event, payload) {
  if (channel.kind === 'public') {
    io.emit(event, payload);
    return;
  }
  const allowed = new Set([channel.ownerId, ...channel.memberIds]);
  for (const [socketId, socket] of io.sockets.sockets) {
    const member = sockets.get(socketId);
    if (member && allowed.has(member.userId)) {
      socket.emit(event, payload);
    }
  }
}

function getIceServers() {
  const servers = [{ urls: 'stun:stun.l.google.com:19302' }];
  if (process.env.TURN_URL) {
    servers.push({
      urls: process.env.TURN_URL,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL
    });
  }
  return servers;
}

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.replace(/[<>]/g, '').trim().slice(0, maxLength);
}
