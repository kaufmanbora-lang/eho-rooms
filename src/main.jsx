import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io } from 'socket.io-client';
import {
  Bell,
  BookOpen,
  Camera,
  Check,
  ChevronDown,
  CirclePlus,
  Clipboard,
  Compass,
  Gamepad2,
  Gift,
  Hash,
  Headphones,
  KeyRound,
  Link2,
  LogOut,
  MessageCircle,
  Mic,
  MicOff,
  MonitorUp,
  Moon,
  Music2,
  Pause,
  PhoneOff,
  Play,
  Plus,
  Search,
  Send,
  Settings,
  Shield,
  SlidersHorizontal,
  Smile,
  Sparkles,
  Upload,
  UserPlus,
  Users,
  Volume2,
  VolumeX,
  WandSparkles,
  X,
  Zap
} from 'lucide-react';
import './styles.css';

const MAX_VOICE_SEATS = 10;
const TOKEN_KEY = 'echoroom.token';
const tones = ['cyan', 'mint', 'rose', 'amber', 'lime', 'violet', 'blue', 'coral', 'plum', 'green'];

const channelIcons = [BookOpen, Gamepad2, Moon, Music2, Zap, Hash];

const servers = [
  { id: 'home', label: 'Home', mark: 'ER', tone: 'purple' },
  { id: 'friends', label: 'Friends', mark: 'FR', tone: 'blue' },
  { id: 'create', label: 'New Chat', mark: '+', tone: 'mint' },
  { id: 'settings', label: 'Settings', mark: 'ST', tone: 'teal' }
];

