const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = String(process.env.SUPABASE_PUBLISHABLE_KEY || '');

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(data));
}

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
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

async function supa(path, { method = 'GET', token, body } = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Server configuration is incomplete.');
  const headers = { apikey: SUPABASE_KEY };
  if (token) headers.authorization = `Bearer ${token}`;
  let payload;
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  return fetch(`${SUPABASE_URL}${path}`, { method, headers, body: payload });
}

async function getAccess(req, res) {
  const cookies = parseCookies(req);
  if (cookies.cc_access) {
    const check = await supa('/auth/v1/user', { token: cookies.cc_access });
    if (check.ok) return cookies.cc_access;
  }
  if (!cookies.cc_refresh) return null;
  const refresh = await supa('/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    body: { refresh_token: cookies.cc_refresh },
  });
  if (!refresh.ok) return null;
  const session = await refresh.json();
  setSessionCookies(res, session);
  return session.access_token || null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
  try {
    const access = await getAccess(req, res);
    if (!access) return json(res, 401, { error: 'Sign in first.' });

    const r = await supa('/rest/v1/rpc/coldchat_reset_public_chat', {
      method: 'POST', token: access, body: {},
    });
    const data = await r.json().catch(() => null);
    if (!r.ok) return json(res, r.status, { error: data?.message || 'Could not start a new chat.' });

    return json(res, 200, { ok: true, cleared: Number(data || 0) });
  } catch (e) {
    console.error('ColdChat reset error', e);
    return json(res, 500, { error: 'Could not start a new chat.' });
  }
}
