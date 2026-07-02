/* TeamGPT — chat client (vanilla JS, no build step). */

const $ = (sel) => document.querySelector(sel);

/* ── Minimal, XSS-safe Markdown renderer ──
 * Escapes everything first, then applies a small subset of Markdown. Because
 * escaping happens before any tag is inserted, model output can never inject
 * HTML. */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

/* Lightweight, language-agnostic syntax highlighter. Tokenizes raw code and
 * escapes each piece, so it's XSS-safe. Not a full parser — just colors
 * comments, strings, numbers, and common keywords. */
const CODE_KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do',
  'switch', 'case', 'break', 'continue', 'new', 'class', 'extends', 'super', 'this',
  'import', 'export', 'from', 'default', 'async', 'await', 'yield', 'try', 'catch',
  'finally', 'throw', 'typeof', 'instanceof', 'in', 'of', 'void', 'delete', 'null',
  'undefined', 'true', 'false', 'def', 'elif', 'lambda', 'None', 'True', 'False',
  'and', 'or', 'not', 'pass', 'with', 'as', 'public', 'private', 'protected', 'static',
  'int', 'float', 'string', 'bool', 'boolean', 'void', 'struct', 'enum', 'interface',
  'type', 'func', 'package', 'select', 'insert', 'update', 'delete', 'where',
]);

function highlightCode(code) {
  const pattern =
    /(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d[\w.]*\b)|([A-Za-z_$][\w$]*)/g;
  let out = '';
  let last = 0;
  let m;
  while ((m = pattern.exec(code))) {
    out += escapeHtml(code.slice(last, m.index));
    const [full, comment, str, num, word] = m;
    if (comment) out += `<span class="tok-com">${escapeHtml(comment)}</span>`;
    else if (str) out += `<span class="tok-str">${escapeHtml(str)}</span>`;
    else if (num) out += `<span class="tok-num">${escapeHtml(num)}</span>`;
    else if (word && CODE_KEYWORDS.has(word)) out += `<span class="tok-kw">${escapeHtml(word)}</span>`;
    else out += escapeHtml(full);
    last = m.index + full.length;
  }
  out += escapeHtml(code.slice(last));
  return out;
}

function renderMarkdown(src) {
  const codeBlocks = [];
  // 1) Protect fenced code blocks so their content isn't further formatted.
  let text = String(src).replace(/```[ \t]*[\w+-]*\n?([\s\S]*?)```/g, (m, code) => {
    const i = codeBlocks.length;
    codeBlocks.push(`<pre><code>${highlightCode(code.replace(/\n+$/, ''))}</code></pre>`);
    return `\u0000CB${i}\u0000`;
  });

  // 2) Escape the rest.
  text = escapeHtml(text);

  // 3) Inline formatting (content is already escaped).
  text = text.replace(/`([^`\n]+)`/g, (m, c) => `<code>${c}</code>`);
  text = text.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (m, t, u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>`
  );
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  text = text.replace(/(^|[^_])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>');

  // 4) Block-level assembly, line by line.
  const lines = text.split('\n');
  const html = [];
  let list = null;
  let para = [];
  let quote = [];
  const flushPara = () => { if (para.length) { html.push(`<p>${para.join('<br>')}</p>`); para = []; } };
  const flushList = () => { if (list) { html.push(`</${list}>`); list = null; } };
  const flushQuote = () => { if (quote.length) { html.push(`<blockquote>${quote.join('<br>')}</blockquote>`); quote = []; } };
  const flushAll = () => { flushPara(); flushList(); flushQuote(); };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const cb = line.match(/^\u0000CB(\d+)\u0000$/);
    if (cb) { flushAll(); html.push(codeBlocks[Number(cb[1])]); continue; }
    if (line.trim() === '') { flushAll(); continue; }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { flushAll(); const lvl = Math.min(h[1].length, 3); html.push(`<h${lvl}>${h[2]}</h${lvl}>`); continue; }

    const ul = line.match(/^[-*+]\s+(.*)$/);
    const ol = line.match(/^\d+\.\s+(.*)$/);
    if (ul || ol) {
      flushPara(); flushQuote();
      const want = ul ? 'ul' : 'ol';
      if (list !== want) { flushList(); list = want; html.push(`<${want}>`); }
      html.push(`<li>${ul ? ul[1] : ol[1]}</li>`);
      continue;
    }
    flushList();

    const bq = line.match(/^>\s?(.*)$/);
    if (bq) { flushPara(); quote.push(bq[1]); continue; }
    flushQuote();

    para.push(line);
  }
  flushAll();
  return html.join('\n');
}

