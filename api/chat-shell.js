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

    // Clicking the compact message menu must not trigger reply mode.
    code = once(
      code,
      't.target.closest(`button, audio, input, label, a`)||M(e)',
      't.target.closest(`button, summary, details, audio, input, label, a`)||M(e)'
    );

    // Pinned public messages always stay above regular messages.
    code = once(
      code,
      'return Array.from(r.values()).sort((e,t)=>e.createdAt.localeCompare(t.createdAt)||e.id.localeCompare(t.id))',
      'return Array.from(r.values()).sort((e,t)=>(t.pinned?1:0)-(e.pinned?1:0)||(e.pinned&&t.pinned?(t.pinnedAt||``).localeCompare(e.pinnedAt||``):0)||e.createdAt.localeCompare(t.createdAt)||e.id.localeCompare(t.id))'
    );
    code = once(
      code,
      'return[...n,...e.filter(e=>e.pending&&!i.has(e.id))]',
      'return[...n,...e.filter(e=>e.pending&&!i.has(e.id))].sort((e,t)=>(t.pinned?1:0)-(e.pinned?1:0)||(e.pinned&&t.pinned?(t.pinnedAt||``).localeCompare(e.pinnedAt||``):0)||e.createdAt.localeCompare(t.createdAt)||e.id.localeCompare(t.id))'
    );

    // Pin support, with immediate local reordering after pin/unpin.
    code = once(
      code,
      'async function we(e){if(!Z&&!Q)return;let t=await fetch(`/api/messages/${encodeURIComponent(e.id)}`,{method:`DELETE`}),n=await t.json().catch(()=>({}));t.ok?p(t=>t.filter(t=>t.id!==e.id)):P(n.error||`Message not deleted.`)}function Te(e)',
      'async function we(e){if(!Z&&!Q)return;let t=await fetch(`/api/messages/${encodeURIComponent(e.id)}`,{method:`DELETE`}),n=await t.json().catch(()=>({}));t.ok?p(t=>t.filter(t=>t.id!==e.id)):P(n.error||`Message not deleted.`)}async function Pe(e){if(!Z&&!Q)return;let t=await fetch(`/api/messages/${encodeURIComponent(e.id)}/pin`,{method:`POST`}),n=await t.json().catch(()=>({}));t.ok?p(t=>t.map(t=>t.id===e.id?{...t,pinned:!!n.pinned,pinnedAt:n.pinned?new Date().toISOString():null}:t).sort((e,t)=>(t.pinned?1:0)-(e.pinned?1:0)||(e.pinned&&t.pinned?(t.pinnedAt||``).localeCompare(e.pinnedAt||``):0)||e.createdAt.localeCompare(t.createdAt)||e.id.localeCompare(t.id))):P(n.error||`Message not pinned.`)}function Te(e)'
    );
    code = once(
      code,
      'className:`message message-reply-target ${e.mine?`mine`:``} ${e.pending?`pending`:``}`',
      'className:`message message-reply-target ${e.mine?`mine`:``} ${e.pending?`pending`:``} ${e.pinned?`pinned`:``}`'
    );

    // Separate message metadata, body and timestamp so badges/media/time never fight for one line.
    code = once(
      code,
      '(0,a.jsxs)(`div`,{className:`message-content`,children:[e.reply?(0,a.jsxs)(`div`,{className:`quoted`,children:[(0,a.jsx)(`b`,{children:e.reply.name}),(0,a.jsx)(`span`,{children:e.reply.text})]}):null,(0,a.jsxs)(`div`,{className:`message-line`,children:[(0,a.jsx)(`b`,{className:`message-username`,style:{color:e.nameColor},children:e.name}),r?(0,a.jsx)(`em`,{className:`role-badge role-${e.role}`,children:r}):null,e.stickerUrl?(0,a.jsx)(`img`,{className:`sticker-message`,src:e.stickerUrl,alt:`Sticker`,draggable:!1}):e.audioUrl?(0,a.jsxs)(`div`,{className:`voice-message`,children:[(0,a.jsx)(`span`,{children:(0,a.jsx)(l,{name:`mic`,size:15})}),(0,a.jsx)(`audio`,{src:e.audioUrl,controls:!0,preload:`metadata`,controlsList:`nodownload noplaybackrate`})]}):(0,a.jsx)(`span`,{className:`message-text`,children:e.text}),(0,a.jsx)(`time`,{className:`message-time`,children:e.time})]}),e.reactions?.length?(0,a.jsx)(`div`,{className:`reactions`,children:e.reactions.map(t=>(0,a.jsxs)(`button`,{onClick:()=>Ce(e,t.emoji),children:[t.emoji,(0,a.jsx)(`b`,{children:t.count})]},t.emoji))}):null]})',
      '(0,a.jsxs)(`div`,{className:`message-content`,children:[e.reply?(0,a.jsxs)(`div`,{className:`quoted`,children:[(0,a.jsx)(`b`,{children:e.reply.name}),(0,a.jsx)(`span`,{children:e.reply.text})]}):null,(0,a.jsxs)(`div`,{className:`message-meta`,children:[(0,a.jsx)(`b`,{className:`message-username`,style:{color:e.nameColor},children:e.name}),r?(0,a.jsx)(`em`,{className:`role-badge role-${e.role}`,children:r}):null,e.pinned?(0,a.jsxs)(`em`,{className:`pin-badge`,children:[`📌 `,`Pinned`]}):null]}),(0,a.jsx)(`div`,{className:`message-body`,children:e.stickerUrl?(0,a.jsx)(`img`,{className:`sticker-message`,src:e.stickerUrl,alt:`Sticker`,draggable:!1}):e.audioUrl?(0,a.jsxs)(`div`,{className:`voice-message`,children:[(0,a.jsx)(`span`,{children:(0,a.jsx)(l,{name:`mic`,size:15})}),(0,a.jsx)(`audio`,{src:e.audioUrl,controls:!0,preload:`metadata`,controlsList:`nodownload noplaybackrate`})]}):(0,a.jsx)(`span`,{className:`message-text`,children:e.text})}),e.reactions?.length?(0,a.jsx)(`div`,{className:`reactions`,children:e.reactions.map(t=>(0,a.jsxs)(`button`,{onClick:()=>Ce(e,t.emoji),children:[t.emoji,(0,a.jsx)(`b`,{children:t.count})]},t.emoji))}):null,(0,a.jsx)(`time`,{className:`message-time`,children:e.time})]})'
    );

    // One subtle message-action trigger. Reactions and moderation actions appear only in its popover.
    code = once(
      code,
      '(0,a.jsxs)(`div`,{className:`message-actions`,children:[(0,a.jsx)(`button`,{onClick:()=>Ce(e,`🧊`),"aria-label":`React`,children:`🧊`}),Z||Q?(0,a.jsx)(`button`,{onClick:()=>void we(e),"aria-label":`Delete message`,children:(0,a.jsx)(l,{name:`trash`,size:14})}):null,(Z||Q)&&e.profileId!==t?.id?(0,a.jsx)(`button`,{onClick:()=>Te(e.profileId),"aria-label":`Moderate ${e.name}`,children:(0,a.jsx)(l,{name:`more`,size:15})}):null]})',
      '(0,a.jsx)(`div`,{className:`message-actions`,children:(0,a.jsxs)(`details`,{className:`reaction-menu`,children:[(0,a.jsx)(`summary`,{"aria-label":`Message actions`,title:`React`,children:`♡`}),(0,a.jsxs)(`div`,{className:`reaction-popover`,children:[(0,a.jsx)(`button`,{onClick:t=>{Ce(e,`❤️`),t.currentTarget.closest(`details`)?.removeAttribute(`open`)},"aria-label":`React with heart`,children:`❤️`}),(0,a.jsx)(`button`,{onClick:t=>{Ce(e,`🔥`),t.currentTarget.closest(`details`)?.removeAttribute(`open`)},"aria-label":`React with fire`,children:`🔥`}),(0,a.jsx)(`button`,{onClick:t=>{Ce(e,`🧊`),t.currentTarget.closest(`details`)?.removeAttribute(`open`)},"aria-label":`React with ice`,children:`🧊`}),Z||Q?(0,a.jsx)(`span`,{className:`reaction-divider`}):null,Z||Q?(0,a.jsx)(`button`,{onClick:t=>{Pe(e),t.currentTarget.closest(`details`)?.removeAttribute(`open`)},"aria-label":e.pinned?`Unpin message`:`Pin message`,title:e.pinned?`Unpin`:`Pin`,children:e.pinned?`📍`:`📌`}):null,Z||Q?(0,a.jsx)(`button`,{onClick:t=>{we(e),t.currentTarget.closest(`details`)?.removeAttribute(`open`)},"aria-label":`Delete message`,children:(0,a.jsx)(l,{name:`trash`,size:14})}):null,(Z||Q)&&e.profileId!==t?.id?(0,a.jsx)(`button`,{onClick:t=>{Te(e.profileId),t.currentTarget.closest(`details`)?.removeAttribute(`open`)},"aria-label":`Moderate ${e.name}`,children:(0,a.jsx)(l,{name:`more`,size:15})}):null]})]})})'
    );

    // Profile logout: clear server session, browser bridge and fallback cookies before returning to login.
    code = once(
      code,
      'finally{y(!1)}}let T=t||{id:0',
      'finally{y(!1)}}async function logout(){try{await fetch(`/api/auth/logout`,{method:`POST`,credentials:`include`,cache:`no-store`})}catch{}try{localStorage.removeItem(`coldchat_session_bridge`)}catch{}document.cookie=`cc_access=; Path=/; Max-Age=0; Secure; SameSite=Lax`;document.cookie=`cc_refresh=; Path=/; Max-Age=0; Secure; SameSite=Lax`;location.replace(`/login`)}let T=t||{id:0'
    );
    code = once(
      code,
      '(0,a.jsxs)(`button`,{className:`primary-action`,onClick:w,disabled:v||!!C,children:[v?`Saving…`:t?`Save profile`:`Create account`,(0,a.jsx)(l,{name:`arrow`,size:17})]}),(0,a.jsx)(`p`,{className:`privacy-note`,children:e.email.replace(/^(.{2}).*(@.*)$/,`$1•••$2`)})',
      '(0,a.jsxs)(`button`,{className:`primary-action`,onClick:w,disabled:v||!!C,children:[v?`Saving…`:t?`Save profile`:`Create account`,(0,a.jsx)(l,{name:`arrow`,size:17})]}),t?(0,a.jsx)(`button`,{type:`button`,onClick:logout,style:{width:`100%`,height:36,marginTop:7,border:`1px solid #ff71852b`,borderRadius:10,background:`#ff718508`,color:`#ff9aaa`,fontSize:9,fontWeight:800,letterSpacing:.15,cursor:`pointer`},children:`Log out`}):null,(0,a.jsx)(`p`,{className:`privacy-note`,children:e.email.replace(/^(.{2}).*(@.*)$/,`$1•••$2`)})'
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

    // Route every recovered UI API call through our native backend.
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
