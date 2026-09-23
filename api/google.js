const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = String(process.env.SUPABASE_PUBLISHABLE_KEY || '');
const APP_URL = String(process.env.APP_URL || '').replace(/\/$/, '');

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'private, no-store');
  res.end(JSON.stringify(data));
}

function setSessionCookies(res, session) {
  const secure = `; Path=/; HttpOnly; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
  const maxAge = Math.max(60, Number(session.expires_in || 3600));
  res.setHeader('set-cookie', [
    `cc_access=${encodeURIComponent(session.access_token)}; Max-Age=${maxAge}${secure}`,
    `cc_refresh=${encodeURIComponent(session.refresh_token || '')}; Max-Age=2592000${secure}`,
  ]);
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(Buffer.from(c));
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
}

export default async function handler(req, res) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return json(res, 500, { error: 'Server configuration is incomplete.' });
  const action = String(req.query.action || '');

  if (action === 'start' && req.method === 'GET') {
    const requestHost = req.headers['x-forwarded-host'] || req.headers.host;
    const requestProto = req.headers['x-forwarded-proto'] || 'https';
    const origin = APP_URL || (requestHost ? `${requestProto}://${requestHost}` : '');
    if (!origin) return json(res, 500, { error: 'Application URL is not configured.' });
    const redirectTo = `${origin}/login`;
    const url = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectTo)}&prompt=select_account`;
    res.statusCode = 302;
    res.setHeader('cache-control', 'private, no-store');
    res.setHeader('location', url);
    return res.end();
  }

  if (action === 'session' && req.method === 'POST') {
    const body = await readJson(req);
    const accessToken = String(body.access_token || '');
    const refreshToken = String(body.refresh_token || '');
    const expiresIn = Number(body.expires_in || 3600);
    if (!accessToken || !refreshToken) return json(res, 400, { error: 'Missing OAuth session.' });

    const verify = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${accessToken}` },
    });
    if (!verify.ok) return json(res, 401, { error: 'Invalid OAuth session.' });

    const user = await verify.json();
    setSessionCookies(res, { access_token: accessToken, refresh_token: refreshToken, expires_in: expiresIn });
    return json(res, 200, { ok: true, authUser: { id: user.id, email: user.email } });
  }

  return json(res, 404, { error: 'OAuth endpoint not found.' });
}