const state = {
  user: null,
  config: { defaultModel: '', availableModels: [] },
  conversations: [],
  activeId: null,
  activeConv: null,
  limits: { dailyRequests: null, dailyCostUsd: null },
  usage: { requests: 0, costUsd: 0 },
  sending: false,
  abort: null,
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
async function loadConversations(q = '') {
  const url = q ? `/api/conversations?q=${encodeURIComponent(q)}` : '/api/conversations';
  const data = await api(url);
  state.conversations = data.conversations;
  state.limits = data.limits || state.limits;
  state.usage = data.usage || state.usage;
  renderConversations();
  renderBudget();
  if (!q) {
    if (!state.activeId && state.conversations.length) {
      openConversation(state.conversations[0].id);
    } else if (!state.conversations.length) {
      renderEmptyState();
    }
  }
}

let searchTimer = null;
$('#conv-search').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  searchTimer = setTimeout(() => loadConversations(q), 200);
});

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
    state.activeConv = null;
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
  state.activeConv = conv;
  const sel = $('#model-select');
  if ([...sel.options].some((o) => o.value === conv.model)) sel.value = conv.model;
  renderMessages(conv.messages);
  renderMessageActions();
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
  if (role === 'assistant') {
    contentEl.classList.add('md');
    contentEl.innerHTML = renderMarkdown(content);
  } else {
    contentEl.textContent = content;
  }

  msg.append(avatar, contentEl);
  wrap.appendChild(msg);
  box.appendChild(wrap);
  return contentEl;
}

function scrollToBottom() {
  const box = $('#messages');
  box.scrollTop = box.scrollHeight;
}

/* ── Sending / streaming ── */
async function sendMessage() {
  const input = $('#input');
  const content = input.value.trim();
  if (!content || state.sending) return;

  // Create a conversation on the fly if none is active.
  if (!state.activeId) {
    await newConversation();
  }
  const convId = state.activeId;

  input.value = '';
  autoGrow(input);
  document.getElementById('msg-actions')?.remove();
  appendMessage('user', content);

  const ac = new AbortController();
  state.abort = ac;
  setSending(true);
  const assistantEl = appendMessage('assistant', '');
  assistantEl.classList.add('streaming');
  scrollToBottom();

  await runStream(`/api/conversations/${convId}/messages`, { content }, assistantEl, ac);
}

/** Regenerate the last reply; pass newContent to edit-and-resend the prompt. */
async function regenerate(newContent) {
  if (state.sending || !state.activeId) return;
  document.getElementById('msg-actions')?.remove();

  // Match the DOM to what the server will do: drop the trailing assistant
  // bubble (being replaced) and, if editing, update the last user bubble.
  lastMessageWrap('assistant')?.remove();
  if (newContent != null) {
    const u = lastMessageWrap('user');
    if (u) u.querySelector('.content').textContent = newContent;
  }

  const ac = new AbortController();
  state.abort = ac;
  setSending(true);
  const assistantEl = appendMessage('assistant', '');
  assistantEl.classList.add('streaming');
  scrollToBottom();

  const body = newContent != null ? { content: newContent } : {};
  await runStream(`/api/conversations/${state.activeId}/regenerate`, body, assistantEl, ac);
}

function editLast(currentContent) {
  const edited = prompt('Edit your message:', currentContent);
  if (edited == null) return;
  const trimmed = edited.trim();
  if (trimmed) regenerate(trimmed);
}

/** Read an SSE stream into an assistant bubble. Shared by send & regenerate. */
async function runStream(url, body, assistantEl, ac) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ac.signal,
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
            assistantEl.innerHTML = renderMarkdown(text);
            scrollToBottom();
          } else if (evt.type === 'done') {
            await onMessageDone(evt);
          } else if (evt.type === 'error') {
            assistantEl.textContent = `⚠ ${evt.error}`;
            assistantEl.classList.add('error-msg');
          }
        }
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      if (!assistantEl.textContent.trim()) {
        assistantEl.textContent = '(stopped)';
        assistantEl.classList.add('muted');
      }
    } else {
      assistantEl.textContent = `⚠ ${err.message}`;
      assistantEl.classList.add('error-msg');
    }
  } finally {
    assistantEl.classList.remove('streaming');
    state.abort = null;
    setSending(false);
    $('#input').focus();
  }
}

