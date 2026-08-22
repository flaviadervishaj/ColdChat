const SUPABASE_URL = 'https://awtayqyiaorglduxnust.supabase.co';
const SUPABASE_KEY = 'sb_publishable_3p6Piixdq_bu-wF793Z_fQ_PVpZ6uIv';

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
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function setSessionCookies(res, session) {
  const secure = '; Path=/; HttpOnly; Secure; SameSite=Lax';
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

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(Buffer.from(c));
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
}

async function supa(path, { method = 'GET', token, body, headers = {} } = {}) {
  const h = {
    apikey: SUPABASE_KEY,
    ...headers,
  };
  if (token) h.authorization = `Bearer ${token}`;
  if (body !== undefined && !h['content-type']) h['content-type'] = 'application/json';
  return fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: h,
    body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
  });
}

async function refreshSession(req, res) {
  const cookies = parseCookies(req);
  if (!cookies.cc_refresh) return null;
  const r = await supa('/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    body: { refresh_token: cookies.cc_refresh },
    headers: { 'content-type': 'application/json' },
  });
  if (!r.ok) return null;
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
  if (!refreshed?.access_token) return null;
  const u = await supa('/auth/v1/user', { token: refreshed.access_token });
  if (!u.ok) return null;
  return { access: refreshed.access_token, user: await u.json() };
}

async function rest(path, { method = 'GET', token, body, prefer } = {}) {
  const headers = {};
  if (prefer) headers.prefer = prefer;
  return supa(`/rest/v1/${path}`, { method, token, body, headers });
}

