import { randomUUID } from 'node:crypto';
import { isUuid, normalizeMessage, validateModerationMinutes, validateUsername } from '../lib/validation.js';

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = String(process.env.SUPABASE_PUBLISHABLE_KEY || '');
const MEDIA_BUCKET = 'coldchat-media';

function requireConfig() {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Server configuration is incomplete.');
}

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(data));
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    try { out[key] = decodeURIComponent(part.slice(i + 1).trim()); }
    catch { out[key] = part.slice(i + 1).trim(); }
  }
  return out;
}

function setSessionCookies(res, session) {
  const secure = `; Path=/; HttpOnly; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
  const maxAge = Math.max(60, Number(session.expires_in || 3600));
  res.setHeader('set-cookie', [
    `cc_access=${encodeURIComponent(session.access_token)}; Max-Age=${maxAge}${secure}`,
    `cc_refresh=${encodeURIComponent(session.refresh_token || '')}; Max-Age=2592000${secure}`,
  ]);
}

function clearSessionCookies(res) {
  res.setHeader('set-cookie', [
    'cc_access=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
    'cc_refresh=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
  ]);
}

async function readBodyBuffer(req, maxBytes = 6 * 1024 * 1024) {
  if (Buffer.isBuffer(req.body)) {
    if (req.body.length > maxBytes) throw new Error('File is too large.');
    return req.body;
  }
  if (typeof req.body === 'string') {
    const b = Buffer.from(req.body, 'binary');
    if (b.length > maxBytes) throw new Error('File is too large.');
    return b;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const b = Buffer.from(chunk);
    size += b.length;
    if (size > maxBytes) throw new Error('File is too large.');
    chunks.push(b);
  }
  return Buffer.concat(chunks);
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const body = await readBodyBuffer(req, 1024 * 1024);
  if (!body.length) return {};
  try { return JSON.parse(body.toString('utf8')); } catch { return {}; }
}

async function parseMultipartFile(req, fieldName, maxBytes) {
  const contentType = String(req.headers['content-type'] || '');
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!match) throw new Error('Invalid upload.');
  const boundary = match[1] || match[2];
  const body = await readBodyBuffer(req, maxBytes + 512 * 1024);
  const needle = Buffer.from(`name="${fieldName}"`);
  const fieldAt = body.indexOf(needle);
  if (fieldAt < 0) throw new Error('File is missing.');
  const headerStart = body.lastIndexOf(Buffer.from(`--${boundary}`), fieldAt);
  const headerEndMarker = Buffer.from('\r\n\r\n');
  const headerEnd = body.indexOf(headerEndMarker, fieldAt);
  if (headerStart < 0 || headerEnd < 0) throw new Error('Invalid upload.');
  const dataStart = headerEnd + headerEndMarker.length;
  const dataEnd = body.indexOf(Buffer.from(`\r\n--${boundary}`), dataStart);
  if (dataEnd < 0) throw new Error('Invalid upload.');
  const headers = body.slice(headerStart, headerEnd).toString('utf8');
  const filename = (headers.match(/filename="([^"]*)"/i)?.[1] || 'upload').replace(/[\\/]/g, '_');
  const type = headers.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim().toLowerCase() || 'application/octet-stream';
  const data = body.slice(dataStart, dataEnd);
  if (!data.length) throw new Error('File is empty.');
  if (data.length > maxBytes) throw new Error('File is too large.');
  return { filename, type, data };
}

async function supa(path, { method = 'GET', token, body, headers = {} } = {}) {
  requireConfig();
  const h = { apikey: SUPABASE_KEY, ...headers };
  if (token) h.authorization = `Bearer ${token}`;
  let payload;
  if (body !== undefined) {
    if (Buffer.isBuffer(body) || typeof body === 'string' || body instanceof Uint8Array) {
      payload = body;
    } else {
      if (!h['content-type']) h['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }
  }
  return fetch(`${SUPABASE_URL}${path}`, { method, headers: h, body: payload });
}

async function refreshSession(req, res) {
  const cookies = parseCookies(req);
  if (!cookies.cc_refresh) return null;
  const r = await supa('/auth/v1/token?grant_type=refresh_token', {
    method: 'POST', body: { refresh_token: cookies.cc_refresh }, headers: { 'content-type': 'application/json' },
  });
  if (!r.ok) {
    clearSessionCookies(res);
    return null;
  }
  const session = await r.json();
  setSessionCookies(res, session);
  return session;
}

async function getSession(req, res) {
  const cookies = parseCookies(req);
  let access = cookies.cc_access;
  if (access) {
    const u = await supa('/auth/v1/user', { token: access });
    if (u.ok) return { access, user: await u.json() };
  }
  const refreshed = await refreshSession(req, res);
  if (!refreshed?.access_token) {
    clearSessionCookies(res);
    return null;
  }
  const u = await supa('/auth/v1/user', { token: refreshed.access_token });
  if (!u.ok) {
    clearSessionCookies(res);
    return null;
  }
  return { access: refreshed.access_token, user: await u.json() };
}

async function rest(path, { method = 'GET', token, body, prefer, headers = {} } = {}) {
  const h = { ...headers };
  if (prefer) h.prefer = prefer;
  return supa(`/rest/v1/${path}`, { method, token, body, headers: h });
}

async function rpc(name, args, token) {
  return rest(`rpc/${name}`, { method: 'POST', token, body: args });
}

function mediaUrl(key) {
  if (!key) return null;
  const encoded = String(key).split('/').map(encodeURIComponent).join('/');
  return `${SUPABASE_URL}/storage/v1/object/public/${MEDIA_BUCKET}/${encoded}`;
}

function initials(name) {
  return Array.from(name || 'U').slice(0, 2).join('').toUpperCase();
}

function clock(iso) {
  try { return new Date(iso).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}

function mapProfile(p) {
  if (!p) return null;
  return {
    id: p.id,
    email: p.email,
    username: p.username,
    name: p.username,
    initials: initials(p.username),
    avatarUrl: mediaUrl(p.avatar_key),
    nameColor: p.name_color || '#74e9ff',
    accent: p.accent || 'ice',
    role: p.role || 'member',
    createdAt: p.created_at,
  };
}

function mapPerson(p, restriction = null) {
  return {
    id: p.id,
    name: p.username,
    username: p.username,
    initials: initials(p.username),
    avatarUrl: mediaUrl(p.avatar_key),
    nameColor: p.name_color || '#74e9ff',
    accent: p.accent || 'ice',
    role: p.role || 'member',
    restriction,
  };
}

async function ownProfile(session) {
  if (!session?.user?.id) return null;
  const r = await rest(`profiles?auth_user_id=eq.${encodeURIComponent(session.user.id)}&select=*`, { token: session.access });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows[0] || null;
}

async function profilesByIds(ids, token) {
  const uniq = [...new Set(ids.filter(Boolean).map(Number).filter(Number.isFinite))];
  if (!uniq.length) return new Map();
  const r = await rest(`profiles?id=in.(${uniq.join(',')})&select=*`, { token });
  if (!r.ok) return new Map();
  const rows = await r.json();
  return new Map(rows.map(p => [String(p.id), p]));
}

async function activeRestriction(session, profile) {
  if (!session || !profile) return null;
  const r = await rest(`bans?profile_id=eq.${profile.id}&active=eq.true&select=*&order=created_at.desc`, { token: session.access });
  if (!r.ok) return null;
  const now = Date.now();
  const rows = await r.json();
  const permanent = rows.find(x => !x.expires_at);
  if (permanent) return { type: 'ban', expiresAt: null, reason: permanent.reason || '' };
  const timeout = rows.find(x => x.expires_at && new Date(x.expires_at).getTime() > now);
  if (timeout) return { type: 'timeout', expiresAt: timeout.expires_at, reason: timeout.reason || '' };
  return null;
}

function restrictionMessage(r, includeTimeout = true) {
  if (!r) return null;
  if (r.type === 'ban') return 'You are banned from ColdChat.';
  if (includeTimeout && r.type === 'timeout') return `You are timed out until ${new Date(r.expiresAt).toLocaleString()}.`;
  return null;
}

async function uploadMedia(session, key, file) {
  const encoded = key.split('/').map(encodeURIComponent).join('/');
  const r = await supa(`/storage/v1/object/${MEDIA_BUCKET}/${encoded}`, {
    method: 'POST', token: session.access, body: file.data,
    headers: { 'content-type': file.type, 'x-upsert': 'false', 'cache-control': '3600' },
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d.message || d.error || 'Upload failed.');
  }
  return key;
}

function extensionFor(type, fallback = 'bin') {
  const map = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif',
    'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav',
  };
  return map[type] || fallback;
}

async function handleAuth(req, res, path) {
  if (path === 'auth/me' && req.method === 'GET') {
    const session = await getSession(req, res);
    if (!session) return json(res, 200, { authUser: null });
    return json(res, 200, { authUser: { id: session.user.id, email: session.user.email } });
  }
  if (path === 'auth/logout' && req.method === 'POST') {
    const access = parseCookies(req).cc_access;
    if (access) await supa('/auth/v1/logout', { method: 'POST', token: access }).catch(() => null);
    clearSessionCookies(res);
    return json(res, 200, { ok: true });
  }
  if (path === 'auth/login' && req.method === 'POST') {
    const b = await readJson(req);
    const email = String(b.email || '').trim().toLowerCase();
    const password = String(b.password || '');
    const mode = b.mode === 'signup' ? 'signup' : 'signin';
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!validEmail || password.length < 8) return json(res, 400, { error: 'Enter a valid email and a password with at least 8 characters.' });
    const endpoint = mode === 'signup' ? '/auth/v1/signup' : '/auth/v1/token?grant_type=password';
    const r = await supa(endpoint, { method: 'POST', body: { email, password }, headers: { 'content-type': 'application/json' } });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return json(res, r.status, { error: data.msg || data.error_description || data.message || 'Authentication failed.' });
    if (data.access_token) setSessionCookies(res, data);
    return json(res, 200, {
      ok: true,
      authUser: data.user ? { id: data.user.id, email: data.user.email } : null,
      needsConfirmation: mode === 'signup' && !data.access_token,
    });
  }
  return false;
}

async function handleProfileAvatar(req, res, path) {
  if (path !== 'profile/avatar') return false;
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
  const session = await getSession(req, res);
  const profile = session ? await ownProfile(session) : null;
  if (!session || !profile) return json(res, 401, { error: 'Sign in first.' });
  try {
    const file = await parseMultipartFile(req, 'avatar', 5 * 1024 * 1024);
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return json(res, 400, { error: 'Use a PNG, JPEG or WebP image.' });
    const key = `avatars/${profile.id}/${Date.now()}-${randomUUID()}.${extensionFor(file.type, 'img')}`;
    await uploadMedia(session, key, file);
    const r = await rest(`profiles?id=eq.${profile.id}&select=*`, {
      method: 'PATCH', token: session.access, body: { avatar_key: key }, prefer: 'return=representation',
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return json(res, r.status, { error: data.message || 'Could not save avatar.' });
    return json(res, 200, { profile: mapProfile(data[0]) });
  } catch (e) {
    return json(res, 400, { error: e.message || 'Avatar upload failed.' });
  }
}

async function handleProfile(req, res, path) {
  if (path !== 'profile') return false;
  const session = await getSession(req, res);
  if (!session) return json(res, 401, { error: 'Unauthorized', profile: null });
  if (req.method === 'GET') return json(res, 200, { profile: mapProfile(await ownProfile(session)) });

  const b = await readJson(req);
  if (req.method === 'POST') {
    const existing = await ownProfile(session);
    if (existing) return json(res, 200, { profile: mapProfile(existing) });
    const username = String(b.username || '').normalize('NFKC').slice(0, 80);
    const usernameError = validateUsername(username);
    if (usernameError) return json(res, 400, { error: usernameError });
    const row = {
      auth_user_id: session.user.id,
      email: session.user.email,
      username,
      username_key: username.toLocaleLowerCase(),
      name_color: /^#[0-9a-fA-F]{6}$/.test(b.nameColor || '') ? b.nameColor : '#74e9ff',
      accent: 'ice',
    };
    const r = await rest('profiles?select=*', { method: 'POST', token: session.access, body: row, prefer: 'return=representation' });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return json(res, r.status, { error: data.code === '23505' ? 'That username is already taken.' : (data.message || 'Could not create profile.') });
    return json(res, 200, { profile: mapProfile(data[0]) });
  }

  if (req.method === 'PATCH') {
    const p = await ownProfile(session);
    if (!p) return json(res, 404, { error: 'Profile not found.' });
    const patch = {};
    if (/^#[0-9a-fA-F]{6}$/.test(b.nameColor || '')) patch.name_color = b.nameColor;
    if (b.username && p.role === 'owner') {
      const username = String(b.username).normalize('NFKC').slice(0, 80);
      const usernameError = validateUsername(username);
      if (usernameError) return json(res, 400, { error: usernameError });
      patch.username = username;
      patch.username_key = username.toLocaleLowerCase();
    }
    const r = await rest(`profiles?id=eq.${p.id}&select=*`, { method: 'PATCH', token: session.access, body: patch, prefer: 'return=representation' });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return json(res, r.status, { error: data.code === '23505' ? 'That username is already taken.' : (data.message || 'Could not update profile.') });
    return json(res, 200, { profile: mapProfile(data[0] || p) });
  }

  return json(res, 405, { error: 'Method not allowed.' });
}

async function formatMessages(rows, token, mineProfileId) {
  if (!rows?.length) return [];
  const replyIds = [...new Set(rows.map(m => m.reply_to_id).filter(Boolean))];
  let replyRows = [];
  if (replyIds.length) {
    const rr = await rest(`messages?id=in.(${replyIds.join(',')})&deleted_at=is.null&select=id,profile_id,content,audio_key,sticker_id`, { token });
    if (rr.ok) replyRows = await rr.json();
  }
  const replyMap = new Map(replyRows.map(x => [x.id, x]));
  const pmap = await profilesByIds([...rows.map(m => m.profile_id), ...replyRows.map(m => m.profile_id)], token);

  const stickerIds = [...new Set([...rows.map(m => m.sticker_id), ...replyRows.map(m => m.sticker_id)].filter(Boolean))];
  let stickerRows = [];
  if (stickerIds.length) {
    const sr = await rest(`stickers?id=in.(${stickerIds.join(',')})&select=*`, { token });
    if (sr.ok) stickerRows = await sr.json();
  }
  const smap = new Map(stickerRows.map(s => [String(s.id), s]));

  const ids = rows.map(m => m.id);
  let reactionRows = [];
  if (ids.length) {
    const rr = await rest(`reactions?message_id=in.(${ids.join(',')})&select=message_id,emoji`, { token });
    if (rr.ok) reactionRows = await rr.json();
  }
  const reactionMap = new Map();
  for (const row of reactionRows) {
    if (!reactionMap.has(row.message_id)) reactionMap.set(row.message_id, new Map());
    const byEmoji = reactionMap.get(row.message_id);
    byEmoji.set(row.emoji, (byEmoji.get(row.emoji) || 0) + 1);
  }

  return rows.map(m => {
    const p = pmap.get(String(m.profile_id));
    const replyRow = m.reply_to_id ? replyMap.get(m.reply_to_id) : null;
    const replyProfile = replyRow ? pmap.get(String(replyRow.profile_id)) : null;
    const reply = replyRow ? {
      id: replyRow.id,
      name: replyProfile?.username || 'Unknown',
      text: replyRow.sticker_id ? 'Sticker' : replyRow.audio_key ? 'Voice message' : (replyRow.content || ''),
    } : null;
    const reactions = [...(reactionMap.get(m.id) || new Map()).entries()].map(([emoji, count]) => ({ emoji, count }));
    return {
      id: m.id,
      profileId: m.profile_id,
      name: p?.username || 'Unknown',
      avatar: initials(p?.username || 'Unknown'),
      avatarUrl: mediaUrl(p?.avatar_key),
      nameColor: p?.name_color || '#74e9ff',
      accent: p?.accent || 'ice',
      role: p?.role || 'member',
      text: m.content || '',
      kind: m.kind || 'message',
      time: clock(m.created_at),
      createdAt: m.created_at,
      editedAt: m.edited_at,
      replyToId: m.reply_to_id,
      reply,
      reactions,
      stickerUrl: m.sticker_id ? mediaUrl(smap.get(String(m.sticker_id))?.storage_key) : null,
      audioUrl: mediaUrl(m.audio_key),
      pinned: Boolean(m.pinned_at),
      pinnedAt: m.pinned_at || null,
      pinnedByProfileId: m.pinned_by_profile_id || null,
      mine: mineProfileId != null && String(m.profile_id) === String(mineProfileId),
    };
  });
}

async function handleMessages(req, res, path) {
  if (path !== 'messages') return false;
  const session = await getSession(req, res);
  const profile = session ? await ownProfile(session) : null;

  if (req.method === 'GET') {
    const r = await rest('messages?room_id=eq.public&deleted_at=is.null&select=*&order=created_at.asc&limit=250', { token: session?.access });
    if (!r.ok) return json(res, r.status, { error: 'Could not load messages.', messages: [] });
    let rows = await r.json();
    const after = String(req.query.after || '');
    const afterId = String(req.query.afterId || '');
    if (after) rows = rows.filter(m => m.created_at > after || (m.created_at === after && (!afterId || m.id > afterId)));
    return json(res, 200, { messages: await formatMessages(rows, session?.access, profile?.id) });
  }

  if (req.method === 'POST') {
    if (!session || !profile) return json(res, 401, { error: 'Sign in first.' });
    const restriction = await activeRestriction(session, profile);
    const block = restrictionMessage(restriction, true);
    if (block) return json(res, 403, { error: block });

    const b = await readJson(req);
    const text = normalizeMessage(b.text);
    const stickerId = Number(b.stickerId || 0) || null;
    const replyToId = b.replyToId ? String(b.replyToId) : null;
    if (!text && !stickerId) return json(res, 400, { error: 'Message is empty.' });
    if (replyToId && !isUuid(replyToId)) return json(res, 400, { error: 'Invalid reply target.' });

    if (stickerId) {
      const sr = await rest(`stickers?id=eq.${stickerId}&active=eq.true&select=id`, { token: session.access });
      if (!sr.ok || !(await sr.json()).length) return json(res, 400, { error: 'Sticker is not available.' });
    }

    const row = {
      room_id: 'public', profile_id: profile.id, content: text,
      reply_to_id: replyToId, sticker_id: stickerId,
    };
    if (b.clientMessageId && isUuid(b.clientMessageId)) row.id = b.clientMessageId;
    const r = await rest('messages?select=*', { method: 'POST', token: session.access, body: row, prefer: 'return=representation' });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return json(res, r.status, { error: data.message || 'Could not send message.' });
    const formatted = await formatMessages(data, session.access, profile.id);
    return json(res, 200, { message: formatted[0] });
  }

  return json(res, 405, { error: 'Method not allowed.' });
}

async function handleVoice(req, res, path) {
  if (path !== 'messages/voice') return false;
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
  const session = await getSession(req, res);
  const profile = session ? await ownProfile(session) : null;
  if (!session || !profile) return json(res, 401, { error: 'Sign in first.' });
  const restriction = await activeRestriction(session, profile);
  const block = restrictionMessage(restriction, true);
  if (block) return json(res, 403, { error: block });
  try {
    const file = await parseMultipartFile(req, 'voice', 6 * 1024 * 1024);
    if (!file.type.startsWith('audio/')) return json(res, 400, { error: 'Invalid voice recording.' });
    const key = `voice/${profile.id}/${Date.now()}-${randomUUID()}.${extensionFor(file.type, 'webm')}`;
    await uploadMedia(session, key, file);
    const r = await rest('messages?select=*', {
      method: 'POST', token: session.access,
      body: { room_id: 'public', profile_id: profile.id, content: '', audio_key: key },
      prefer: 'return=representation',
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return json(res, r.status, { error: data.message || 'Voice message not sent.' });
    const formatted = await formatMessages(data, session.access, profile.id);
    return json(res, 200, { message: formatted[0] });
  } catch (e) {
    return json(res, 400, { error: e.message || 'Voice message not sent.' });
  }
}

async function handleMessageAction(req, res, path) {
  let match = path.match(/^messages\/([0-9a-f-]{36})\/pin$/i);
  if (match) {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
    const session = await getSession(req, res);
    if (!session) return json(res, 401, { error: 'Sign in first.' });
    const r = await rpc('coldchat_toggle_pin', { p_message_id: match[1] }, session.access);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return json(res, r.status, { error: data.message || 'Message not pinned.' });
    return json(res, 200, { pinned: Boolean(data) });
  }

  match = path.match(/^messages\/([0-9a-f-]{36})$/i);
  if (match) {
    if (req.method !== 'DELETE') return json(res, 405, { error: 'Method not allowed.' });
    const session = await getSession(req, res);
    if (!session) return json(res, 401, { error: 'Sign in first.' });
    const r = await rpc('coldchat_delete_message', { p_message_id: match[1] }, session.access);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return json(res, r.status, { error: data.message || 'Message not deleted.' });
    return json(res, 200, { ok: true });
  }
  return false;
}

async function handleReactions(req, res, path) {
  if (path !== 'reactions') return false;
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
  const session = await getSession(req, res);
  const profile = session ? await ownProfile(session) : null;
  if (!session || !profile) return json(res, 401, { error: 'Sign in first.' });
  const restriction = await activeRestriction(session, profile);
  const block = restrictionMessage(restriction, true);
  if (block) return json(res, 403, { error: block });

  const b = await readJson(req);
  const messageId = String(b.messageId || '');
  const emoji = String(b.emoji || '').slice(0, 32);
  if (!isUuid(messageId) || !emoji) return json(res, 400, { error: 'Invalid reaction.' });
  const filter = `reactions?message_id=eq.${messageId}&profile_id=eq.${profile.id}&emoji=eq.${encodeURIComponent(emoji)}`;
  const q = await rest(`${filter}&select=*`, { token: session.access });
  if (!q.ok) return json(res, q.status, { error: 'Reaction failed.' });
  const existing = await q.json();
  if (existing.length) {
    const d = await rest(filter, { method: 'DELETE', token: session.access });
    if (!d.ok) return json(res, d.status, { error: 'Reaction failed.' });
    return json(res, 200, { active: false });
  }
  const r = await rest('reactions', { method: 'POST', token: session.access, body: { message_id: messageId, profile_id: profile.id, emoji }, prefer: 'return=minimal' });
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    return json(res, r.status, { error: data.message || 'Reaction failed.' });
  }
  return json(res, 200, { active: true });
}

async function handleStickers(req, res, path) {
  if (path !== 'stickers') return false;
  const session = await getSession(req, res);
  const profile = session ? await ownProfile(session) : null;
  if (req.method === 'GET') {
    const r = await rest('stickers?active=eq.true&select=*&order=created_at.desc&limit=100', { token: session?.access });
    if (!r.ok) return json(res, r.status, { stickers: [], error: 'Could not load stickers.' });
    const rows = await r.json();
    const pmap = await profilesByIds(rows.map(x => x.creator_profile_id), session?.access);
    return json(res, 200, { stickers: rows.map(s => ({
      id: s.id,
      url: mediaUrl(s.storage_key),
      creatorName: pmap.get(String(s.creator_profile_id))?.username || 'ColdChat user',
      contentType: s.content_type,
      createdAt: s.created_at,
    })) });
  }
  if (req.method === 'POST') {
    if (!session || !profile) return json(res, 401, { error: 'Sign in first.' });
    const restriction = await activeRestriction(session, profile);
    const block = restrictionMessage(restriction, true);
    if (block) return json(res, 403, { error: block });
    try {
      const file = await parseMultipartFile(req, 'sticker', 4 * 1024 * 1024);
      if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) return json(res, 400, { error: 'Use a PNG, JPEG, WebP or GIF sticker.' });
      const key = `stickers/${profile.id}/${Date.now()}-${randomUUID()}.${extensionFor(file.type, 'img')}`;
      await uploadMedia(session, key, file);
      const r = await rest('stickers?select=*', {
        method: 'POST', token: session.access,
        body: { creator_profile_id: profile.id, storage_key: key, content_type: file.type, active: true },
        prefer: 'return=representation',
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return json(res, r.status, { error: data.message || 'Sticker not added.' });
      const s = data[0];
      return json(res, 200, { sticker: { id: s.id, url: mediaUrl(s.storage_key), creatorName: profile.username, contentType: s.content_type, createdAt: s.created_at } });
    } catch (e) {
      return json(res, 400, { error: e.message || 'Sticker not added.' });
    }
  }
  return json(res, 405, { error: 'Method not allowed.' });
}

async function handleFriends(req, res, path) {
  if (path !== 'friends') return false;
  const session = await getSession(req, res);
  const profile = session ? await ownProfile(session) : null;
  if (!session || !profile) return json(res, 401, { error: 'Sign in first.', friends: [], incoming: [], outgoing: [], discover: [] });

  if (req.method === 'GET') {
    const [fr, pr] = await Promise.all([
      rest('friendships?select=*&order=created_at.desc', { token: session.access }),
      rest('profiles?select=*&order=username.asc', { token: session.access }),
    ]);
    if (!fr.ok || !pr.ok) return json(res, 500, { error: 'Could not load friends.', friends: [], incoming: [], outgoing: [], discover: [] });
    const relationships = await fr.json();
    const profiles = await pr.json();
    const pmap = new Map(profiles.map(p => [String(p.id), p]));
    const related = new Set();
    const friends = [], incoming = [], outgoing = [];
    for (const f of relationships) {
      const mineRequester = String(f.requester_profile_id) === String(profile.id);
      const otherId = mineRequester ? f.addressee_profile_id : f.requester_profile_id;
      const other = pmap.get(String(otherId));
      if (!other) continue;
      related.add(String(otherId));
      if (f.status === 'accepted') friends.push(mapPerson(other));
      else if (mineRequester) outgoing.push(mapPerson(other));
      else incoming.push(mapPerson(other));
    }
    const discover = profiles.filter(p => String(p.id) !== String(profile.id) && !related.has(String(p.id))).map(p => mapPerson(p));
    const sort = arr => arr.sort((a, b) => a.name.localeCompare(b.name));
    return json(res, 200, { friends: sort(friends), incoming: sort(incoming), outgoing: sort(outgoing), discover: sort(discover) });
  }

  if (req.method === 'POST') {
    const b = await readJson(req);
    const action = String(b.action || '');
    const target = Number(b.targetProfileId || 0);
    if (!['request', 'accept', 'remove'].includes(action) || !target) return json(res, 400, { error: 'Invalid friend action.' });
    const r = await rpc('coldchat_friend_action', { p_action: action, p_target_profile_id: target }, session.access);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return json(res, r.status, { error: data.message || 'Friend action failed.' });
    return json(res, 200, { ok: true });
  }
  return json(res, 405, { error: 'Method not allowed.' });
}

async function handleDms(req, res, path) {
  if (path !== 'dms') return false;
  const session = await getSession(req, res);
  const profile = session ? await ownProfile(session) : null;
  if (!session || !profile) return json(res, 401, { error: 'Unauthorized', messages: [] });
  const withId = Number(req.query.with || 0);

  if (req.method === 'GET') {
    if (!withId) return json(res, 400, { error: 'Missing conversation.', messages: [] });
    const r = await rest(`direct_messages?or=(and(sender_profile_id.eq.${profile.id},recipient_profile_id.eq.${withId}),and(sender_profile_id.eq.${withId},recipient_profile_id.eq.${profile.id}))&deleted_at=is.null&select=*&order=created_at.asc&limit=250`, { token: session.access });
    if (!r.ok) return json(res, r.status, { error: 'Could not load messages.', messages: [] });
    let rows = await r.json();
    const after = String(req.query.after || '');
    const afterId = String(req.query.afterId || '');
    if (after) rows = rows.filter(m => m.created_at > after || (m.created_at === after && (!afterId || m.id > afterId)));
    return json(res, 200, { messages: rows.map(m => ({
      id: m.id, senderId: m.sender_profile_id, recipientId: m.recipient_profile_id,
      text: m.content, createdAt: m.created_at, time: clock(m.created_at),
      mine: String(m.sender_profile_id) === String(profile.id),
    })) });
  }

  if (req.method === 'POST') {
    const restriction = await activeRestriction(session, profile);
    const block = restrictionMessage(restriction, false);
    if (block) return json(res, 403, { error: block });
    const b = await readJson(req);
    const recipient = Number(b.recipientProfileId || 0);
    const text = normalizeMessage(b.text);
    if (!recipient || recipient === Number(profile.id) || !text) return json(res, 400, { error: 'Message is incomplete.' });
    const pairKey = `${Math.min(Number(profile.id), recipient)}:${Math.max(Number(profile.id), recipient)}`;
    const fr = await rest(`friendships?pair_key=eq.${encodeURIComponent(pairKey)}&status=eq.accepted&select=id`, { token: session.access });
    if (!fr.ok || !(await fr.json()).length) return json(res, 403, { error: 'Add this user as a friend before sending private messages.' });
    const row = { sender_profile_id: profile.id, recipient_profile_id: recipient, content: text };
    if (b.clientMessageId && isUuid(b.clientMessageId)) row.id = b.clientMessageId;
    const r = await rest('direct_messages?select=*', { method: 'POST', token: session.access, body: row, prefer: 'return=representation' });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return json(res, r.status, { error: data.message || 'Could not send message.' });
    const m = data[0];
    return json(res, 200, { message: {
      id: m.id, senderId: m.sender_profile_id, recipientId: m.recipient_profile_id,
      text: m.content, createdAt: m.created_at, time: clock(m.created_at), mine: true,
    } });
  }
  return json(res, 405, { error: 'Method not allowed.' });
}

async function handlePresence(req, res, path) {
  if (path !== 'presence') return false;
  const session = await getSession(req, res);
  const profile = session ? await ownProfile(session) : null;
  if (req.method === 'POST') {
    if (!session || !profile) return json(res, 401, { error: 'Unauthorized' });
    const r = await rest('presence?on_conflict=profile_id', {
      method: 'POST', token: session.access,
      body: { profile_id: profile.id, room_id: 'public', last_seen_at: new Date().toISOString() },
      prefer: 'resolution=merge-duplicates,return=minimal',
    });
    if (!r.ok) return json(res, r.status, { error: 'Presence update failed.' });
    return json(res, 200, { ok: true });
  }
  if (req.method === 'GET') {
    const threshold = new Date(Date.now() - 90_000).toISOString();
    const r = await rest(`presence?last_seen_at=gte.${encodeURIComponent(threshold)}&select=*&order=last_seen_at.desc`, { token: session?.access });
    if (!r.ok) return json(res, r.status, { people: [] });
    const rows = await r.json();
    const pmap = await profilesByIds(rows.map(x => x.profile_id), session?.access);
    const people = rows.map(row => pmap.get(String(row.profile_id))).filter(Boolean).map(p => mapPerson(p));
    return json(res, 200, { people });
  }
  return json(res, 405, { error: 'Method not allowed.' });
}

function restrictionForRows(rows) {
  const now = Date.now();
  const active = rows.filter(r => r.active && (!r.expires_at || new Date(r.expires_at).getTime() > now));
  const permanent = active.find(r => !r.expires_at);
  if (permanent) return { type: 'ban', expiresAt: null };
  const timeout = active.sort((a, b) => new Date(b.expires_at) - new Date(a.expires_at))[0];
  return timeout ? { type: 'timeout', expiresAt: timeout.expires_at } : null;
}

async function handleModeration(req, res, path) {
  if (path !== 'moderation') return false;
  const session = await getSession(req, res);
  const actor = session ? await ownProfile(session) : null;
  if (!session || !actor || !['owner', 'moderator'].includes(actor.role)) return json(res, 403, { error: 'Moderation permission required.' });

  if (req.method === 'GET') {
    const [pr, br] = await Promise.all([
      rest('profiles?select=*&order=username.asc', { token: session.access }),
      rest('bans?active=eq.true&select=*&order=created_at.desc', { token: session.access }),
    ]);
    if (!pr.ok || !br.ok) return json(res, 500, { error: 'Could not load users.' });
    const profiles = await pr.json();
    const bans = await br.json();
    const byProfile = new Map();
    for (const b of bans) {
      const arr = byProfile.get(String(b.profile_id)) || [];
      arr.push(b); byProfile.set(String(b.profile_id), arr);
    }
    return json(res, 200, { users: profiles.map(p => mapPerson(p, restrictionForRows(byProfile.get(String(p.id)) || []))) });
  }

  if (req.method === 'POST') {
    const b = await readJson(req);
    const action = String(b.action || '');
    const target = Number(b.targetProfileId || 0);
    if (!['set_moderator', 'rename_user', 'timeout', 'ban', 'unban'].includes(action) || !target) return json(res, 400, { error: 'Invalid moderation action.' });
    if (action === 'rename_user') {
      const err = validateUsername(String(b.username || ''));
      if (err) return json(res, 400, { error: err });
    }
    const minutes = validateModerationMinutes(b.minutes);
    if (action === 'timeout' && minutes == null) return json(res, 400, { error: 'Choose a timeout from 1 minute to 30 days.' });
    const r = await rpc('coldchat_moderate', {
      p_action: action,
      p_target_profile_id: target,
      p_reason: String(b.reason || '').slice(0, 300),
      p_minutes: minutes,
      p_enabled: b.enabled == null ? null : Boolean(b.enabled),
      p_username: b.username == null ? null : String(b.username).normalize('NFKC'),
    }, session.access);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return json(res, r.status, { error: data.message || 'Moderation action failed.' });
    return json(res, 200, data || { ok: true });
  }
  return json(res, 405, { error: 'Method not allowed.' });
}

export default async function handler(req, res) {
  try {
    const rawPath = req.query.path;
    const path = Array.isArray(rawPath) ? rawPath.join('/') : String(rawPath || '').replace(/^\/+/, '');

    if (path === 'health') return json(res, 200, { ok: Boolean(SUPABASE_URL && SUPABASE_KEY), service: 'coldchat', database: 'supabase' });

    const handlers = [
      handleAuth,
      handleProfileAvatar,
      handleProfile,
      handleVoice,
      handleMessageAction,
      handleMessages,
      handleReactions,
      handleStickers,
      handleFriends,
      handleDms,
      handlePresence,
      handleModeration,
    ];

    for (const fn of handlers) {
      const result = await fn(req, res, path);
      if (result !== false) return result;
    }

    return json(res, 404, { error: 'Standalone endpoint not found.' });
  } catch (e) {
    console.error('ColdChat native error', e);
    return json(res, 500, { error: 'The server could not complete this request.' });
  }
}
