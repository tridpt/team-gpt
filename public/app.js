/* TeamGPT — chat client (vanilla JS, no build step). */

const $ = (sel) => document.querySelector(sel);

const state = {
  user: null,
  config: { defaultModel: '', availableModels: [] },
  conversations: [],
  activeId: null,
  limits: { dailyRequests: null, dailyCostUsd: null },
  usage: { requests: 0, costUsd: 0 },
  sending: false,
};

/* ── API helpers ── */
async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

/* ── View switching ── */
function showLogin() {
  $('#login-view').classList.remove('hidden');
  $('#app-view').classList.add('hidden');
}
function showApp() {
  $('#login-view').classList.add('hidden');
  $('#app-view').classList.remove('hidden');
}

/* ── Auth ── */
async function bootstrap() {
  try {
    const me = await api('/api/auth/me');
    state.user = me.user;
    state.config = me.config;
    state.limits = me.budget || state.limits;
    onAuthenticated();
  } catch {
    showLogin();
  }
}

function onAuthenticated() {
  showApp();
  $('#user-name').textContent = state.user.name || state.user.email;
  if (state.user.role === 'admin') $('#admin-link').classList.remove('hidden');
  populateModels();
  loadConversations();
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = $('#login-error');
  errEl.textContent = '';
  try {
    await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: $('#email').value, password: $('#password').value }),
    });
    await bootstrap();
  } catch (err) {
    errEl.textContent = err.message;
  }
});

$('#logout-link').addEventListener('click', async (e) => {
  e.preventDefault();
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } catch {
    /* ignore */
  }
  state.user = null;
  state.conversations = [];
  state.activeId = null;
  showLogin();
});

$('#change-pw-link').addEventListener('click', async (e) => {
  e.preventDefault();
  const currentPassword = prompt('Current password:');
  if (!currentPassword) return;
  const newPassword = prompt('New password (min 6 characters):');
  if (!newPassword) return;
  const confirmPassword = prompt('Confirm new password:');
  if (newPassword !== confirmPassword) {
    alert('New passwords do not match.');
    return;
  }
  try {
    await api('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    alert('Password changed.');
  } catch (err) {
    alert(err.message);
  }
});

/* ── Models ── */
function populateModels() {
  const sel = $('#model-select');
  sel.innerHTML = '';
  for (const m of state.config.availableModels) {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    sel.appendChild(opt);
  }
  sel.value = state.config.defaultModel || state.config.availableModels[0] || '';
}

/* ── Conversations list ── */
async function loadConversations() {
  const data = await api('/api/conversations');
  state.conversations = data.conversations;
  state.limits = data.limits || state.limits;
  state.usage = data.usage || state.usage;
  renderConversations();
  renderBudget();
  if (!state.activeId && state.conversations.length) {
    openConversation(state.conversations[0].id);
  } else if (!state.conversations.length) {
    renderEmptyState();
  }
}

function renderConversations() {
  const list = $('#conv-list');
  list.innerHTML = '';
  for (const c of state.conversations) {
    const item = document.createElement('div');
    item.className = 'conv-item' + (c.id === state.activeId ? ' active' : '');

    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = c.title || 'New chat';
    title.title = c.title || 'New chat';
    title.addEventListener('click', () => openConversation(c.id));

    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '×';
    del.title = 'Delete conversation';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteConversation(c.id);
    });

    item.append(title, del);
    list.appendChild(item);
  }
}

async function newConversation() {
  const model = $('#model-select').value || state.config.defaultModel;
  const conv = await api('/api/conversations', {
    method: 'POST',
    body: JSON.stringify({ model }),
  });
  state.conversations.unshift({ ...conv, messageCount: 0 });
  renderConversations();
  openConversation(conv.id);
  $('#input').focus();
}

async function deleteConversation(id) {
  if (!confirm('Delete this conversation?')) return;
  await api(`/api/conversations/${id}`, { method: 'DELETE' });
  state.conversations = state.conversations.filter((c) => c.id !== id);
  if (state.activeId === id) {
    state.activeId = null;
    if (state.conversations.length) openConversation(state.conversations[0].id);
    else renderEmptyState();
  }
  renderConversations();
}

$('#new-chat-btn').addEventListener('click', () => newConversation());

/* ── Active conversation / messages ── */
async function openConversation(id) {
  state.activeId = id;
  renderConversations();
  const conv = await api(`/api/conversations/${id}`);
  const sel = $('#model-select');
  if ([...sel.options].some((o) => o.value === conv.model)) sel.value = conv.model;
  renderMessages(conv.messages);
}

function renderEmptyState() {
  $('#messages').innerHTML =
    '<div class="empty-state"><h2>Start a new conversation</h2>' +
    '<p>Pick a model and send your first message.</p></div>';
}

