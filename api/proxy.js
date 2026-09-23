export const config = { api: { bodyParser: false } };

const TARGET = 'https://coldchat.flaviadervishaj.chatgpt.site';

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

function rewriteSetCookie(value) {
  if (!value) return value;
  return value.replace(/;\s*Domain=[^;]+/gi, '');
}

export default async function handler(req, res) {
  try {
    const rawPath = Array.isArray(req.query.path) ? req.query.path.join('/') : (req.query.path || '');
    const parsed = new URL(req.url, 'https://local.invalid');
    parsed.searchParams.delete('path');
    const suffix = parsed.searchParams.toString() ? `?${parsed.searchParams.toString()}` : '';
    const targetUrl = `${TARGET}/${rawPath}${suffix}`;

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers || {})) {
      if (!value) continue;
      const k = key.toLowerCase();
      if (['host','content-length','connection','accept-encoding','x-forwarded-host','x-forwarded-proto'].includes(k)) continue;
      headers.set(key, Array.isArray(value) ? value.join(', ') : value);
    }
    headers.set('host', new URL(TARGET).host);
    headers.set('origin', TARGET);
    headers.set('referer', `${TARGET}/`);

    const method = req.method || 'GET';
    const body = ['GET','HEAD'].includes(method) ? undefined : await readBody(req);
    const upstream = await fetch(targetUrl, { method, headers, body, redirect: 'manual' });

    res.statusCode = upstream.status;
    upstream.headers.forEach((value, key) => {
      const k = key.toLowerCase();
      if (['content-length','content-encoding','transfer-encoding','content-security-policy','content-security-policy-report-only','x-frame-options'].includes(k)) return;
      if (k === 'location') {
        try {
          const u = new URL(value, TARGET);
          res.setHeader(key, u.origin === TARGET ? u.pathname + u.search + u.hash : value);
        } catch {
          res.setHeader(key, value);
        }
        return;
      }
      if (k === 'set-cookie') {
        res.setHeader(key, rewriteSetCookie(value));
        return;
      }
      res.setHeader(key, value);
    });

    const buf = Buffer.from(await upstream.arrayBuffer());
    res.end(buf);
  } catch (err) {
    res.statusCode = 502;
    res.setHeader('content-type','text/plain; charset=utf-8');
    res.end('ColdChat proxy error: ' + (err?.message || String(err)));
  }
}
