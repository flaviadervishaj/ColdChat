const SUPABASE_URL = 'https://awtayqyiaorglduxnust.supabase.co';

export default async function handler(req, res) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'coldchat.vercel.app';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const redirectTo = `${proto}://${host}/auth-debug.html`;
  const url = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectTo)}`;
  res.statusCode = 302;
  res.setHeader('cache-control', 'private, no-store');
  res.setHeader('location', url);
  res.end();
}
