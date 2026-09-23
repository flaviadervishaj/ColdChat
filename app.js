const $ = selector => document.querySelector(selector);

const elements = {
  messages: $('#messages'), messageInput: $('#messageInput'), composer: $('#composer'), sendButton: $('#sendButton'),
  voiceButton: $('#voiceButton'), stickerButton: $('#stickerButton'), stickerPanel: $('#stickerPanel'), stickerGrid: $('#stickerGrid'),
  stickerUpload: $('#stickerUpload'), uploadStickerButton: $('#uploadStickerButton'), characterCount: $('#characterCount'),
  composerHint: $('#composerHint'), connectionState: $('#connectionState'), loginButton: $('#loginButton'),
  accountName: $('#accountName'), accountRole: $('#accountRole'), accountAvatar: $('#accountAvatar'), accountMenu: $('#accountMenu'),
  accountDialog: $('#accountDialog'), accountDialogName: $('#accountDialogName'), accountDialogEmail: $('#accountDialogEmail'),
  accountSignIn: $('#accountSignIn'), editProfileButton: $('#editProfileButton'), logoutButton: $('#logoutButton'),
  profileDialog: $('#profileDialog'), profileDialogTitle: $('#profileDialogTitle'), profileForm: $('#profileForm'),
  profileUsername: $('#profileUsername'), profileColor: $('#profileColor'), avatarUpload: $('#avatarUpload'), profileError: $('#profileError'),
  onlinePeople: $('#onlinePeople'), onlineCount: $('#onlineCount'), friendsNav: $('#friendsNav'), publicNav: $('#publicNav'),
  peopleDialog: $('#peopleDialog'), peopleContent: $('#peopleContent'), requestBadge: $('#requestBadge'),
  moderationNav: $('#moderationNav'), moderationDialog: $('#moderationDialog'), moderationContent: $('#moderationContent'),
  resetChatButton: $('#resetChatButton'), channelTitle: $('#channelTitle'), channelSubtitle: $('#channelSubtitle'), channelSymbol: $('#channelSymbol'),
  replyPreview: $('#replyPreview'), replyName: $('#replyName'), replyText: $('#replyText'), cancelReply: $('#cancelReply'),
  menuButton: $('#menuButton'), sidebar: $('#sidebar'), scrim: $('#scrim'), toast: $('#toast'),
};

const state = {
  authUser: null,
  profile: null,
  messages: [],
  stickers: [],
  friends: { friends: [], incoming: [], outgoing: [], discover: [] },
  activeFriend: null,
  directMessages: [],
  replyTo: null,
  recorder: null,
  recordingChunks: [],
  poll: null,
  toastTimer: null,
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ''), location.origin);
    return ['http:', 'https:'].includes(url.protocol) ? escapeHtml(url.href) : '';
  } catch { return ''; }
}

function avatar(person, size = '') {
  const image = safeUrl(person?.avatarUrl);
  const content = image ? `<img src="${image}" alt="">` : escapeHtml(person?.initials || Array.from(person?.name || '?').slice(0, 2).join('').toUpperCase());
  return `<span class="avatar ${size}">${content}</span>`;
}

async function api(path, options = {}) {
  const config = { credentials: 'include', cache: 'no-store', ...options, headers: { ...(options.headers || {}) } };
  if (options.body && !(options.body instanceof FormData) && typeof options.body !== 'string') {
    config.headers['content-type'] = 'application/json';
    config.body = JSON.stringify(options.body);
  }
  const response = await fetch(`/standalone/${path}`, config);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'The request could not be completed.');
    error.status = response.status;
    throw error;
  }
  return data;
}

function notify(message) {
  clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  state.toastTimer = setTimeout(() => { elements.toast.hidden = true; }, 3200);
}

function setConnection(online) {
  elements.connectionState.classList.toggle('online', online);
  elements.connectionState.lastChild.textContent = online ? ' Live' : ' Reconnecting';
}

function openDialog(dialog) {
  if (!dialog.open) dialog.showModal();
}

function closeMobileMenu() {
  elements.sidebar.classList.remove('open');
  elements.scrim.hidden = true;
}