function mapProfile(p) {
  if (!p) return null;
  return {
    id: p.id,
    email: p.email,
    username: p.username,
    name: p.username,
    initials: Array.from(p.username || 'U').slice(0, 2).join('').toUpperCase(),
    avatarUrl: p.avatar_key ? `${SUPABASE_URL}/storage/v1/object/public/avatars/${p.avatar_key}` : null,
    nameColor: p.name_color,
    accent: p.accent,
    role: p.role,
    createdAt: p.created_at,
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
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return new Map();
  const r = await rest(`profiles?id=in.(${uniq.join(',')})&select=*`, { token });
  if (!r.ok) return new Map();
  const rows = await r.json();
  return new Map(rows.map(p => [String(p.id), p]));
}

async function handleAuth(req, res, path) {
  if (path === 'auth/me' && req.method === 'GET') {
    const session = await getSession(req, res);
    if (!session) return json(res, 200, { authUser: null });
    return json(res, 200, { authUser: { id: session.user.id, email: session.user.email } });
  }
  if (path === 'auth/logout' && req.method === 'POST') {
    clearSessionCookies(res);
    return json(res, 200, { ok: true });
  }
  if (path === 'auth/login' && req.method === 'POST') {
    const b = await readJson(req);
    const email = String(b.email || '').trim().toLowerCase();
    const password = String(b.password || '');
    const mode = b.mode === 'signup' ? 'signup' : 'signin';
    if (!email || password.length < 6) return json(res, 400, { error: 'Enter a valid email and a password with at least 6 characters.' });
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

async function handleProfile(req, res, path) {
  if (path !== 'profile') return false;
  const session = await getSession(req, res);
  if (!session) return json(res, 401, { error: 'Unauthorized', profile: null });
  if (req.method === 'GET') {
    return json(res, 200, { profile: mapProfile(await ownProfile(session)) });
  }
  const b = await readJson(req);
  if (req.method === 'POST') {
    const existing = await ownProfile(session);
    if (existing) return json(res, 200, { profile: mapProfile(existing) });
    const username = String(b.username || '').trim().slice(0, 32);
    if (!username) return json(res, 400, { error: 'Username is required.' });
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
    if (!r.ok) return json(res, r.status, { error: data.message || 'Could not create profile.' });
    return json(res, 200, { profile: mapProfile(data[0]) });
  }
  if (req.method === 'PATCH') {
    const p = await ownProfile(session);
    if (!p) return json(res, 404, { error: 'Profile not found.' });
    const patch = {};
    if (/^#[0-9a-fA-F]{6}$/.test(b.nameColor || '')) patch.name_color = b.nameColor;
    if (b.username && p.role === 'owner') {
      patch.username = String(b.username).trim().slice(0, 32);
      patch.username_key = patch.username.toLocaleLowerCase();
    }
    const r = await rest(`profiles?id=eq.${p.id}&select=*`, { method: 'PATCH', token: session.access, body: patch, prefer: 'return=representation' });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return json(res, r.status, { error: data.message || 'Could not update profile.' });
    return json(res, 200, { profile: mapProfile(data[0]) });
  }
  return json(res, 405, { error: 'Method not allowed' });
}

async function formatMessages(rows, token, mineProfileId) {
  const pmap = await profilesByIds(rows.map(m => m.profile_id), token);
  const ids = rows.map(m => m.id);
  let reactions = [];
  if (ids.length) {
    const rr = await rest(`reactions?message_id=in.(${ids.join(',')})&select=*`, { token });
    if (rr.ok) reactions = await rr.json();
  }
  const grouped = new Map();
  for (const r of reactions) {
    const arr = grouped.get(r.message_id) || [];
    arr.push({ emoji: r.emoji, profileId: r.profile_id });
    grouped.set(r.message_id, arr);
  }
  return rows.map(m => {
    const p = pmap.get(String(m.profile_id));
    return {
      id: m.id,
      profileId: m.profile_id,
      name: p?.username || 'Unknown',
      avatarUrl: p?.avatar_key ? `${SUPABASE_URL}/storage/v1/object/public/avatars/${p.avatar_key}` : null,
      nameColor: p?.name_color || '#74e9ff',
      accent: p?.accent || 'ice',
      role: p?.role || 'member',
      text: m.content || '',
      kind: m.kind,
      createdAt: m.created_at,
      editedAt: m.edited_at,
      replyToId: m.reply_to_id,
      reactions: grouped.get(m.id) || [],
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
    return json(res, 200, { messages: await formatMessages(await r.json(), session?.access, profile?.id) });
  }
  if (req.method === 'POST') {
    if (!session || !profile) return json(res, 401, { error: 'Unauthorized' });
    const b = await readJson(req);
    const text = String(b.text || '').trim().slice(0, 4000);
    if (!text && !b.stickerId) return json(res, 400, { error: 'Message is empty.' });
    const row = { room_id: 'public', profile_id: profile.id, content: text, reply_to_id: b.replyToId || null, sticker_id: b.stickerId || null };
    const r = await rest('messages?select=*', { method: 'POST', token: session.access, body: row, prefer: 'return=representation' });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return json(res, r.status, { error: data.message || 'Could not send message.' });
    const messages = await formatMessages(data, session.access, profile.id);
    return json(res, 200, { message: messages[0], messages });
  }
  return json(res, 405, { error: 'Method not allowed' });
}

async function handleDms(req, res, path) {
  if (path !== 'dms') return false;
  const session = await getSession(req, res);
  const profile = session ? await ownProfile(session) : null;
  if (!session || !profile) return json(res, 401, { error: 'Unauthorized', messages: [] });
  if (req.method === 'GET') {
    const withId = Number(req.query.with || 0);
    if (!withId) return json(res, 400, { error: 'Missing conversation.', messages: [] });
    const r = await rest(`direct_messages?or=(and(sender_profile_id.eq.${profile.id},recipient_profile_id.eq.${withId}),and(sender_profile_id.eq.${withId},recipient_profile_id.eq.${profile.id}))&deleted_at=is.null&select=*&order=created_at.asc&limit=250`, { token: session.access });
    if (!r.ok) return json(res, r.status, { error: 'Could not load messages.', messages: [] });
    const rows = await r.json();
    return json(res, 200, { messages: rows.map(m => ({ id: m.id, senderId: m.sender_profile_id, recipientId: m.recipient_profile_id, text: m.content, createdAt: m.created_at, mine: String(m.sender_profile_id) === String(profile.id) })) });
  }
  if (req.method === 'POST') {
    const b = await readJson(req);
    const recipient = Number(b.recipientProfileId || 0);
    const text = String(b.text || '').trim().slice(0, 4000);
    if (!recipient || !text) return json(res, 400, { error: 'Message is incomplete.' });
    const row = { sender_profile_id: profile.id, recipient_profile_id: recipient, content: text };
    const r = await rest('direct_messages?select=*', { method: 'POST', token: session.access, body: row, prefer: 'return=representation' });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return json(res, r.status, { error: data.message || 'Could not send message.' });
    const m = data[0];
    return json(res, 200, { message: { id: m.id, senderId: m.sender_profile_id, recipientId: m.recipient_profile_id, text: m.content, createdAt: m.created_at, mine: true } });
  }
  return json(res, 405, { error: 'Method not allowed' });
}

async function handlePresence(req, res, path) {
  if (path !== 'presence') return false;
  const session = await getSession(req, res);
  const profile = session ? await ownProfile(session) : null;
  if (req.method === 'POST') {
    if (!session || !profile) return json(res, 401, { error: 'Unauthorized' });
    const r = await rest('presence?on_conflict=profile_id', { method: 'POST', token: session.access, body: { profile_id: profile.id, room_id: 'public', last_seen_at: new Date().toISOString() }, prefer: 'resolution=merge-duplicates,return=minimal' });
    return json(res, r.ok ? 200 : r.status, r.ok ? { ok: true } : { error: 'Could not update presence.' });
  }
  if (req.method === 'GET') {
    const since = new Date(Date.now() - 90000).toISOString();
    const r = await rest(`presence?last_seen_at=gte.${encodeURIComponent(since)}&select=*`, { token: session?.access });
    if (!r.ok) return json(res, r.status, { people: [] });
    const rows = await r.json();
    const pmap = await profilesByIds(rows.map(x => x.profile_id), session?.access);
    return json(res, 200, { people: rows.map(x => mapProfile(pmap.get(String(x.profile_id)))).filter(Boolean) });
  }
  return json(res, 405, { error: 'Method not allowed' });
}

export default async function handler(req, res) {
  const path = String(req.query.path || '').replace(/^\/+|\/+$/g, '');
  try {
    if (!path || path === 'health') return json(res, 200, { ok: true, service: 'coldchat-standalone', database: 'supabase' });
    const auth = await handleAuth(req, res, path); if (auth !== false) return;
    const profile = await handleProfile(req, res, path); if (profile !== false) return;
    const messages = await handleMessages(req, res, path); if (messages !== false) return;
    const dms = await handleDms(req, res, path); if (dms !== false) return;
    const presence = await handlePresence(req, res, path); if (presence !== false) return;
    return json(res, 404, { error: 'Standalone endpoint not found', path });
  } catch (err) {
    console.error('standalone backend error', err);
    return json(res, 500, { error: 'Standalone backend error' });
  }
}