function App() {
  const [auth, setAuth] = useState({
    token: localStorage.getItem(TOKEN_KEY),
    user: null,
    loading: true
  });
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({
    email: '',
    password: '',
    nickname: ''
  });
  const [authError, setAuthError] = useState('');

  const [channels, setChannels] = useState([]);
  const [activeChannelId, setActiveChannelId] = useState(null);
  const [joinedRoomId, setJoinedRoomId] = useState(null);
  const [members, setMembers] = useState([]);
  const [messagesByChannel, setMessagesByChannel] = useState({});
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState('Sign in to start');
  const [socketId, setSocketId] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [friends, setFriends] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showInviteCard, setShowInviteCard] = useState(true);
  const [profileDraft, setProfileDraft] = useState('');
  const [statusDraft, setStatusDraft] = useState('');
  const [bioDraft, setBioDraft] = useState('');
  const [avatarDraft, setAvatarDraft] = useState('');
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelDescription, setNewChannelDescription] = useState('');
  const [newChannelInviteIds, setNewChannelInviteIds] = useState([]);
  const [createChatOpen, setCreateChatOpen] = useState(false);
  const [activeServer, setActiveServer] = useState('home');
  const [rightMode, setRightMode] = useState('people');
  const [remoteStreams, setRemoteStreams] = useState({});
  const [localMediaRevision, setLocalMediaRevision] = useState(0);
  const [voiceInvites, setVoiceInvites] = useState([]);
  const [voiceLevels, setVoiceLevels] = useState({});
  const [callVolume, setCallVolume] = useState(320);
  const [mediaIssue, setMediaIssue] = useState(null);
  const [config, setConfig] = useState({
    maxVoiceSeats: MAX_VOICE_SEATS,
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  });
  const [controls, setControls] = useState({
    mic: true,
    headphones: true,
    camera: false,
    screen: false,
    music: false
  });

  const socketRef = useRef(null);
  const localStreamRef = useRef(null);
  const cameraTrackRef = useRef(null);
  const screenTrackRef = useRef(null);
  const peersRef = useRef(new Map());
  const pendingIceRef = useRef(new Map());
  const audioContextRef = useRef(null);
  const audioMetersRef = useRef(new Map());
  const audioMeterFrameRef = useRef(null);
  const audioMeterTickRef = useRef(0);
  const voiceLevelsRef = useRef({});
  const lastVoiceBroadcastRef = useRef({ speaking: false, at: 0 });
  const activeChannelRef = useRef(activeChannelId);
  const joinedRoomRef = useRef(joinedRoomId);
  const configRef = useRef(config);
  const controlsRef = useRef(controls);
  const callVolumeRef = useRef(callVolume);
  const tokenRef = useRef(auth.token);
  const chatInputRef = useRef(null);

  const activeChannel = channels.find((channel) => channel.id === activeChannelId) ?? channels[0];
  const activeMessages = activeChannel ? messagesByChannel[activeChannel.id] ?? [] : [];
  const channelIsFull = (activeChannel?.participants ?? 0) >= config.maxVoiceSeats;
  const youInActiveRoom = joinedRoomId === activeChannel?.id;
  const currentUser = auth.user;

  function syncProfileDrafts(user) {
    setProfileDraft(user?.nickname ?? '');
    setStatusDraft(user?.status ?? 'Online');
    setBioDraft(user?.bio ?? '');
    setAvatarDraft(user?.avatar ?? '');
  }

  useEffect(() => {
    tokenRef.current = auth.token;
  }, [auth.token]);

  useEffect(() => {
    activeChannelRef.current = activeChannelId;
  }, [activeChannelId]);

  useEffect(() => {
    joinedRoomRef.current = joinedRoomId;
  }, [joinedRoomId]);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    controlsRef.current = controls;
  }, [controls]);

  useEffect(() => {
    callVolumeRef.current = callVolume;
  }, [callVolume]);

  useEffect(() => {
    voiceLevelsRef.current = voiceLevels;
  }, [voiceLevels]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const transferToken = params.get('token');
    const tokenForLoad = transferToken && isLocalHost()
      ? transferToken
      : auth.token;

    if (transferToken && isLocalHost()) {
      localStorage.setItem(TOKEN_KEY, transferToken);
      params.delete('token');
      const cleanUrl = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`;
      window.history.replaceState({}, '', cleanUrl);
    }

    if (!tokenForLoad) {
      setAuth((current) => ({ ...current, loading: false }));
      return;
    }

    api('/api/auth/me', { token: tokenForLoad })
      .then((data) => {
        setAuth({ token: tokenForLoad, user: data.user, loading: false });
        setFriends(data.friends ?? []);
        syncProfileDrafts(data.user);
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setAuth({ token: null, user: null, loading: false });
      });
  }, []);

  useEffect(() => {
    if (!auth.token || !auth.user) return;

    let stopped = false;
    api('/api/config', { token: auth.token })
      .then((data) => {
        if (stopped) return;
        setConfig(data);
        setChannels(data.channels ?? []);
        const params = new URLSearchParams(window.location.search);
        const linkChannel = params.get('room') || params.get('channel');
        const firstChannel = (data.channels ?? []).find((channel) => channel.id === linkChannel) || data.channels?.[0];
        if (firstChannel) {
          setActiveChannelId((current) => current || firstChannel.id);
          loadMessages(firstChannel.id, auth.token);
        }
      })
      .catch((error) => setNotice(error.message));

    const socket = io({
      transports: ['websocket', 'polling'],
      auth: { token: auth.token }
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketId(socket.id);
      setNotice('Connected');
    });

    socket.on('connect_error', (error) => {
      setNotice(error.message || 'Connection failed');
    });

    socket.on('disconnect', () => {
      setNotice('Reconnecting');
      setSocketId(null);
      setJoinedRoomId(null);
      setMembers([]);
      closeAllPeers();
    });

    socket.on('channels:update', (serverChannels) => {
      setChannels(serverChannels);
      setActiveChannelId((current) => {
        if (current && serverChannels.some((channel) => channel.id === current)) return current;
        return serverChannels[0]?.id ?? null;
      });
    });

    socket.on('friends:update', setFriends);
    socket.on('online:update', setOnlineUsers);
    socket.on('notice', setNotice);

    socket.on('voice:invite', (invite) => {
      setChannels((current) => {
        if (!invite.channel) return current;
        if (current.some((channel) => channel.id === invite.channel.id)) {
          return current.map((channel) => (channel.id === invite.channel.id ? invite.channel : channel));
        }
        return [...current, invite.channel];
      });
      setVoiceInvites((current) => [invite, ...current.filter((item) => item.id !== invite.id)].slice(0, 3));
      setNotice(`${invite.from.nickname} invited you to ${invite.channel.name}`);
    });

    socket.on('room:members', ({ roomId, members: nextMembers }) => {
      if (roomId === joinedRoomRef.current || roomId === activeChannelRef.current) {
        setMembers(nextMembers);
      }
    });

    socket.on('peer:left', ({ socketId: peerId }) => {
      closePeer(peerId);
      setRemoteStreams((current) => {
        const next = { ...current };
        delete next[peerId];
        return next;
      });
    });

    socket.on('peer:state', (state) => {
      setMembers((current) =>
        current.map((member) => (member.socketId === state.socketId ? { ...member, ...state } : member))
      );
    });

    socket.on('chat:message', (message) => {
      setMessagesByChannel((current) => ({
        ...current,
        [message.channelId]: [...(current[message.channelId] ?? []), message].slice(-80)
      }));
    });

    socket.on('signal:offer', async ({ from, description }) => {
      await handleOffer(from, description);
    });

    socket.on('signal:answer', async ({ from, description }) => {
      const peer = peersRef.current.get(from);
      if (!peer) return;
      await peer.setRemoteDescription(description);
      await flushPendingIce(from, peer);
    });

    socket.on('signal:ice-candidate', async ({ from, candidate }) => {
      await handleRemoteIce(from, candidate);
    });

    return () => {
      stopped = true;
      socket.disconnect();
      closeAllPeers();
      stopLocalStream();
    };
  }, [auth.token, auth.user?.id]);

  useEffect(() => {
    rebuildAudioMeters();
  }, [joinedRoomId, socketId, remoteStreams, localMediaRevision]);

  useEffect(() => () => cleanupAudioMeters(), []);

  useEffect(() => {
    const stream = localStreamRef.current;
    if (stream) {
      stream.getAudioTracks().forEach((track) => {
        track.enabled = controls.mic;
      });
    }

    socketRef.current?.emit('voice:state', {
      muted: !controls.mic,
      deafened: !controls.headphones,
      camera: controls.camera,
      screen: controls.screen
    });
  }, [controls.mic, controls.headphones, controls.camera, controls.screen]);

  useEffect(() => {
    if (!auth.token || searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(() => {
      api(`/api/users/search?q=${encodeURIComponent(searchQuery.trim())}`, { token: auth.token })
        .then((data) => setSearchResults(data.users ?? []))
        .catch((error) => setNotice(error.message));
    }, 220);
    return () => clearTimeout(timer);
  }, [searchQuery, auth.token]);

  async function loadMessages(channelId, token = auth.token) {
    if (!channelId || !token) return;
    try {
      const data = await api(`/api/channels/${channelId}/messages`, { token });
      setMessagesByChannel((current) => ({ ...current, [channelId]: data.messages ?? [] }));
    } catch (error) {
      setNotice(error.message);
    }
  }

  function selectChannel(channelId) {
    setActiveChannelId(channelId);
    setRightMode('people');
    loadMessages(channelId);
  }

  async function submitAuth(event) {
    event.preventDefault();
    setAuthError('');
    const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
    try {
      const data = await api(endpoint, {
        method: 'POST',
        body: authForm
      });
      localStorage.setItem(TOKEN_KEY, data.token);
      setAuth({ token: data.token, user: data.user, loading: false });
      syncProfileDrafts(data.user);
      setNotice('Signed in');
    } catch (error) {
      setAuthError(error.message);
    }
  }

  async function logout() {
    if (auth.token) {
      api('/api/auth/logout', { method: 'POST', token: auth.token }).catch(() => {});
    }
    localStorage.removeItem(TOKEN_KEY);
    socketRef.current?.disconnect();
    closeAllPeers();
    stopLocalStream();
    setAuth({ token: null, user: null, loading: false });
    setChannels([]);
    setFriends([]);
    setOnlineUsers([]);
    setMembers([]);
    setMessagesByChannel({});
    setJoinedRoomId(null);
    setNotice('Signed out');
  }

  async function ensureLocalStream() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Your browser does not support microphone calls.');
    }

    const stream = getLocalStream();
    const hasLiveAudio = stream.getAudioTracks().some((track) => track.readyState === 'live');
    if (!hasLiveAudio) {
      const audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });
      audioStream.getAudioTracks().forEach((track) => stream.addTrack(track));
    }

    stream.getAudioTracks().forEach((track) => {
      track.enabled = controlsRef.current.mic;
    });
    bumpLocalMedia();
    return stream;
  }

  function getLocalStream() {
    if (!localStreamRef.current) {
      localStreamRef.current = new MediaStream();
    }
    return localStreamRef.current;
  }

  function bumpLocalMedia() {
    setLocalMediaRevision((current) => current + 1);
  }

  function createPeer(peerId) {
    const existing = peersRef.current.get(peerId);
    if (existing) return existing;

    const peer = new RTCPeerConnection({ iceServers: configRef.current.iceServers });
    peersRef.current.set(peerId, peer);

    const stream = localStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));
    }

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.emit('signal:ice-candidate', {
          targetId: peerId,
          candidate: event.candidate
        });
      }
    };

    peer.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (!remoteStream) return;
      setRemoteStreams((current) => ({ ...current, [peerId]: remoteStream }));
    };

    peer.onconnectionstatechange = () => {
      if (['closed', 'failed', 'disconnected'].includes(peer.connectionState)) {
        setRemoteStreams((current) => {
          const next = { ...current };
          delete next[peerId];
          return next;
        });
      }
    };

    return peer;
  }

  async function callPeer(peerId) {
    const peer = createPeer(peerId);
    const offer = await peer.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
    await peer.setLocalDescription(offer);
    socketRef.current?.emit('signal:offer', {
      targetId: peerId,
      description: peer.localDescription
    });
  }

  async function handleOffer(from, description) {
    await ensureLocalStream();
    const peer = createPeer(from);
    await peer.setRemoteDescription(description);
    await flushPendingIce(from, peer);
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    socketRef.current?.emit('signal:answer', {
      targetId: from,
      description: peer.localDescription
    });
  }

  async function handleRemoteIce(from, candidate) {
    const peer = peersRef.current.get(from);
    if (!peer || !peer.remoteDescription) {
      const list = pendingIceRef.current.get(from) ?? [];
      list.push(candidate);
      pendingIceRef.current.set(from, list);
      return;
    }
    await peer.addIceCandidate(candidate);
  }

  async function flushPendingIce(peerId, peer) {
    const pending = pendingIceRef.current.get(peerId) ?? [];
    for (const candidate of pending) {
      await peer.addIceCandidate(candidate);
    }
    pendingIceRef.current.delete(peerId);
  }

  function addLocalTrackToPeers(track) {
    const stream = getLocalStream();
    peersRef.current.forEach((peer) => {
      if (peer.getSenders().some((sender) => sender.track === track)) return;
      peer.addTrack(track, stream);
    });
  }

  function removeLocalTrackFromPeers(track) {
    peersRef.current.forEach((peer) => {
      peer.getSenders()
        .filter((sender) => sender.track === track)
        .forEach((sender) => peer.removeTrack(sender));
    });
  }

  async function renegotiatePeer(peerId) {
    const peer = peersRef.current.get(peerId);
    if (!peer || peer.signalingState !== 'stable') return;
    const offer = await peer.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
    await peer.setLocalDescription(offer);
    socketRef.current?.emit('signal:offer', {
      targetId: peerId,
      description: peer.localDescription
    });
  }

  async function renegotiatePeers() {
    const peerIds = Array.from(peersRef.current.keys());
    await Promise.all(peerIds.map((peerId) => renegotiatePeer(peerId)));
  }

  async function startCamera() {
    if (cameraTrackRef.current?.readyState === 'live') return;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Your browser does not support camera calls.');
    }

    setNotice('Requesting camera');
    const cameraStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30, max: 30 }
      }
    });
    const [track] = cameraStream.getVideoTracks();
    if (!track) throw new Error('No camera was found.');

    track.onended = () => {
      stopCamera(false).catch(() => {});
    };
    getLocalStream().addTrack(track);
    cameraTrackRef.current = track;
    addLocalTrackToPeers(track);
    setControls((current) => ({ ...current, camera: true }));
    bumpLocalMedia();
    if (joinedRoomRef.current) await renegotiatePeers();
    setNotice('Camera is on');
  }

  async function stopCamera(stopTrack = true) {
    const track = cameraTrackRef.current;
    if (!track) return;
    removeLocalTrackFromPeers(track);
    localStreamRef.current?.removeTrack(track);
    if (stopTrack && track.readyState !== 'ended') track.stop();
    cameraTrackRef.current = null;
    setControls((current) => ({ ...current, camera: false }));
    bumpLocalMedia();
    if (joinedRoomRef.current) await renegotiatePeers();
    setNotice('Camera is off');
  }

  async function startScreenShare() {
    if (screenTrackRef.current?.readyState === 'live') return;
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error('Your browser does not support screen sharing.');
    }

    setNotice('Choose a screen to share');
    const screenStream = await navigator.mediaDevices.getDisplayMedia({
      audio: false,
      video: true
    });
    const [track] = screenStream.getVideoTracks();
    if (!track) throw new Error('No screen was selected.');

    track.onended = () => {
      stopScreenShare(false).catch(() => {});
    };
    getLocalStream().addTrack(track);
    screenTrackRef.current = track;
    addLocalTrackToPeers(track);
    setControls((current) => ({ ...current, screen: true }));
    bumpLocalMedia();
    if (joinedRoomRef.current) await renegotiatePeers();
    setNotice('Screen sharing is on');
  }

  async function stopScreenShare(stopTrack = true) {
    const track = screenTrackRef.current;
    if (!track) return;
    removeLocalTrackFromPeers(track);
    localStreamRef.current?.removeTrack(track);
    if (stopTrack && track.readyState !== 'ended') track.stop();
    screenTrackRef.current = null;
    setControls((current) => ({ ...current, screen: false }));
    bumpLocalMedia();
    if (joinedRoomRef.current) await renegotiatePeers();
    setNotice('Screen sharing is off');
  }

  function openMediaIssue(kind, error) {
    const label = kind === 'screen' ? 'screen sharing' : kind;
    const denied = error?.name === 'NotAllowedError' || /denied|permission/i.test(error?.message || '');
    const insecure = typeof window !== 'undefined' && !window.isSecureContext;
    const safeUrl = denied ? buildMediaSafeUrl() : '';
    const host = typeof window !== 'undefined' ? window.location.hostname : 'this site';
    setMediaIssue({
      kind,
      title: denied ? `Allow ${label}` : `${label} could not start`,
      message: insecure
        ? 'Camera and screen sharing require HTTPS or localhost.'
        : denied
          ? safeUrl
            ? `The browser blocked ${label} on ${host}. Open the localhost link to ask for permission again.`
            : `The browser blocked ${label}. Allow it for ${host}, then try again.`
          : error?.message || `Could not start ${label}.`,
      denied,
      insecure,
      host,
      safeUrl
    });
  }

  function closeMediaIssue() {
    setMediaIssue(null);
  }

  function buildMediaSafeUrl() {
    if (typeof window === 'undefined' || window.location.hostname !== '127.0.0.1') return '';
    const url = new URL(window.location.href);
    url.hostname = 'localhost';
    if (tokenRef.current) url.searchParams.set('token', tokenRef.current);
    return url.toString();
  }

  function openMediaSafeLink() {
    if (!mediaIssue?.safeUrl) return;
    window.location.href = mediaIssue.safeUrl;
  }

  async function retryMediaIssue() {
    const kind = mediaIssue?.kind;
    setMediaIssue(null);
    if (kind) await toggleControl(kind);
  }

  function closePeer(peerId) {
    const peer = peersRef.current.get(peerId);
    if (peer) peer.close();
    peersRef.current.delete(peerId);
    pendingIceRef.current.delete(peerId);
  }

  function closeAllPeers() {
    peersRef.current.forEach((peer) => peer.close());
    peersRef.current.clear();
    pendingIceRef.current.clear();
    setRemoteStreams({});
  }

  function stopLocalStream() {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    cameraTrackRef.current = null;
    screenTrackRef.current = null;
    removeAudioMeter('local');
    bumpLocalMedia();
    setControls((current) => ({ ...current, camera: false, screen: false }));
  }

  function getAudioContext() {
    if (typeof window === 'undefined') return null;
    if (!audioContextRef.current) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      audioContextRef.current = new AudioContextClass();
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(() => {});
    }
    return audioContextRef.current;
  }

  function upsertAudioMeter(id, stream) {
    const audioTracks = stream?.getAudioTracks?.().filter((track) => track.readyState === 'live') ?? [];
    if (!audioTracks.length) {
      removeAudioMeter(id);
      return;
    }

    const trackIds = audioTracks.map((track) => track.id).join(',');
    const existing = audioMetersRef.current.get(id);
    if (existing?.trackIds === trackIds) return;

    removeAudioMeter(id);
    const context = getAudioContext();
    if (!context) return;

    const meterStream = new MediaStream(audioTracks);
    const source = context.createMediaStreamSource(meterStream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.72;
    source.connect(analyser);

    audioMetersRef.current.set(id, {
      analyser,
      data: new Uint8Array(analyser.fftSize),
      source,
      trackIds
    });
    startAudioMeterLoop();
  }

  function removeAudioMeter(id) {
    const meter = audioMetersRef.current.get(id);
    if (meter) {
      meter.source.disconnect();
      audioMetersRef.current.delete(id);
    }
    setVoiceLevels((current) => {
      if (!(id in current)) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  function rebuildAudioMeters() {
    if (!joinedRoomId) {
      cleanupAudioMeters(false);
      return;
    }

    const activeIds = new Set();
    if (socketId && localStreamRef.current) {
      activeIds.add('local');
      upsertAudioMeter('local', localStreamRef.current);
    }

    for (const [peerId, stream] of Object.entries(remoteStreams)) {
      activeIds.add(peerId);
      upsertAudioMeter(peerId, stream);
    }

    for (const id of Array.from(audioMetersRef.current.keys())) {
      if (!activeIds.has(id)) removeAudioMeter(id);
    }
  }

  function cleanupAudioMeters(closeContext = true) {
    if (audioMeterFrameRef.current) {
      cancelAnimationFrame(audioMeterFrameRef.current);
      audioMeterFrameRef.current = null;
    }
    audioMetersRef.current.forEach((meter) => meter.source.disconnect());
    audioMetersRef.current.clear();
    setVoiceLevels({});
    if (closeContext && audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  }

  function startAudioMeterLoop() {
    if (audioMeterFrameRef.current) return;

    const tick = () => {
      audioMeterFrameRef.current = null;
      if (!audioMetersRef.current.size) return;

      audioMeterTickRef.current += 1;
      const nextLevels = {};
      audioMetersRef.current.forEach((meter, id) => {
        meter.analyser.getByteTimeDomainData(meter.data);
        let sum = 0;
        for (let index = 0; index < meter.data.length; index += 1) {
          const sample = (meter.data[index] - 128) / 128;
          sum += sample * sample;
        }
        const rms = Math.sqrt(sum / meter.data.length);
        const noiseFloor = 0.035;
        const gated = rms <= noiseFloor ? 0 : Math.max(0, (rms - noiseFloor) * 5.5);
        const level = Math.min(1, Math.pow(gated, 0.82));
        nextLevels[id] = level;
      });

      if (audioMeterTickRef.current % 3 === 0) {
        setVoiceLevels((current) => ({ ...current, ...nextLevels }));
      }

      const localLevel = nextLevels.local ?? 0;
      const speaking = controlsRef.current.mic && localLevel > 0.16;
      const now = Date.now();
      const last = lastVoiceBroadcastRef.current;
      if (joinedRoomRef.current && (speaking !== last.speaking || now - last.at > 850)) {
        lastVoiceBroadcastRef.current = { speaking, at: now };
        socketRef.current?.emit('voice:state', {
          muted: !controlsRef.current.mic,
          deafened: !controlsRef.current.headphones,
          camera: controlsRef.current.camera,
          screen: controlsRef.current.screen,
          speaking
        });
      }

      audioMeterFrameRef.current = requestAnimationFrame(tick);
    };

    audioMeterFrameRef.current = requestAnimationFrame(tick);
  }

  async function joinRoom(channelId = activeChannelId) {
    const roomId = channelId;
    if (!roomId) return false;
    if (!socketRef.current?.connected) {
      setNotice('Voice server is not connected yet');
      return false;
    }

    try {
      setNotice('Requesting microphone');
      await ensureLocalStream();
      setNotice('Joining voice');

      return await new Promise((resolve) => {
        socketRef.current.emit(
          'room:join',
          {
            roomId,
            state: {
              muted: !controlsRef.current.mic,
              deafened: !controlsRef.current.headphones,
              camera: controlsRef.current.camera,
              screen: controlsRef.current.screen,
              speaking: false
            }
          },
          async (response) => {
            if (!response?.ok) {
              setNotice(response?.error ?? 'Could not join channel');
              resolve(false);
              return;
            }

            try {
              closeAllPeers();
              setJoinedRoomId(response.roomId);
              setActiveChannelId(response.roomId);
              setMembers(response.members);
              setNotice(`Joined ${response.roomName}`);
              await loadMessages(response.roomId);

              for (const peerId of response.existingPeerIds) {
                await callPeer(peerId);
              }
              resolve(true);
            } catch (error) {
              setNotice(error.message || 'Could not connect to voice peers');
              resolve(false);
            }
          }
        );
      });
    } catch (error) {
      openMediaIssue('microphone', error);
      setNotice(error.message || 'Microphone permission is required');
      return false;
    }
  }

  function leaveRoom() {
    socketRef.current?.emit('room:leave');
    closeAllPeers();
    stopLocalStream();
    setJoinedRoomId(null);
    setMembers([]);
    setNotice('Left voice');
  }

  function handleJoinToggle() {
    if (youInActiveRoom) {
      leaveRoom();
      return;
    }
    joinRoom(activeChannelId);
  }

  async function toggleControl(key) {
    try {
      if (key === 'camera') {
        if (controlsRef.current.camera) {
          await stopCamera();
        } else {
          await startCamera();
        }
        return;
      }

      if (key === 'screen') {
        if (controlsRef.current.screen) {
          await stopScreenShare();
        } else {
          await startScreenShare();
        }
        return;
      }

      setControls((current) => ({ ...current, [key]: !current[key] }));
    } catch (error) {
      setControls((current) => ({
        ...current,
        camera: key === 'camera' ? false : current.camera,
        screen: key === 'screen' ? false : current.screen
      }));
      if (key === 'camera' || key === 'screen') {
        openMediaIssue(key, error);
      }
      setNotice(error.message || 'Media permission was cancelled');
    }
  }

  function sendMessage(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !activeChannel) return;

    socketRef.current?.emit('chat:message', { channelId: activeChannel.id, body: text }, (response) => {
      if (!response?.ok) setNotice(response?.error ?? 'Message failed');
    });
    setDraft('');
  }

  function quickInsert(value) {
    setDraft((current) => `${current}${current ? ' ' : ''}${value}`.slice(0, 500));
    chatInputRef.current?.focus();
  }

  function createChannel(event) {
    event.preventDefault();
    const name = newChannelName.trim();
    if (!name) return;
    if (!socketRef.current?.connected) {
      setNotice('Chat server is not connected yet');
      return;
    }

    socketRef.current.emit('channel:create', {
      name,
      description: newChannelDescription.trim(),
      inviteIds: newChannelInviteIds
    }, (response) => {
      if (!response?.ok) {
        setNotice(response?.error ?? 'Could not create channel');
        return;
      }
      setChannels((current) =>
        current.some((channel) => channel.id === response.channel.id)
          ? current
          : [...current, response.channel]
      );
      setNewChannelName('');
      setNewChannelDescription('');
      setNewChannelInviteIds([]);
      setCreateChatOpen(false);
      setActiveChannelId(response.channel.id);
      setRightMode('invite');
      setNotice(`Created ${response.channel.name}`);
    });
  }

  function openCreateChat() {
    setActiveServer('create');
    setCreateChatOpen(true);
  }

  function closeCreateChat() {
    setCreateChatOpen(false);
    if (activeServer === 'create') setActiveServer('home');
  }

  function toggleCreateInvite(userId) {
    setNewChannelInviteIds((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId]
    );
  }

  function addFriend(userId) {
    socketRef.current?.emit('friend:add', { userId }, (response) => {
      if (!response?.ok) {
        setNotice(response?.error ?? 'Could not add friend');
        return;
      }
      setNotice('Friend added');
      setSearchResults((current) => current.map((user) => (user.id === userId ? { ...user, friend: true } : user)));
    });
  }

  function inviteUser(userId) {
    if (!activeChannel) return;
    socketRef.current?.emit('voice:invite', { channelId: activeChannel.id, userId }, (response) => {
      if (!response?.ok) {
        setNotice(response?.error ?? 'Could not invite user');
        return;
      }
      setChannels((current) =>
        current.map((channel) => (channel.id === response.channel.id ? response.channel : channel))
      );
      setNotice('Voice invite sent');
    });
  }

  function dismissVoiceInvite(inviteId) {
    setVoiceInvites((current) => current.filter((invite) => invite.id !== inviteId));
  }

  function acceptVoiceInvite(invite) {
    if (!socketRef.current?.connected) {
      setNotice('Voice server is not connected yet');
      return;
    }

    setNotice(`Joining ${invite.channel.name}`);
    socketRef.current.emit('voice:accept', {
      inviteId: invite.id,
      channelId: invite.channel.id
    }, async (response) => {
      if (!response?.ok) {
        setNotice(response?.error ?? 'Could not accept invite');
        return;
      }

      const channel = response.channel || invite.channel;
      setVoiceInvites((current) => current.filter((item) => item.id !== invite.id));
      setChannels((current) => {
        if (current.some((item) => item.id === channel.id)) {
          return current.map((item) => (item.id === channel.id ? channel : item));
        }
        return [...current, channel];
      });
      setActiveChannelId(channel.id);
      setRightMode('people');
      await loadMessages(channel.id);
      const joined = await joinRoom(channel.id);
      if (!joined) {
        setNotice('Invite accepted. Allow microphone to join the voice room.');
      }
    });
  }

  function saveProfile(event) {
    event.preventDefault();
    socketRef.current?.emit('profile:update', {
      nickname: profileDraft,
      status: statusDraft,
      bio: bioDraft,
      avatar: avatarDraft
    }, (response) => {
      if (!response?.ok) {
        setNotice(response?.error ?? 'Could not save profile');
        return;
      }
      setAuth((current) => ({ ...current, user: response.user }));
      syncProfileDrafts(response.user);
      setNotice('Profile saved');
    });
  }

  function uploadAvatar(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setNotice('Choose an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setNotice('Avatar image must be under 5 MB');
      return;
    }

    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      const maxSize = 360;
      const scale = Math.min(maxSize / image.width, maxSize / image.height, 1);
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      context?.drawImage(image, 0, 0, width, height);
      let dataUrl = canvas.toDataURL('image/webp', 0.82);
      if (dataUrl.length > 220000) {
        dataUrl = canvas.toDataURL('image/jpeg', 0.72);
      }
      URL.revokeObjectURL(objectUrl);
      if (dataUrl.length > 220000) {
        setNotice('Choose a smaller photo');
        return;
      }
      setAvatarDraft(dataUrl);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setNotice('Could not read image');
    };
    image.src = objectUrl;
  }

  async function copyInvite() {
    if (!activeChannel) return;
    const url = `${window.location.origin}?channel=${activeChannel.id}`;
    await navigator.clipboard?.writeText(url);
    setNotice('Invite link copied');
  }

  function handleServerSelect(id) {
    setActiveServer(id);
    if (id === 'friends') setRightMode('friends');
    if (id === 'create') {
      openCreateChat();
    }
    if (id === 'settings') setRightMode('settings');
    if (id === 'home') setRightMode('people');
  }

  if (auth.loading) {
    return <div className="loading-screen">EchoRoom</div>;
  }

  if (!auth.token || !auth.user) {
    return (
      <AuthScreen
        mode={authMode}
        form={authForm}
        error={authError}
        onMode={setAuthMode}
        onForm={setAuthForm}
        onSubmit={submitAuth}
      />
    );
  }

  return (
    <div className="app-shell">
      <ServerRail
        servers={servers}
        activeServer={activeServer}
        onSelect={handleServerSelect}
      />
      <ChannelSidebar
        channels={channels}
        activeChannelId={activeChannelId}
        joinedRoomId={joinedRoomId}
        onChannelSelect={selectChannel}
        notice={notice}
        maxSeats={config.maxVoiceSeats}
        onOpenCreate={openCreateChat}
      />
      <main className="main-panel">
        <RoomHeader
          channel={activeChannel}
          count={activeChannel?.participants ?? 0}
          isFull={channelIsFull}
          onInvite={() => setRightMode('invite')}
          onJoin={() => joinRoom(activeChannelId)}
          onCopyInvite={copyInvite}
          onSettings={() => setRightMode('settings')}
          joined={youInActiveRoom}
        />
        <RoomStage
          participants={joinedRoomId === activeChannelId ? members : []}
          currentSocketId={socketId}
          muted={!controls.mic}
          voiceLevels={voiceLevels}
          isFull={channelIsFull}
          maxSeats={config.maxVoiceSeats}
          joined={youInActiveRoom}
          onJoin={() => joinRoom(activeChannelId)}
          onInvite={() => setRightMode('invite')}
          localStream={localStreamRef.current}
          localMediaRevision={localMediaRevision}
          remoteStreams={remoteStreams}
        />
        <ActivityPanel
          channel={activeChannel}
          playing={controls.music}
          onToggle={() => toggleControl('music')}
          onCopyInvite={copyInvite}
        />
        <ChatPanel
          channel={activeChannel}
          messages={activeMessages}
          draft={draft}
          onDraft={setDraft}
          onSend={sendMessage}
          onQuickInsert={quickInsert}
          inputRef={chatInputRef}
        />
      </main>
      <PeoplePanel
        mode={rightMode}
        currentUser={currentUser}
        friends={friends}
        onlineUsers={onlineUsers}
        searchQuery={searchQuery}
        searchResults={searchResults}
        onSearch={setSearchQuery}
        onAddFriend={addFriend}
        onInvite={inviteUser}
        activeChannel={activeChannel}
        onCopyInvite={copyInvite}
        showInviteCard={showInviteCard}
        onCloseInvite={() => setShowInviteCard(false)}
        profileDraft={profileDraft}
        onProfileDraft={setProfileDraft}
        statusDraft={statusDraft}
        onStatusDraft={setStatusDraft}
        bioDraft={bioDraft}
        onBioDraft={setBioDraft}
        avatarDraft={avatarDraft}
        onAvatarDraft={setAvatarDraft}
        onUploadAvatar={uploadAvatar}
        onSaveProfile={saveProfile}
        onLogout={logout}
      />
        <CallDock
          controls={controls}
          callVolume={callVolume}
          onToggle={toggleControl}
          onVolume={setCallVolume}
          onJoinToggle={handleJoinToggle}
        joined={youInActiveRoom}
        isFull={channelIsFull}
        profile={currentUser}
        activeRoomName={activeChannel?.name ?? 'Channel'}
        onInvite={() => setRightMode('invite')}
        onFocusChat={() => chatInputRef.current?.focus()}
        onSettings={() => setRightMode('settings')}
      />
      <CreateChatModal
        open={createChatOpen}
        name={newChannelName}
        description={newChannelDescription}
        inviteIds={newChannelInviteIds}
        friends={friends}
        onName={setNewChannelName}
        onDescription={setNewChannelDescription}
        onToggleInvite={toggleCreateInvite}
        onSubmit={createChannel}
        onClose={closeCreateChat}
      />
      <VoiceInviteStack
        invites={voiceInvites}
        onAccept={acceptVoiceInvite}
        onDismiss={dismissVoiceInvite}
      />
      <MediaPermissionModal
        issue={mediaIssue}
        onRetry={retryMediaIssue}
        onClose={closeMediaIssue}
        onOpenSafeLink={openMediaSafeLink}
      />
      <RemoteAudio streams={remoteStreams} deafened={!controls.headphones} volume={callVolume} />
    </div>
  );
}

function AuthScreen({ mode, form, error, onMode, onForm, onSubmit }) {
  return (
    <main className="auth-screen">
      <section className="auth-panel">
        <div className="auth-brand">
          <Volume2 size={28} />
          <span>EchoRoom</span>
        </div>
        <h1>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
        <p>Sign in to join real voice rooms, create channels, find friends, and keep your account remembered on this device.</p>
        <form className="auth-form" onSubmit={onSubmit}>
          {mode === 'register' ? (
            <label>
              <span>Nickname</span>
              <input
                value={form.nickname}
                onChange={(event) => onForm((current) => ({ ...current, nickname: event.target.value }))}
                placeholder="your nickname"
                maxLength={24}
              />
            </label>
          ) : null}
          <label>
            <span>Email</span>
            <input
              value={form.email}
              onChange={(event) => onForm((current) => ({ ...current, email: event.target.value }))}
              placeholder="you@example.com"
              type="email"
              autoComplete="email"
            />
          </label>
          <label>
            <span>Password</span>
            <input
              value={form.password}
              onChange={(event) => onForm((current) => ({ ...current, password: event.target.value }))}
              placeholder="6+ characters"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </label>
          {error ? <div className="auth-error">{error}</div> : null}
          <button type="submit">{mode === 'login' ? 'Sign in' : 'Create account'}</button>
        </form>
        <button
          className="auth-switch"
          onClick={() => onMode(mode === 'login' ? 'register' : 'login')}
        >
          {mode === 'login' ? 'Need an account? Register' : 'Already have an account? Sign in'}
        </button>
      </section>
    </main>
  );
}

function ServerRail({ servers, activeServer, onSelect }) {
  return (
    <aside className="server-rail" aria-label="Servers">
      <div className="brand">
        <span className="brand-mark"><Volume2 size={24} /></span>
        <span>EchoRoom</span>
      </div>
      <button className="orb active" aria-label="Explore" onClick={() => onSelect('home')}>
        <Compass size={24} />
      </button>
      <nav className="server-list">
        {servers.map((server) => (
          <button
            key={server.id}
            className={`server-dot ${server.tone} ${activeServer === server.id ? 'selected' : ''}`}
            onClick={() => onSelect(server.id)}
            title={server.label}
            aria-label={server.label}
          >
            <span>{server.mark}</span>
          </button>
        ))}
      </nav>
      <button className="add-server" aria-label="New chat" onClick={() => onSelect('create')}>
        <Plus size={24} />
      </button>
    </aside>
  );
}

function ChannelSidebar({
  channels,
  activeChannelId,
  joinedRoomId,
  onChannelSelect,
  notice,
  maxSeats,
  onOpenCreate
}) {
  return (
    <aside className="channel-sidebar">
      <div className="server-title">
        <div>
          <span className="server-badge">ER</span>
          <strong>EchoRoom</strong>
        </div>
        <div className="title-actions">
          <ChevronDown size={18} />
          <UserPlus size={18} />
        </div>
      </div>

      <SectionTitle label="Chats" />
      <button className="new-channel-card open-create-button" type="button" onClick={onOpenCreate}>
        <span>New chat</span>
        <strong aria-hidden="true">
          <Plus size={17} />
        </strong>
      </button>

      <SectionTitle label="Channels" />
      <div className="room-list">
        {channels.map((channel, index) => {
          const Icon = channelIcons[index % channelIcons.length];
          const full = channel.participants >= maxSeats;
          return (
            <button
              key={channel.id}
              className={`voice-room ${activeChannelId === channel.id ? 'active' : ''} ${full ? 'full' : ''}`}
              onClick={() => onChannelSelect(channel.id)}
            >
              <Icon size={17} />
              <span>
                <strong>{channel.name}</strong>
                {channel.description ? <small>{channel.description}</small> : null}
                <small>{channel.participants}/{maxSeats} in voice · {channel.kind}</small>
              </span>
              {joinedRoomId === channel.id ? <Mic size={14} className="joined-dot" /> : null}
            </button>
          );
        })}
      </div>
      <div className="sidebar-note">
        <Sparkles size={15} />
        <span>{notice}</span>
      </div>
    </aside>
  );
}

function SectionTitle({ label }) {
  return <div className="section-title">{label}</div>;
}

function RoomHeader({ channel, count, isFull, onInvite, onJoin, onCopyInvite, onSettings, joined }) {
  const description = channel?.description || (
    channel?.kind === 'private'
      ? 'Private chat for invited people.'
      : 'Public room for everyone signed in.'
  );

  return (
    <header className="room-header">
      <div className="room-heading">
        <Headphones size={25} />
        <div>
          <h1>{channel?.name ?? 'No channel'}</h1>
          <p>{description}</p>
        </div>
      </div>
      <div className="room-actions">
        <button className={`seat-counter ${isFull ? 'full' : ''}`} title="Voice seats">
          <Users size={17} />
          <span>{count}/{MAX_VOICE_SEATS}</span>
        </button>
        <button className="header-button join-action" onClick={onJoin} disabled={joined || isFull || !channel}>
          <Mic size={17} />
          <span>{joined ? 'Live' : isFull ? 'Full' : 'Join'}</span>
        </button>
        <button className="header-button" onClick={onInvite} disabled={!channel}>
          <UserPlus size={17} />
          <span>Invite</span>
        </button>
        <button className="icon-frame" onClick={onCopyInvite} aria-label="Copy link" disabled={!channel}>
          <Link2 size={18} />
        </button>
        <button className="icon-frame" onClick={onSettings} aria-label="Settings">
          <Settings size={18} />
        </button>
      </div>
    </header>
  );
}

function RoomStage({
  participants,
  currentSocketId,
  muted,
  voiceLevels,
  isFull,
  maxSeats,
  joined,
  onJoin,
  onInvite,
  localStream,
  localMediaRevision,
  remoteStreams
}) {
  const emptySeats = Math.max(maxSeats - participants.length, 0);
  const rowRemainder = participants.length % 3;
  const rowFill = rowRemainder === 0 ? 0 : 3 - rowRemainder;
  const visibleEmptySeats = participants.length ? Math.min(emptySeats, rowFill) : Math.min(emptySeats, 6);
  const videoTiles = buildVideoTiles(participants, currentSocketId, localStream, remoteStreams, localMediaRevision);
  return (
    <section className="room-stage" aria-label="Voice participants">
      <div className="participant-grid">
        {participants.map((person, index) => (
          <ParticipantCard
            key={person.socketId}
            person={person}
            muted={(muted && person.socketId === currentSocketId) || person.muted}
            voiceLevel={person.socketId === currentSocketId ? voiceLevels.local ?? 0 : voiceLevels[person.socketId] ?? 0}
            index={index}
            you={person.socketId === currentSocketId}
          />
        ))}
        {Array.from({ length: visibleEmptySeats }, (_, index) => (
          <button
            className={`empty-seat ${joined ? 'invite-seat' : ''}`}
            key={`empty-${index}`}
            onClick={joined ? onInvite : onJoin}
            disabled={isFull}
            type="button"
          >
            {joined ? <UserPlus size={22} /> : <CirclePlus size={22} />}
            <span>{joined ? 'Invite friend' : 'Join to talk'}</span>
          </button>
        ))}
      </div>
      <VideoStrip tiles={videoTiles} />
      <div className="voice-actions-row">
        <button type="button" onClick={onInvite}>
          <UserPlus size={17} />
          <span>Invite friend</span>
        </button>
      </div>
      <div className={`capacity-strip ${isFull ? 'full' : ''}`}>
        <Shield size={16} />
        <span>
          {isFull
            ? 'Room is full: 10 people connected'
            : `${emptySeats} seats available in this voice room`}
        </span>
      </div>
    </section>
  );
}

function VideoStrip({ tiles }) {
  if (!tiles.length) return null;
  return (
    <div className="video-strip" aria-label="Live video">
      {tiles.map((tile) => (
        <article className="video-tile" key={tile.key}>
          <VideoSink stream={tile.stream} muted={tile.muted} />
          <div className="video-label">
            <strong>{tile.name}</strong>
            <span>{tile.label}</span>
          </div>
        </article>
      ))}
    </div>
  );
}

function AvatarBadge({ user, size = 'small', status }) {
  const name = user?.nickname || user?.name || '';
  const tone = user?.tone || 'cyan';
  return (
    <span className={`avatar-badge ${size} ${tone}`}>
      {user?.avatar ? <img src={user.avatar} alt="" /> : <span>{initials(name)}</span>}
      {status ? <i className={`status ${status}`} /> : null}
    </span>
  );
}

function ParticipantCard({ person, muted, voiceLevel, index, you }) {
  const activeLevel = muted ? 0 : Math.max(0, Math.min(1, voiceLevel));
  const speaking = activeLevel > 0.05;
  const ring = speaking ? Math.min(96, Math.round(activeLevel * 96)) : 0;
  return (
    <article className={`participant-card ${person.tone} ${speaking ? 'speaking' : ''}`}>
      <div className="avatar-wrap" style={{ '--level': `${Math.min(ring, 96)}%` }}>
        <AvatarBadge user={{ ...person, nickname: person.name }} size="voice" />
      </div>
      <VoiceBars level={activeLevel} muted={muted} />
      <div className="participant-meta">
        <strong>{person.name}</strong>
        {you ? <span className="crown">You</span> : null}
      </div>
      <p className="participant-status">{person.status || 'Online'}</p>
      <span className={`mic-state ${muted ? 'off' : 'on'}`}>
        {muted ? <MicOff size={17} /> : <Mic size={17} />}
      </span>
    </article>
  );
}

function VoiceBars({ level, muted }) {
  const bars = [0.35, 0.7, 1, 0.62, 0.42];
  const cleanLevel = muted ? 0 : Math.max(0, Math.min(1, level));
  return (
    <div className={`voice-bars ${muted ? 'muted' : ''}`} aria-label="Voice level">
      {bars.map((weight, index) => (
        <span
          key={index}
          style={{
            '--bar': `${Math.round(cleanLevel * weight * 100)}%`,
            '--bar-opacity': cleanLevel > 0.03 ? 1 : 0
          }}
        />
      ))}
    </div>
  );
}

function ActivityPanel({ channel, playing, onToggle, onCopyInvite }) {
  return (
    <section className="music-panel">
      <div className="cover-art">
        <Music2 size={24} />
      </div>
      <div className="track-info">
        <span><Bell size={14} /> Channel Status</span>
        <strong>{channel ? `${channel.name} is ready` : 'Choose a channel'}</strong>
        <small>{playing ? 'Focus sound enabled' : 'No shared audio playing'}</small>
        <div className="progress-line">
          <i style={{ width: playing ? '64%' : '18%' }} />
        </div>
      </div>
      <div className="track-host">Members <strong>{channel?.members ?? 0}</strong></div>
      <div className="player-controls">
        <button aria-label="Copy invite" onClick={onCopyInvite}><Clipboard size={17} /></button>
        <button className="play" aria-label="Toggle focus sound" onClick={onToggle}>
          <Volume2 size={18} />
        </button>
        <button aria-label="Channel spark" onClick={onToggle}><Sparkles size={17} /></button>
        <div className="volume">
          <Volume2 size={17} />
          <span />
        </div>
      </div>
    </section>
  );
}

function ChatPanel({ channel, messages, draft, onDraft, onSend, onQuickInsert, inputRef }) {
  return (
    <section className="chat-panel">
      <div className="chat-stream">
        {messages.length ? (
          messages.slice(-8).map((message) => (
            <div className="chat-message" key={message.id}>
              <AvatarBadge user={{ nickname: message.author, tone: message.tone, avatar: message.avatar }} />
              <div>
                <div className="chat-line">
                  <strong>{message.author}</strong>
                  <span>{message.time}</span>
                </div>
                <p>{message.body}</p>
              </div>
            </div>
          ))
        ) : (
          <div className="empty-chat">
            <MessageCircle size={24} />
            <span>No messages yet</span>
          </div>
        )}
      </div>
      <form className="composer" onSubmit={onSend}>
        <input
          ref={inputRef}
          value={draft}
          onChange={(event) => onDraft(event.target.value)}
          placeholder={channel ? `Message #${channel.name}` : 'Choose a channel'}
          aria-label="Message channel"
          disabled={!channel}
        />
        <button type="button" aria-label="Gift" onClick={() => onQuickInsert('thanks')}>
          <Gift size={20} />
        </button>
        <button type="button" aria-label="Magic" onClick={() => onQuickInsert('✨')}>
          <WandSparkles size={19} />
        </button>
        <button type="button" aria-label="Emoji" onClick={() => onQuickInsert(':)')}>
          <Smile size={20} />
        </button>
        <button type="submit" aria-label="Send" disabled={!draft.trim() || !channel}>
          <Send size={19} />
        </button>
      </form>
    </section>
  );
}