function setAccountUI() {
  const signedIn = Boolean(state.authUser);
  const profile = state.profile;
  elements.loginButton.hidden = signedIn;
  elements.accountSignIn.hidden = signedIn;
  elements.editProfileButton.hidden = !profile;
  elements.logoutButton.hidden = !signedIn;
  elements.accountName.textContent = profile?.name || state.authUser?.email || 'Guest';
  elements.accountRole.textContent = profile?.role || (signedIn ? 'Profile required' : 'Read-only access');
  elements.accountDialogName.textContent = profile?.name || 'Your account';
  elements.accountDialogEmail.textContent = state.authUser?.email || 'Sign in to participate.';
  elements.accountAvatar.innerHTML = profile?.avatarUrl ? `<img src="${safeUrl(profile.avatarUrl)}" alt="">` : escapeHtml(profile?.initials || '?');
  const canWrite = Boolean(profile);
  elements.messageInput.disabled = !canWrite;
  elements.voiceButton.disabled = !canWrite || Boolean(state.activeFriend);
  elements.sendButton.disabled = !canWrite || !elements.messageInput.value.trim();
  elements.stickerButton.disabled = !canWrite || Boolean(state.activeFriend);
  elements.messageInput.placeholder = canWrite ? (state.activeFriend ? `Message ${state.activeFriend.name}` : 'Write a message…') : 'Sign in to join the conversation';
  elements.composerHint.textContent = canWrite ? 'Enter to send · Shift + Enter for a new line' : 'You can browse without an account.';
  const canModerate = ['owner', 'moderator'].includes(profile?.role);
  elements.moderationNav.hidden = !canModerate;
}

function formatDay(value) {
  try { return new Intl.DateTimeFormat('en', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(value)); }
  catch { return 'Conversation'; }
}

function messageMarkup(message) {
  const reply = message.reply ? `<div class="reply-quote"><strong>${escapeHtml(message.reply.name)}</strong> · ${escapeHtml(message.reply.text)}</div>` : '';
  const sticker = safeUrl(message.stickerUrl) ? `<img class="message-sticker" src="${safeUrl(message.stickerUrl)}" alt="Sticker from ${escapeHtml(message.name)}">` : '';
  const audio = safeUrl(message.audioUrl) ? `<audio controls preload="none" src="${safeUrl(message.audioUrl)}"></audio>` : '';
  const role = message.role && message.role !== 'member' ? `<span class="role-label">${escapeHtml(message.role)}</span>` : '';
  const reactions = message.reactions?.length ? `<div class="reactions">${message.reactions.map(reaction => `<button class="reaction-chip" type="button" data-action="react" data-id="${escapeHtml(message.id)}" data-emoji="${escapeHtml(reaction.emoji)}">${escapeHtml(reaction.emoji)} ${reaction.count}</button>`).join('')}</div>` : '';
  const canRemove = message.mine || ['owner', 'moderator'].includes(state.profile?.role);
  const canPin = ['owner', 'moderator'].includes(state.profile?.role);
  const actions = state.profile ? `<div class="message-actions">
    <button class="message-action" type="button" data-action="reply" data-id="${escapeHtml(message.id)}">Reply</button>
    <button class="message-action" type="button" data-action="react" data-id="${escapeHtml(message.id)}" data-emoji="👍">👍</button>
    <button class="message-action" type="button" data-action="react" data-id="${escapeHtml(message.id)}" data-emoji="❤️">❤️</button>
    ${canPin ? `<button class="message-action" type="button" data-action="pin" data-id="${escapeHtml(message.id)}">${message.pinned ? 'Unpin' : 'Pin'}</button>` : ''}
    ${canRemove ? `<button class="message-action" type="button" data-action="delete" data-id="${escapeHtml(message.id)}">Delete</button>` : ''}
  </div>` : '';
  return `<article class="message" id="message-${escapeHtml(message.id)}">
    ${avatar({ ...message, initials: message.avatar })}
    <div class="message-body">
      <div class="message-meta"><span class="message-name" style="color:${/^#[0-9a-f]{6}$/i.test(message.nameColor || '') ? message.nameColor : '#eef7ff'}">${escapeHtml(message.name)}</span>${role}<time class="message-time" datetime="${escapeHtml(message.createdAt)}">${escapeHtml(message.time)}</time>${message.pinned ? '<span class="pinned-label">Pinned</span>' : ''}</div>
      ${reply}${message.text ? `<p class="message-text">${escapeHtml(message.text)}</p>` : ''}${sticker}${audio}${reactions}${actions}
    </div>
  </article>`;
}