async function onMessageDone(evt) {
  // Bump usage locally and refresh the sidebar / titles.
  state.usage.requests = (state.usage.requests || 0) + 1;
  state.usage.costUsd = (state.usage.costUsd || 0) + (evt.costUsd || 0);
  renderBudget();
  await loadConversations();
  // Refresh the open conversation so export/regenerate see the latest messages.
  if (state.activeId) {
    try {
      state.activeConv = await api(`/api/conversations/${state.activeId}`);
    } catch {
      /* ignore */
    }
  }
  renderMessageActions();
}

/** Find the DOM wrapper of the last message with the given role. */
function lastMessageWrap(role) {
  const wraps = $('#messages').querySelectorAll('.msg-wrap');
  for (let i = wraps.length - 1; i >= 0; i--) {
    if (wraps[i].querySelector(`.msg.${role}`)) return wraps[i];
  }
  return null;
}

/** Show a Regenerate / Edit toolbar under the thread (idle, with history). */
function renderMessageActions() {
  document.getElementById('msg-actions')?.remove();
  const conv = state.activeConv;
  if (state.sending || !conv || !conv.messages || !conv.messages.length) return;

  const lastUser = [...conv.messages].reverse().find((m) => m.role === 'user');
  if (!lastUser) return;

  const bar = document.createElement('div');
  bar.id = 'msg-actions';
  bar.className = 'msg-wrap msg-actions';

  const regen = document.createElement('button');
  regen.className = 'btn ghost';
  regen.textContent = '↻ Regenerate';
  regen.addEventListener('click', () => regenerate());

  const edit = document.createElement('button');
  edit.className = 'btn ghost';
  edit.textContent = '✎ Edit last';
  edit.addEventListener('click', () => editLast(lastUser.content));

  bar.append(regen, edit);
  $('#messages').appendChild(bar);
}

function setSending(sending) {
  state.sending = sending;
  $('#send-btn').classList.toggle('hidden', sending);
  $('#stop-btn').classList.toggle('hidden', !sending);
  $('#input').disabled = sending;
}

$('#send-btn').addEventListener('click', () => sendMessage());
$('#stop-btn').addEventListener('click', () => state.abort?.abort());

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

$('#model-select').addEventListener('change', async () => {
  const model = $('#model-select').value;
  if (!state.activeId) return; // applies to the next new chat
  try {
    await api(`/api/conversations/${state.activeId}`, {
      method: 'PATCH',
      body: JSON.stringify({ model }),
    });
    const c = state.conversations.find((x) => x.id === state.activeId);
    if (c) c.model = model;
    $('#model-hint').textContent = 'Model updated';
    setTimeout(() => { $('#model-hint').textContent = ''; }, 1500);
  } catch (err) {
    alert(err.message);
  }
});

/* ── Export & system prompt ── */
function downloadFile(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportConversation(format) {
  const conv = state.activeConv;
  if (!conv) {
    alert('Open a conversation first.');
    return;
  }
  const base = (conv.title || 'chat').replace(/[^\w\-]+/g, '_').slice(0, 40) || 'chat';

  if (format === 'json') {
    downloadFile(`${base}.json`, JSON.stringify(conv, null, 2), 'application/json');
    return;
  }

  const lines = [`# ${conv.title || 'Conversation'}`, '', `- Model: ${conv.model}`, `- Created: ${conv.createdAt}`];
  if (conv.systemPrompt) lines.push('', '## System', '', conv.systemPrompt);
  for (const m of conv.messages) {
    lines.push('', `## ${m.role === 'user' ? 'User' : 'Assistant'}`, '', m.content);
  }
  downloadFile(`${base}.md`, lines.join('\n'), 'text/markdown');
}

$('#export-md').addEventListener('click', () => exportConversation('md'));
$('#export-json').addEventListener('click', () => exportConversation('json'));

$('#system-btn').addEventListener('click', async () => {
  if (!state.activeId) {
    alert('Open or start a conversation first.');
    return;
  }
  const current = state.activeConv?.systemPrompt || '';
  const next = prompt('System prompt (instructions for the assistant). Leave blank to clear:', current);
  if (next == null) return;
  try {
    const conv = await api(`/api/conversations/${state.activeId}`, {
      method: 'PATCH',
      body: JSON.stringify({ systemPrompt: next }),
    });
    if (state.activeConv) state.activeConv.systemPrompt = conv.systemPrompt;
    $('#model-hint').textContent = next.trim() ? 'System prompt set' : 'System prompt cleared';
    setTimeout(() => { $('#model-hint').textContent = ''; }, 1500);
  } catch (err) {
    alert(err.message);
  }
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