function PeoplePanel({
  mode,
  currentUser,
  friends,
  onlineUsers,
  searchQuery,
  searchResults,
  onSearch,
  onAddFriend,
  onInvite,
  activeChannel,
  onCopyInvite,
  showInviteCard,
  onCloseInvite,
  profileDraft,
  onProfileDraft,
  statusDraft,
  onStatusDraft,
  bioDraft,
  onBioDraft,
  avatarDraft,
  onAvatarDraft,
  onUploadAvatar,
  onSaveProfile,
  onLogout
}) {
  const visibleUsers = mode === 'friends' ? friends : onlineUsers;
  return (
    <aside className="friend-panel">
      <div className="search-row">
        <div className="search-box">
          <Search size={20} />
          <input
            value={searchQuery}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Search by nickname"
            aria-label="Search people"
          />
        </div>
        <button aria-label="Show friends" onClick={() => onSearch('')}>
          <SlidersHorizontal size={19} />
        </button>
      </div>

      {searchQuery.trim().length >= 2 ? (
        <PanelList
          title={`Search - ${searchResults.length}`}
          users={searchResults}
          empty="No people found"
          onAddFriend={onAddFriend}
          onInvite={onInvite}
          activeChannel={activeChannel}
        />
      ) : null}

      {mode === 'settings' ? (
        <SettingsCard
          currentUser={currentUser}
          profileDraft={profileDraft}
          onProfileDraft={onProfileDraft}
          statusDraft={statusDraft}
          onStatusDraft={onStatusDraft}
          bioDraft={bioDraft}
          onBioDraft={onBioDraft}
          avatarDraft={avatarDraft}
          onAvatarDraft={onAvatarDraft}
          onUploadAvatar={onUploadAvatar}
          onSaveProfile={onSaveProfile}
          onLogout={onLogout}
        />
      ) : null}

      {mode === 'invite' ? (
        <PanelList
          title={`Invite to ${activeChannel?.name ?? 'channel'}`}
          users={friends}
          empty="Add friends first"
          onAddFriend={onAddFriend}
          onInvite={onInvite}
          activeChannel={activeChannel}
          inviteOnly
        />
      ) : null}

      {mode !== 'settings' && mode !== 'invite' && searchQuery.trim().length < 2 ? (
        <PanelList
          title={mode === 'friends' ? `Friends - ${friends.length}` : `Online - ${onlineUsers.length}`}
          users={visibleUsers}
          empty={mode === 'friends' ? 'No friends yet' : 'Nobody else online'}
          onAddFriend={onAddFriend}
          onInvite={onInvite}
          activeChannel={activeChannel}
        />
      ) : null}

      {showInviteCard ? (
        <div className="invite-card">
          <button className="close-card" aria-label="Close" onClick={onCloseInvite}>
            <X size={16} />
          </button>
          <div>
            <strong>Invite real friends</strong>
            <p>Copy the channel link or search their nickname.</p>
          </div>
          <button className="invite-button" onClick={onCopyInvite} disabled={!activeChannel}>
            <span>Copy Link</span>
            <Link2 size={17} />
          </button>
        </div>
      ) : null}
    </aside>
  );
}