function renderMessages() {
  if (state.activeFriend) return renderDirectMessages();
  if (!state.messages.length) {
    elements.messages.innerHTML = '<div class="empty-state"><strong>Start the conversation</strong><p>This room is quiet right now. Be the first to say hello.</p></div>';
    return;
  }
  let previousDay = '';
  elements.messages.innerHTML = state.messages.map(message => {
    const day = formatDay(message.createdAt);
    const divider = day !== previousDay ? `<div class="date-divider">${escapeHtml(day)}</div>` : '';
    previousDay = day;
    return divider + messageMarkup(message);
  }).join('');
}

function renderDirectMessages() {
  if (!state.directMessages.length) {
    elements.messages.innerHTML = `<div class="empty-state"><strong>Say hello to ${escapeHtml(state.activeFriend?.name)}</strong><p>Private messages are visible only to the two of you.</p></div>`;
    return;
  }
  elements.messages.innerHTML = state.directMessages.map(message => `<article class="dm-message ${message.mine ? 'mine' : ''}"><p>${escapeHtml(message.text)}</p><time datetime="${escapeHtml(message.createdAt)}">${escapeHtml(message.time)}</time></article>`).join('');
}

async function loadMessages({ quiet = false } = {}) {
  const nearBottom = elements.messages.scrollHeight - elements.messages.scrollTop - elements.messages.clientHeight < 140;
  try {
    if (state.activeFriend) {
      const data = await api(`dms?with=${encodeURIComponent(state.activeFriend.id)}`);
      state.directMessages = data.messages || [];
    } else {
      const data = await api('messages');
      state.messages = data.messages || [];
    }
    renderMessages();
    if (nearBottom || !quiet) elements.messages.scrollTop = elements.messages.scrollHeight;
    setConnection(true);
  } catch (error) {
    setConnection(false);
    if (!quiet) elements.messages.innerHTML = `<div class="empty-state"><strong>Conversation unavailable</strong><p>${escapeHtml(error.message)}</p></div>`;
  }
}

function personRow(person, options = {}) {
  const action = options.action ? `<button class="mini-button ${options.primary ? 'primary' : ''}" type="button" data-friend-action="${escapeHtml(options.action)}" data-person-id="${escapeHtml(person.id)}">${escapeHtml(options.label)}</button>` : '';
  const chat = options.chat ? `<button class="mini-button primary" type="button" data-chat-id="${escapeHtml(person.id)}">Message</button>` : '';
  return `<div class="person-row">${avatar(person, 'small')}<div class="person-copy"><strong style="color:${/^#[0-9a-f]{6}$/i.test(person.nameColor || '') ? person.nameColor : '#eef7ff'}">${escapeHtml(person.name)}</strong><small>${escapeHtml(person.role || 'member')}</small></div><div class="row-actions">${chat}${action}</div></div>`;
}

function renderPresence(people) {
  elements.onlineCount.textContent = people.length;
  elements.onlinePeople.innerHTML = people.length ? people.map(person => `<div class="person-row">${avatar(person, 'small')}<div class="person-copy"><strong>${escapeHtml(person.name)}</strong><small>${escapeHtml(person.role || 'member')}</small></div><span class="presence-dot" aria-label="Online"></span></div>`).join('') : '<p class="empty-copy">No one is visible yet.</p>';
}

async function loadPresence() {
  try {
    if (state.profile) await api('presence', { method: 'POST' });
    const data = await api('presence');
    renderPresence(data.people || []);
  } catch { /* Presence is non-critical. */ }
}

function peopleSection(title, rows, emptyText) {
  return `<section class="people-section"><h3>${escapeHtml(title)}</h3>${rows.length ? rows.join('') : `<p class="empty-copy">${escapeHtml(emptyText)}</p>`}</section>`;
}

function renderPeople() {
  const groups = state.friends;
  elements.peopleContent.innerHTML = [
    peopleSection('Friends', groups.friends.map(person => personRow(person, { chat: true, action: 'remove', label: 'Remove' })), 'Friends you add will appear here.'),
    peopleSection('Requests', groups.incoming.map(person => personRow(person, { action: 'accept', label: 'Accept', primary: true })), 'No incoming requests.'),
    peopleSection('Sent', groups.outgoing.map(person => personRow(person, { action: 'remove', label: 'Cancel' })), 'No pending requests.'),
    peopleSection('Discover', groups.discover.map(person => personRow(person, { action: 'request', label: 'Add' })), 'No more people to discover.'),
  ].join('');
  elements.requestBadge.textContent = groups.incoming.length;
  elements.requestBadge.hidden = !groups.incoming.length;
}