function renderMessages(messages) {
  const box = $('#messages');
  box.innerHTML = '';
  if (!messages || !messages.length) {
    renderEmptyState();
    return;
  }
  for (const m of messages) appendMessage(m.role, m.content);
  scrollToBottom();
}

function appendMessage(role, content) {
  const box = $('#messages');
  const empty = box.querySelector('.empty-state');
  if (empty) empty.remove();

  const wrap = document.createElement('div');
  wrap.className = 'msg-wrap';

  const msg = document.createElement('div');
  msg.className = `msg ${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = role === 'user' ? 'You'.slice(0, 2).toUpperCase() : 'AI';

  const contentEl = document.createElement('div');
  contentEl.className = 'content';
  contentEl.textContent = content;

  msg.append(avatar, contentEl);
  wrap.appendChild(msg);
  box.appendChild(wrap);
  return contentEl;
}

function scrollToBottom() {
  const box = $('#messages');
  box.scrollTop = box.scrollHeight;
}

/* ── Sending a message (SSE stream) ── */
async function sendMessage() {
  const input = $('#input');
  const content = input.value.trim();
  if (!content || state.sending) return;

  // Create a conversation on the fly if none is active.
  if (!state.activeId) {
    await newConversation();
  }
  const convId = state.activeId;

  state.sending = true;
  setComposerEnabled(false);
  input.value = '';
  autoGrow(input);

  appendMessage('user', content);
  const assistantEl = appendMessage('assistant', '');
  assistantEl.classList.add('streaming');
  scrollToBottom();

  try {
    const res = await fetch(`/api/conversations/${convId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });

    if (!res.ok || !res.body) {
      const data = await res.json().catch(() => ({}));
      assistantEl.textContent = `⚠ ${data.error || 'Failed to send message.'}`;
      assistantEl.classList.add('error-msg');
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let text = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let sep;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        for (const line of frame.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') continue;
          let evt;
          try {
            evt = JSON.parse(payload);
          } catch {
            continue;
          }
          if (evt.type === 'delta') {
            text += evt.text;
            assistantEl.textContent = text;
            scrollToBottom();
          } else if (evt.type === 'done') {
            onMessageDone(convId, evt);
          } else if (evt.type === 'error') {
            assistantEl.textContent = `⚠ ${evt.error}`;
            assistantEl.classList.add('error-msg');
          }
        }
      }
    }
  } catch (err) {
    assistantEl.textContent = `⚠ ${err.message}`;
    assistantEl.classList.add('error-msg');
  } finally {
    assistantEl.classList.remove('streaming');
    state.sending = false;
    setComposerEnabled(true);
    input.focus();
  }
}

function onMessageDone(convId, evt) {
  // Bump usage locally and refresh the sidebar / titles.
  state.usage.requests = (state.usage.requests || 0) + 1;
  state.usage.costUsd = (state.usage.costUsd || 0) + (evt.costUsd || 0);
  renderBudget();
  loadConversations();
}

function setComposerEnabled(enabled) {
  $('#send-btn').disabled = !enabled;
  $('#input').disabled = !enabled;
}

$('#send-btn').addEventListener('click', () => sendMessage());

$('#input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

$('#input').addEventListener('input', (e) => autoGrow(e.target));

function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 200) + 'px';
}

$('#model-select').addEventListener('change', () => {
  // A conversation's model is fixed when it's created. Changing the dropdown
  // applies to the next new chat, so hint that when a conversation is open.
  $('#model-hint').textContent = state.activeId
    ? 'Model applies to new chats'
    : '';
});

/* ── Budget box ── */
function renderBudget() {
  const box = $('#budget-box');
  const { dailyRequests, dailyCostUsd } = state.limits || {};
  const reqUsed = state.usage.requests || 0;
  const costUsed = state.usage.costUsd || 0;

  const parts = [];
  if (dailyRequests != null) {
    const pct = Math.min(100, Math.round((reqUsed / dailyRequests) * 100));
    parts.push(
      `<div class="muted">Requests: ${reqUsed}/${dailyRequests}</div>` +
        `<div class="usage-bar"><span style="width:${pct}%"></span></div>`
    );
  } else {
    parts.push(`<div class="muted">Requests today: ${reqUsed}</div>`);
  }
  if (dailyCostUsd != null) {
    const pct = Math.min(100, Math.round((costUsed / dailyCostUsd) * 100));
    parts.push(
      `<div class="muted">Cost: $${costUsed.toFixed(4)}/$${dailyCostUsd}</div>` +
        `<div class="usage-bar"><span style="width:${pct}%"></span></div>`
    );
  } else {
    parts.push(`<div class="muted">Cost today: $${costUsed.toFixed(4)}</div>`);
  }
  box.innerHTML = parts.join('');
}

/* ── Go ── */
bootstrap();
