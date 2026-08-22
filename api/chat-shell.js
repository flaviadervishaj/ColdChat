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

    // Keep profile loading inside the recovered UI without reopening the legacy onboarding modal.
    code = once(
      code,
      'let e=await fetch(`/api/profile`,{cache:`no-store`}),t=await e.json();e.ok&&(n(t.profile),t.profile||I(`profile`))',
      'let e=await fetch(`/api/profile`,{cache:`no-store`}),t=await e.json().catch(()=>({}));e.ok&&n(t.profile)'
    );

    // A user is shown as authenticated in the top bar only after a profile exists.
    code = once(
      code,
      'e?(0,a.jsxs)(`button`,{className:`account-chip`,onClick:()=>I(`profile`),children:[(0,a.jsx)(d,{profile:t,size:`tiny`}),(0,a.jsx)(`span`,{style:{color:t?.nameColor},children:t?.username||`Create profile`})]}):(0,a.jsxs)(`button`,{className:`join-button`,onClick:()=>I(`signin`),children:[`Join `,(0,a.jsx)(l,{name:`arrow`,size:16})]})',
      't?(0,a.jsxs)(`button`,{className:`account-chip`,onClick:()=>I(`profile`),children:[(0,a.jsx)(d,{profile:t,size:`tiny`}),(0,a.jsx)(`span`,{style:{color:t?.nameColor},children:t.username})]}):(0,a.jsxs)(`button`,{className:`join-button`,onClick:()=>window.location.assign(`/login`),children:[`Join `,(0,a.jsx)(l,{name:`arrow`,size:16})]})'
    );

    code = once(
      code,
      'onClick:()=>{z(!1),I(t?`friends`:e?`profile`:`signin`)}',
      'onClick:()=>{z(!1),t?I(`friends`):window.location.assign(`/login`)}'
    );
    code = once(
      code,
      'onClick:()=>{z(!1),I(e?`profile`:`signin`)}',
      'onClick:()=>{z(!1),t?I(`profile`):window.location.assign(`/login`)}'
    );
    code = once(
      code,
      'onFocus:()=>{e?t||I(`profile`):I(`signin`)}',
      'onFocus:()=>{t||window.location.assign(`/login`)}'
    );

    // Keep private chat focused and provide a one-click way back to public chat.
    code = once(
      code,
      'className:`conversation-area ${B&&!y?`with-live`:`chat-only`}`',
      'className:`conversation-area ${B&&!y?`with-live`:`chat-only`} ${y?`private-view`:``}`'
    );
    code = once(
      code,
      'children:[y?null:(0,a.jsxs)(`button`,{className:`live-toggle`',
      'children:[y?(0,a.jsxs)(`button`,{className:`dm-back-button`,onClick:()=>b(null),"aria-label":`Back to public chat`,title:`Back to public chat`,children:[(0,a.jsx)(l,{name:`close`,size:15}),(0,a.jsx)(`span`,{children:`Public chat`})]}):(0,a.jsxs)(`button`,{className:`live-toggle`'
    );

    // The standalone backend does not expose the legacy SSE streams; poll instead.
    code = once(code, 's().then(c);let l=window.setInterval(s,12e3)', 's();let l=window.setInterval(s,2e3)');
    code = once(code, 'c().then(()=>{u(),l()});let d=window.setInterval(l,700),f=window.setInterval(c,1e4)', 'c().then(()=>{l()});let d=window.setInterval(l,700),f=window.setInterval(c,1e4)');

    // Quick reactions: ice, fire and heart.
    code = once(
      code,
      '(0,a.jsx)(`button`,{onClick:()=>Ce(e,`🧊`),"aria-label":`React`,children:`🧊`})',
      '(0,a.jsx)(`button`,{className:`quick-reaction`,onClick:()=>Ce(e,`🧊`),"aria-label":`React with ice`,children:`🧊`}),(0,a.jsx)(`button`,{className:`quick-reaction`,onClick:()=>Ce(e,`🔥`),"aria-label":`React with fire`,children:`🔥`}),(0,a.jsx)(`button`,{className:`quick-reaction`,onClick:()=>Ce(e,`❤️`),"aria-label":`React with heart`,children:`❤️`})'
    );

    // Pin support.
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

    // Moderator ban UI while keeping moderator assignment owner-only.
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

    // Important: send every recovered UI API call through our native backend.
    // This avoids the legacy /api/* fallback and keeps reads + writes on one auth/session path.
    code = code.replaceAll('/api/', '/standalone/');

    res.statusCode = 200;
    res.setHeader('content-type', 'application/javascript; charset=utf-8');
    res.setHeader('cache-control', 'no-store, max-age=0');
    res.end(code);
  } catch (error) {
    console.error('ColdChat shell patch failed', error);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/javascript; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.end('throw new Error("ColdChat UI failed to load");');
  }
}