async function loadPeople({ open = false } = {}) {
  if (!state.profile) {
    if (open) location.href = '/login';
    return;
  }
  if (open) {
    elements.peopleContent.innerHTML = '<p class="empty-copy">Loading people…</p>';
    openDialog(elements.peopleDialog);
  }
  try {
    state.friends = await api('friends');
    renderPeople();
  } catch (error) { elements.peopleContent.innerHTML = `<p class="form-error">${escapeHtml(error.message)}</p>`; }
}

function findFriend(id) {
  return state.friends.friends.find(person => String(person.id) === String(id));
}

async function openConversation(id) {
  const friend = findFriend(id);
  if (!friend) return;
  state.activeFriend = friend;
  state.directMessages = [];
  state.replyTo = null;
  elements.peopleDialog.close();
  elements.publicNav.classList.remove('active');
  elements.channelSymbol.textContent = '@';
  elements.channelTitle.textContent = friend.name;
  elements.channelSubtitle.textContent = 'Private conversation';
  setAccountUI();
  await loadMessages();
}

async function openPublicRoom() {
  state.activeFriend = null;
  state.directMessages = [];
  state.replyTo = null;
  elements.publicNav.classList.add('active');
  elements.channelSymbol.textContent = '#';
  elements.channelTitle.textContent = 'Public room';
  elements.channelSubtitle.textContent = 'A shared place for everyone';
  setAccountUI();
  closeMobileMenu();
  await loadMessages();
}

async function loadStickers() {
  try {
    const data = await api('stickers');
    state.stickers = data.stickers || [];
    elements.stickerGrid.innerHTML = state.stickers.length ? state.stickers.map(sticker => `<button class="sticker" type="button" data-sticker-id="${escapeHtml(sticker.id)}" title="By ${escapeHtml(sticker.creatorName)}"><img src="${safeUrl(sticker.url)}" alt="Sticker"></button>`).join('') : '<p class="empty-copy">No stickers yet.</p>';
  } catch (error) { elements.stickerGrid.innerHTML = `<p class="form-error">${escapeHtml(error.message)}</p>`; }
}

function setReply(message) {
  state.replyTo = message;
  elements.replyName.textContent = message.name;
  elements.replyText.textContent = message.text || (message.audioUrl ? 'Voice message' : 'Sticker');
  elements.replyPreview.hidden = false;
  elements.messageInput.focus();
}

function clearReply() {
  state.replyTo = null;
  elements.replyPreview.hidden = true;
}

async function sendMessage() {
  const text = elements.messageInput.value.trim();
  if (!text || !state.profile) return;
  elements.sendButton.disabled = true;
  try {
    if (state.activeFriend) {
      await api('dms', { method: 'POST', body: { recipientProfileId: state.activeFriend.id, text, clientMessageId: crypto.randomUUID() } });
    } else {
      await api('messages', { method: 'POST', body: { text, replyToId: state.replyTo?.id || null, clientMessageId: crypto.randomUUID() } });
    }
    elements.messageInput.value = '';
    elements.messageInput.style.height = 'auto';
    elements.characterCount.textContent = '0 / 4000';
    clearReply();
    await loadMessages();
  } catch (error) { notify(error.message); }
  finally { elements.sendButton.disabled = false; }
}

async function sendSticker(stickerId) {
  try {
    await api('messages', { method: 'POST', body: { stickerId: Number(stickerId), replyToId: state.replyTo?.id || null, clientMessageId: crypto.randomUUID() } });
    elements.stickerPanel.hidden = true;
    clearReply();
    await loadMessages();
  } catch (error) { notify(error.message); }
}

async function toggleRecording() {
  if (state.recorder) {
    state.recorder.stop();
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.recordingChunks = [];
    state.recorder = new MediaRecorder(stream);
    state.recorder.addEventListener('dataavailable', event => { if (event.data.size) state.recordingChunks.push(event.data); });
    state.recorder.addEventListener('stop', async () => {
      const type = state.recorder.mimeType || 'audio/webm';
      const blob = new Blob(state.recordingChunks, { type });
      stream.getTracks().forEach(track => track.stop());
      state.recorder = null;
      elements.voiceButton.classList.remove('recording');
      elements.voiceButton.textContent = '◉';
      const body = new FormData();
      body.append('voice', blob, 'voice-message.webm');
      try { await api('messages/voice', { method: 'POST', body }); await loadMessages(); }
      catch (error) { notify(error.message); }
    });
    state.recorder.start();
    elements.voiceButton.classList.add('recording');
    elements.voiceButton.textContent = '■';
    notify('Recording… tap again to send.');
  } catch { notify('Microphone access is required for voice messages.'); }
}