function PanelList({ title, users, empty, onAddFriend, onInvite, activeChannel, inviteOnly }) {
  return (
    <>
      <div className="online-title">{title}</div>
      <div className="friend-list">
        {users.length ? users.map((user) => (
          <div className="friend-row action-row" key={user.id}>
            <AvatarBadge user={user} status={user.online ? 'online' : 'idle'} />
            <div>
              <strong>{user.nickname}</strong>
              <span>{user.status || (user.online ? 'Online' : 'Offline')}</span>
            </div>
            <div className="row-actions">
              {!inviteOnly ? (
                <button onClick={() => onAddFriend(user.id)} title="Add friend" disabled={user.friend}>
                  {user.friend ? <Check size={15} /> : <UserPlus size={15} />}
                </button>
              ) : null}
              <button onClick={() => onInvite(user.id)} title="Invite to voice" disabled={!activeChannel}>
                <Plus size={15} />
              </button>
            </div>
          </div>
        )) : (
          <div className="empty-list">{empty}</div>
        )}
      </div>
    </>
  );
}

function SettingsCard({
  currentUser,
  profileDraft,
  onProfileDraft,
  statusDraft,
  onStatusDraft,
  bioDraft,
  onBioDraft,
  avatarDraft,
  onAvatarDraft,
  onUploadAvatar,
  onSaveProfile,
  onLogout
}) {
  return (
    <div className="settings-card">
      <div className="online-title">Account</div>
      <div className="profile-editor-head">
        <AvatarBadge user={{ ...currentUser, nickname: profileDraft, avatar: avatarDraft }} size="large" />
        <div>
          <strong>{profileDraft || currentUser.nickname}</strong>
          <span>{statusDraft || 'Online'}</span>
        </div>
      </div>
      <div className="account-email">{currentUser.email}</div>
      <form className="profile-form" onSubmit={onSaveProfile}>
        <label className="avatar-upload">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => onUploadAvatar(event.target.files?.[0])}
          />
          <Upload size={16} />
          <span>Upload photo</span>
        </label>
        {avatarDraft ? (
          <button className="clear-avatar" type="button" onClick={() => onAvatarDraft('')}>
            Remove photo
          </button>
        ) : null}
        <label className="settings-field">
          <span>Display name</span>
          <input
            value={profileDraft}
            onChange={(event) => onProfileDraft(event.target.value)}
            maxLength={24}
            aria-label="Display name"
          />
        </label>
        <label className="settings-field">
          <span>Status</span>
          <input
            value={statusDraft}
            onChange={(event) => onStatusDraft(event.target.value)}
            maxLength={40}
            placeholder="Online, studying, gaming..."
            aria-label="Status"
          />
        </label>
        <label className="settings-field">
          <span>Description</span>
          <textarea
            value={bioDraft}
            onChange={(event) => onBioDraft(event.target.value)}
            maxLength={160}
            placeholder="A short note about you"
            rows={3}
            aria-label="Profile description"
          />
        </label>
        <button className="save-profile" type="submit">Save profile</button>
      </form>
      <button className="logout-button" onClick={onLogout}>
        <LogOut size={16} />
        <span>Log out</span>
      </button>
    </div>
  );
}

