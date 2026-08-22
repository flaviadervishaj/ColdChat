const SOURCE = 'https://coldchat.flaviadervishaj.chatgpt.site/assets/chat-shell-BA0J5a0Y.js';

function once(code, from, to) {
  if (!code.includes(from)) throw new Error(`ColdChat UI patch target missing: ${from.slice(0, 80)}`);
  return code.replace(from, to);
}

export default async function handler(req, res) {
  try {
    const upstream = await fetch(SOURCE, { headers: { accept: 'application/javascript,*/*' } });
    if (!upstream.ok) {
      res.statusCode = 502;
      res.end('ColdChat UI source unavailable');
      return;
    }
    let code = await upstream.text();

    code = once(code, 'from"./rolldown-runtime-S-ySWqyJ.js"', 'from"/assets/rolldown-runtime-S-ySWqyJ.js"');
    code = once(code, 'from"./framework-CXnKph_e.js"', 'from"/assets/framework-CXnKph_e.js"');
    code = once(code, 'from"./index-KDNse1g9.js"', 'from"/assets/index-KDNse1g9.js"');
    code = once(code, 'import(`./hls-A8FxWEQs.js`)', 'import(`/assets/hls-A8FxWEQs.js`)');
    code = once(code, '/signin-with-chatgpt?return_to=%2F', '/login');

    code = once(code, 's().then(c);let l=window.setInterval(s,12e3)', 's();let l=window.setInterval(s,2e3)');
    code = once(code, 'c().then(()=>{u(),l()});let d=window.setInterval(l,700),f=window.setInterval(c,1e4)', 'c().then(()=>{l()});let d=window.setInterval(l,700),f=window.setInterval(c,1e4)');

    code = once(
      code,
      'async function we(e){if(!Z&&!Q)return;let t=await fetch(`/api/messages/${encodeURIComponent(e.id)}`,{method:`DELETE`}),n=await t.json().catch(()=>({}));t.ok?p(t=>t.filter(t=>t.id!==e.id)):P(n.error||`Message not deleted.`)}function Te(e)',
      'async function we(e){if(!Z&&!Q)return;let t=await fetch(`/api/messages/${encodeURIComponent(e.id)}`,{method:`DELETE`}),n=await t.json().catch(()=>({}));t.ok?p(t=>t.filter(t=>t.id!==e.id)):P(n.error||`Message not deleted.`)}async function Pe(e){if(!Z&&!Q)return;let t=await fetch(`/api/messages/${encodeURIComponent(e.id)}/pin`,{method:`POST`}),n=await t.json().catch(()=>({}));t.ok?p(t=>t.map(t=>t.id===e.id?{...t,pinned:!!n.pinned}:t)):P(n.error||`Message not pinned.`)}function Te(e)'
    );
    code = once(
      code,
      'className:`message message-reply-target ${e.mine?`mine`:``} ${e.pending?`pending`:``}`',
      'className:`message message-reply-target ${e.mine?`mine`:``} ${e.pending?`pending`:``} ${e.pinned?`pinned`:``}`'
    );
    code = once(
      code,
      'r?(0,a.jsx)(`em`,{className:`role-badge role-${e.role}`,children:r}):null,e.stickerUrl?',
      'r?(0,a.jsx)(`em`,{className:`role-badge role-${e.role}`,children:r}):null,e.pinned?(0,a.jsx)(`em`,{className:`pin-badge`,children:`PINNED`}):null,e.stickerUrl?'
    );
    code = once(
      code,
      'Z||Q?(0,a.jsx)(`button`,{onClick:()=>void we(e),"aria-label":`Delete message`,children:(0,a.jsx)(l,{name:`trash`,size:14})}):null,(Z||Q)&&e.profileId!==t?.id?',
      'Z||Q?(0,a.jsx)(`button`,{onClick:()=>void we(e),"aria-label":`Delete message`,children:(0,a.jsx)(l,{name:`trash`,size:14})}):null,Z||Q?(0,a.jsx)(`button`,{onClick:()=>void Pe(e),"aria-label":e.pinned?`Unpin message`:`Pin message`,title:e.pinned?`Unpin`:`Pin`,children:e.pinned?`📍`:`📌`}):null,(Z||Q)&&e.profileId!==t?.id?'
    );

    code = once(
      code,
      't===`owner`&&!F?(0,a.jsxs)(a.Fragment,{children:[(0,a.jsxs)(`section`,{className:`moderation-card`',
      '(t===`owner`||t===`moderator`)&&!F?(0,a.jsxs)(a.Fragment,{children:[t===`owner`?(0,a.jsxs)(`section`,{className:`moderation-card`'
    );
    code = once(
      code,
      'children:N.role===`moderator`?`Remove MOD`:N.restriction?.type===`ban`?`Banned`:`Make MOD`})]}),(0,a.jsxs)(`section`,{className:`moderation-card danger`',
      'children:N.role===`moderator`?`Remove MOD`:N.restriction?.type===`ban`?`Banned`:`Make MOD`})]}):null,(0,a.jsxs)(`section`,{className:`moderation-card danger`'
    );
    code = code.replace('`Timeouts and messages`', '`Ban · timeout · pin`');

    res.statusCode = 200;
    res.setHeader('content-type', 'application/javascript; charset=utf-8');
    res.setHeader('cache-control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
    res.end(code);
  } catch (error) {
    console.error('ColdChat shell patch failed', error);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/javascript; charset=utf-8');
    res.end('throw new Error("ColdChat UI failed to load");');
  }
}