async function loadSession() {
  const auth = await api('auth/me');
  state.authUser = auth.authUser;
  if (state.authUser) {
    try { state.profile = (await api('profile')).profile; }
    catch { state.profile = null; }
  }
  setAccountUI();
  if (state.authUser && !state.profile) {
    elements.profileUsername.value = '';
    elements.profileDialogTitle.textContent = 'Complete your profile';
    openDialog(elements.profileDialog);
  }
}

function prepareProfileDialog() {
  elements.profileDialogTitle.textContent = state.profile ? 'Edit your profile' : 'Complete your profile';
  elements.profileUsername.value = state.profile?.name || '';
  elements.profileUsername.disabled = Boolean(state.profile && state.profile.role !== 'owner');
  elements.profileColor.value = state.profile?.nameColor || '#74e9ff';
  elements.profileError.textContent = state.profile && state.profile.role !== 'owner' ? 'Display names can only be changed by a moderator.' : '';
  elements.accountDialog.close();
  openDialog(elements.profileDialog);
}

async function saveProfile(event) {
  event.preventDefault();
  elements.profileError.textContent = '';
  const submit = elements.profileForm.querySelector('button[type=submit]');
  submit.disabled = true;
  try {
    const method = state.profile ? 'PATCH' : 'POST';
    const body = { username: elements.profileUsername.value, nameColor: elements.profileColor.value };
    state.profile = (await api('profile', { method, body })).profile;
    const avatar = elements.avatarUpload.files[0];
    if (avatar) {
      const form = new FormData();
      form.append('avatar', avatar);
      state.profile = (await api('profile/avatar', { method: 'POST', body: form })).profile;
    }
    elements.profileDialog.close();
    setAccountUI();
    await Promise.all([loadMessages(), loadPeople(), loadPresence()]);
    notify('Profile saved.');
  } catch (error) { elements.profileError.textContent = error.message; }
  finally { submit.disabled = false; }
}

async function handleMessageAction(button) {
  const message = state.messages.find(item => item.id === button.dataset.id);
  if (!message) return;
  const action = button.dataset.action;
  try {
    if (action === 'reply') return setReply(message);
    if (action === 'react') await api('reactions', { method: 'POST', body: { messageId: message.id, emoji: button.dataset.emoji } });
    if (action === 'pin') await api(`messages/${message.id}/pin`, { method: 'POST' });
    if (action === 'delete') {
      if (!confirm('Delete this message?')) return;
      await api(`messages/${message.id}`, { method: 'DELETE' });
    }
    await loadMessages({ quiet: true });
  } catch (error) { notify(error.message); }
}

async function loadModeration() {
  elements.moderationContent.innerHTML = '<p class="empty-copy">Loading users…</p>';
  openDialog(elements.moderationDialog);
  try {
    const data = await api('moderation');
    elements.moderationContent.innerHTML = (data.users || []).map(person => `<div class="moderation-row">${personRow(person)}<div class="row-actions">
      <button class="mini-button" type="button" data-mod-action="timeout" data-person-id="${escapeHtml(person.id)}">Timeout</button>
      <button class="mini-button" type="button" data-mod-action="${person.restriction ? 'unban' : 'ban'}" data-person-id="${escapeHtml(person.id)}">${person.restriction ? 'Restore' : 'Ban'}</button>
      ${state.profile.role === 'owner' ? `<button class="mini-button" type="button" data-mod-action="set_moderator" data-person-id="${escapeHtml(person.id)}" data-enabled="${person.role !== 'moderator'}">${person.role === 'moderator' ? 'Remove mod' : 'Make mod'}</button>` : ''}
    </div></div>`).join('');
  } catch (error) { elements.moderationContent.innerHTML = `<p class="form-error">${escapeHtml(error.message)}</p>`; }
}