function CreateChatModal({
  open,
  name,
  description,
  inviteIds,
  friends,
  onName,
  onDescription,
  onToggleInvite,
  onSubmit,
  onClose
}) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="create-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-chat-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <span>Private chat</span>
            <h2 id="create-chat-title">Create new chat</h2>
          </div>
          <button className="icon-frame" type="button" onClick={onClose} aria-label="Close create chat">
            <X size={18} />
          </button>
        </div>

        <form className="modal-form" onSubmit={onSubmit}>
          <label className="form-field">
            <span>Name</span>
            <input
              value={name}
              onChange={(event) => onName(event.target.value)}
              maxLength={32}
              placeholder="Evening call"
              autoFocus
              required
            />
          </label>

          <label className="form-field">
            <span>Description</span>
            <textarea
              value={description}
              onChange={(event) => onDescription(event.target.value)}
              maxLength={120}
              placeholder="What is this chat for?"
              rows={3}
            />
          </label>

          <div className="invite-picker">
            <div>
              <span>Add people</span>
              <small>{friends.length ? 'Choose friends now, or invite more later.' : 'Add friends first, then invite them here.'}</small>
            </div>
            {friends.length ? (
              <div className="invite-options">
                {friends.map((friend) => {
                  const selected = inviteIds.includes(friend.id);
                  return (
                    <button
                      className={`invite-option ${selected ? 'selected' : ''}`}
                      key={friend.id}
                      type="button"
                      onClick={() => onToggleInvite(friend.id)}
                    >
                      <AvatarBadge user={friend} />
                      <strong>{friend.nickname}</strong>
                      {selected ? <Check size={16} /> : <Plus size={16} />}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="modal-actions">
            <button type="button" onClick={onClose}>Cancel</button>
            <button className="primary" type="submit" disabled={name.trim().length < 2}>
              Create chat
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function VoiceInviteStack({ invites, onAccept, onDismiss }) {
  if (!invites.length) return null;
  return (
    <div className="voice-invite-stack" aria-live="polite">
      {invites.map((invite) => (
        <article className="voice-invite" key={invite.id}>
          <button className="close-card" type="button" aria-label="Dismiss invite" onClick={() => onDismiss(invite.id)}>
            <X size={15} />
          </button>
          <AvatarBadge user={invite.from} />
          <div>
            <strong>{invite.from.nickname}</strong>
            <span>invited you to {invite.channel.name}</span>
          </div>
          <button className="invite-button" type="button" onClick={() => onAccept(invite)}>
            <span>Join voice</span>
            <Mic size={16} />
          </button>
        </article>
      ))}
    </div>
  );
}

function MediaPermissionModal({ issue, onRetry, onClose, onOpenSafeLink }) {
  if (!issue) return null;

  const isScreen = issue.kind === 'screen';
  const host = issue.host || 'this site';
  return (
    <div className="modal-backdrop media-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="create-modal media-permission-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="media-permission-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <span>{isScreen ? 'Screen share' : 'Camera'}</span>
            <h2 id="media-permission-title">{issue.title}</h2>
          </div>
          <button className="icon-frame" type="button" onClick={onClose} aria-label="Close permission help">
            <X size={18} />
          </button>
        </div>
        <div className="permission-body">
          <p>{issue.message}</p>
          <div className="permission-steps">
            <div><strong>1</strong><span>Click the icon near the address bar for {host}.</span></div>
            <div><strong>2</strong><span>Set {isScreen ? 'Screen sharing' : 'Camera'} to Allow.</span></div>
            <div><strong>3</strong><span>Press Try again and choose what to share.</span></div>
          </div>
          {issue.safeUrl ? (
            <button className="safe-link-button" type="button" onClick={onOpenSafeLink}>
              <Link2 size={16} />
              <span>Open localhost link</span>
            </button>
          ) : null}
          <p className="permission-note">
            In the Codex in-app browser, camera or screen capture can be blocked by the shell. If it still says Permission denied, open the same localhost link in Chrome or Edge.
          </p>
          <div className="modal-actions">
            <button type="button" onClick={onClose}>Close</button>
            <button className="primary" type="button" onClick={onRetry}>Try again</button>
          </div>
        </div>
      </section>
    </div>
  );
}

function CallDock({
  controls,
  callVolume,
  onToggle,
  onVolume,
  onJoinToggle,
  joined,
  isFull,
  profile,
  activeRoomName,
  onInvite,
  onFocusChat,
  onSettings
}) {
  return (
    <footer className="call-dock">
      <div className="profile-chip">
        <AvatarBadge user={profile} status="online" />
        <div>
          <strong>{profile.nickname}</strong>
          <span>{joined ? activeRoomName : profile.status || 'Not in call'}</span>
        </div>
      </div>
      <div className="quick-icons">
        <DockButton label="Mic" active={controls.mic} onClick={() => onToggle('mic')} icon={controls.mic ? Mic : MicOff} />
        <DockButton label="Headphones" active={controls.headphones} onClick={() => onToggle('headphones')} icon={controls.headphones ? Headphones : VolumeX} />
        <DockButton label="Settings" active onClick={onSettings} icon={Settings} />
      </div>
      <div className="call-controls">
        <DockButton label="Mute" primary active={controls.mic} onClick={() => onToggle('mic')} icon={controls.mic ? Mic : MicOff} />
        <DockButton label="Deafen" active={controls.headphones} onClick={() => onToggle('headphones')} icon={controls.headphones ? Headphones : VolumeX} />
        <DockButton label="Share" active={controls.screen} onClick={() => onToggle('screen')} icon={MonitorUp} />
        <DockButton label="Camera" active={controls.camera} onClick={() => onToggle('camera')} icon={Camera} />
        <label className="dock-volume" title="Call volume boost">
          <Volume2 size={18} />
          <input
            type="range"
            min="100"
            max="600"
            step="10"
            value={callVolume}
            onChange={(event) => onVolume(Number(event.target.value))}
            aria-label="Call volume"
          />
          <span>{callVolume}%</span>
        </label>
        <button
          className={`leave-button ${!joined ? 'join' : ''}`}
          onClick={onJoinToggle}
          disabled={!joined && isFull}
        >
          {joined ? <PhoneOff size={24} /> : <Mic size={23} />}
          <span>{joined ? 'Leave' : 'Join'}</span>
        </button>
      </div>
      <div className="dock-actions">
        <button aria-label="Invite" onClick={onInvite}><UserPlus size={22} /></button>
        <button aria-label="Messages" onClick={onFocusChat}><MessageCircle size={22} /><i /></button>
        <button aria-label="Settings" onClick={onSettings}><SlidersHorizontal size={22} /></button>
      </div>
    </footer>
  );
}

function DockButton({ icon: Icon, label, active, primary, onClick }) {
  return (
    <button
      className={`dock-button ${active ? 'active' : 'muted'} ${primary ? 'primary' : ''}`}
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      <Icon size={22} />
    </button>
  );
}

function RemoteAudio({ streams, deafened, volume }) {
  return (
    <div className="remote-audio" aria-hidden="true">
      {Object.entries(streams).map(([peerId, stream]) => (
        <AudioSink key={peerId} stream={stream} muted={deafened} volume={volume} />
      ))}
    </div>
  );
}

function AudioSink({ stream, muted, volume }) {
  const ref = useRef(null);
  const gainRef = useRef(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (node.srcObject !== stream) {
      node.srcObject = stream;
    }
    node.volume = muted ? 0 : 1;
    node.muted = muted || Boolean(gainRef.current);
    node.play().catch(() => {});
  }, [stream, muted, volume]);

  useEffect(() => {
    if (gainRef.current) {
      gainRef.current.gain.value = remoteGainValue(volume);
    }
    if (ref.current) {
      ref.current.muted = muted || Boolean(gainRef.current);
    }
  }, [muted, volume]);

  useEffect(() => {
    const node = ref.current;
    if (!node || !stream || muted) return undefined;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return undefined;

    let context;
    let source;
    let gain;
    let compressor;
    try {
      context = new AudioContextClass();
      source = context.createMediaStreamSource(stream);
      gain = context.createGain();
      compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -28;
      compressor.knee.value = 24;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.18;
      gain.gain.value = remoteGainValue(volume);
      source.connect(gain);
      gain.connect(compressor);
      compressor.connect(context.destination);
      gainRef.current = gain;
      node.muted = true;
      context.resume().catch(() => {});
    } catch {
      node.muted = muted;
      return undefined;
    }

    return () => {
      gainRef.current = null;
      try {
        source.disconnect();
        gain.disconnect();
        compressor.disconnect();
      } catch {}
      context.close().catch(() => {});
      if (node) node.muted = muted;
    };
  }, [stream, muted]);

  return <audio ref={ref} autoPlay playsInline />;
}

function VideoSink({ stream, muted }) {
  const ref = useRef(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (node.srcObject !== stream) {
      node.srcObject = stream;
    }
    node.play().catch(() => {});
  }, [stream]);

  return <video ref={ref} autoPlay playsInline muted={muted} />;
}

function buildVideoTiles(participants, currentSocketId, localStream, remoteStreams, _revision) {
  const currentMember = participants.find((person) => person.socketId === currentSocketId);
  const tiles = videoTilesFromStream({
    keyPrefix: 'local',
    name: currentMember ? `${currentMember.name} (you)` : 'You',
    stream: localStream,
    muted: true
  });

  for (const person of participants) {
    if (person.socketId === currentSocketId) continue;
    tiles.push(...videoTilesFromStream({
      keyPrefix: person.socketId,
      name: person.name,
      stream: remoteStreams[person.socketId],
      muted: false
    }));
  }

  return tiles;
}

function videoTilesFromStream({ keyPrefix, name, stream, muted }) {
  if (!stream) return [];
  return stream.getVideoTracks()
    .filter((track) => track.readyState === 'live')
    .map((track, index) => ({
      key: `${keyPrefix}-${track.id}`,
      name,
      label: videoTrackLabel(track, index),
      stream: new MediaStream([track]),
      muted
    }));
}

function videoTrackLabel(track, index) {
  const label = `${track.label || ''}`.toLowerCase();
  if (label.includes('screen') || label.includes('window') || label.includes('display')) return 'Screen';
  if (label.includes('camera') || label.includes('webcam') || label.includes('cam')) return 'Camera';
  return index === 0 ? 'Video' : `Video ${index + 1}`;
}

async function api(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

function initials(name = '') {
  return name
    .replace(/[^a-z0-9 ]/gi, '')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || name.slice(0, 2).toUpperCase() || 'U';
}

function remoteGainValue(volume) {
  const normalized = Math.max(0, Number(volume) || 0) / 100;
  return Math.min(12, normalized * 1.85);
}

function isLocalHost() {
  if (typeof window === 'undefined') return false;
  return ['localhost', '127.0.0.1', '0.0.0.0'].includes(window.location.hostname);
}

createRoot(document.getElementById('root')).render(<App />);