async function moderate(button) {
  const action = button.dataset.modAction;
  const body = { action, targetProfileId: Number(button.dataset.personId) };
  if (action === 'timeout') {
    const value = prompt('Timeout length in minutes (1–43200):', '60');
    if (value == null) return;
    body.minutes = Number(value);
    body.reason = prompt('Reason (optional):', '') || '';
  } else if (action === 'ban') {
    if (!confirm('Ban this user from the community?')) return;
    body.reason = prompt('Reason (optional):', '') || '';
  } else if (action === 'set_moderator') body.enabled = button.dataset.enabled === 'true';
  try { await api('moderation', { method: 'POST', body }); await loadModeration(); }
  catch (error) { notify(error.message); }
}

elements.loginButton.addEventListener('click', () => { location.href = '/login'; });
elements.accountMenu.addEventListener('click', () => openDialog(elements.accountDialog));
elements.editProfileButton.addEventListener('click', prepareProfileDialog);
elements.logoutButton.addEventListener('click', async () => { await api('auth/logout', { method: 'POST' }).catch(() => null); location.reload(); });
elements.profileForm.addEventListener('submit', saveProfile);
elements.publicNav.addEventListener('click', openPublicRoom);
elements.friendsNav.addEventListener('click', () => { closeMobileMenu(); loadPeople({ open: true }); });
elements.moderationNav.addEventListener('click', () => { closeMobileMenu(); loadModeration(); });
elements.cancelReply.addEventListener('click', clearReply);
elements.menuButton.addEventListener('click', () => { elements.sidebar.classList.add('open'); elements.scrim.hidden = false; });
elements.scrim.addEventListener('click', closeMobileMenu);

elements.composer.addEventListener('submit', event => { event.preventDefault(); sendMessage(); });
elements.messageInput.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); }
});
elements.messageInput.addEventListener('input', () => {
  elements.messageInput.style.height = 'auto';
  elements.messageInput.style.height = `${Math.min(elements.messageInput.scrollHeight, 130)}px`;
  elements.characterCount.textContent = `${elements.messageInput.value.length} / 4000`;
  elements.sendButton.disabled = !state.profile || !elements.messageInput.value.trim();
});
elements.messages.addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (button) handleMessageAction(button);
});

elements.stickerButton.addEventListener('click', async () => {
  if (!state.profile) return location.assign('/login');
  elements.stickerPanel.hidden = !elements.stickerPanel.hidden;
  if (!elements.stickerPanel.hidden) await loadStickers();
});
elements.stickerGrid.addEventListener('click', event => {
  const button = event.target.closest('[data-sticker-id]');
  if (button) sendSticker(button.dataset.stickerId);
});
elements.uploadStickerButton.addEventListener('click', () => elements.stickerUpload.click());
elements.stickerUpload.addEventListener('change', async () => {
  const file = elements.stickerUpload.files[0];
  if (!file) return;
  const form = new FormData(); form.append('sticker', file);
  try { await api('stickers', { method: 'POST', body: form }); await loadStickers(); notify('Sticker added.'); }
  catch (error) { notify(error.message); }
  elements.stickerUpload.value = '';
});
elements.voiceButton.addEventListener('click', toggleRecording);

elements.peopleContent.addEventListener('click', async event => {
  const chat = event.target.closest('[data-chat-id]');
  if (chat) return openConversation(chat.dataset.chatId);
  const button = event.target.closest('[data-friend-action]');
  if (!button) return;
  try {
    await api('friends', { method: 'POST', body: { action: button.dataset.friendAction, targetProfileId: Number(button.dataset.personId) } });
    await loadPeople();
  } catch (error) { notify(error.message); }
});
elements.moderationContent.addEventListener('click', event => {
  const button = event.target.closest('[data-mod-action]');
  if (button) moderate(button);
});
elements.resetChatButton.addEventListener('click', async () => {
  if (!confirm('Clear every message in the public room? This cannot be undone.')) return;
  try { await api('reset-chat', { method: 'POST' }); elements.moderationDialog.close(); await openPublicRoom(); notify('Public conversation cleared.'); }
  catch (error) { notify(error.message); }
});

async function bootstrap() {
  try {
    await loadSession();
    await Promise.all([loadMessages(), loadPresence(), loadStickers(), state.profile ? loadPeople() : Promise.resolve()]);
    setConnection(true);
  } catch (error) {
    setConnection(false);
    notify(error.message);
    await loadMessages();
  }
  state.poll = setInterval(() => loadMessages({ quiet: true }), 3500);
  setInterval(loadPresence, 30000);
}

bootstrap();
