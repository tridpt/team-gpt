/* TeamGPT — admin dashboard (vanilla JS). */

const $ = (sel) => document.querySelector(sel);

const state = {
  users: [],
  groups: [],
  defaultBudget: { dailyRequests: null, dailyCostUsd: null },
};

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function setError(msg) {
  $('#admin-error').textContent = msg || '';
}

/* ── Load & render ── */
async function loadAll() {
  setError('');
  try {
    // Load groups first so the users table / modal can resolve group names.
    try {
      const g = await api('/api/admin/groups');
      state.groups = g.groups || [];
    } catch {
      state.groups = [];
    }
    const data = await api('/api/admin/users');
    state.users = data.users;
    state.defaultBudget = data.defaultBudget || state.defaultBudget;
    renderGroups();
    renderUsers();
  } catch (err) {
    if (err.status === 401) {
      window.location.href = '/';
      return;
    }
    if (err.status === 403) {
      setError('Admin access required.');
      return;
    }
    setError(err.message);
  }
  loadGatewayMetrics();
}

/* ── Groups ── */
function renderGroups() {
  const body = $('#groups-body');
  if (!body) return;
  body.innerHTML = '';
  if (!state.groups.length) {
    body.innerHTML = '<tr><td colspan="4" class="muted">No groups yet.</td></tr>';
    return;
  }
  for (const g of state.groups) {
    const memberCount = state.users.filter((u) => u.groupId === g.id).length;
    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td>${escapeHtml(g.name)}</td>` +
      `<td class="muted">${fmtLimit(g.budget || {})}</td>` +
      `<td>${memberCount}</td>`;

    const actions = document.createElement('td');
    actions.className = 'row-actions';
    const edit = document.createElement('button');
    edit.className = 'btn ghost';
    edit.textContent = 'Edit';
    edit.addEventListener('click', () => openGroupModal(g));
    const del = document.createElement('button');
    del.className = 'btn danger';
    del.textContent = 'Delete';
    del.addEventListener('click', () => deleteGroup(g));
    actions.append(edit, del);
    tr.appendChild(actions);
    body.appendChild(tr);
  }
}

function groupName(id) {
  const g = state.groups.find((x) => x.id === id);
  return g ? g.name : null;
}

async function loadGatewayMetrics() {
  const grid = $('#stat-grid');
  try {
    const m = await api('/api/admin/gateway-metrics');
    const stats = flattenMetrics(m);
    grid.innerHTML = stats
      .map(
        (s) =>
          `<div class="stat"><div class="label">${s.label}</div><div class="value">${s.value}</div></div>`,
      )
      .join('');
  } catch (err) {
    grid.innerHTML = `<div class="stat"><div class="label">Gateway metrics</div><div class="value muted" style="font-size:14px">${err.message}</div></div>`;
  }
}

// Best-effort extraction of a few headline numbers from the gateway payload.
function flattenMetrics(m) {
  const out = [];
  const totalReq = m.totalRequests ?? m.requests ?? m.requestCount;
  const totalCost = m.totalCostUsd ?? m.costUsd ?? m.totalCost;
  const cacheHits = m.cacheHits ?? m.cache?.hits;
  const cacheRate = m.cacheHitRate ?? m.cache?.hitRate;

  if (totalReq != null) out.push({ label: 'Gateway requests', value: totalReq });
  if (totalCost != null)
    out.push({ label: 'Gateway cost', value: `$${Number(totalCost).toFixed(4)}` });
  if (cacheHits != null) out.push({ label: 'Cache hits', value: cacheHits });
  if (cacheRate != null) {
    const rate = Number(cacheRate);
    out.push({
      label: 'Cache hit rate',
      value: rate <= 1 ? `${(rate * 100).toFixed(1)}%` : `${rate.toFixed(1)}%`,
    });
  }
  out.push({ label: 'Team members', value: state.users.length });
  return out;
}

function fmtLimit(limits) {
  const r = limits.dailyRequests == null ? '∞' : limits.dailyRequests;
  const c = limits.dailyCostUsd == null ? '∞' : `$${limits.dailyCostUsd}`;
  return `${r} req · ${c}`;
}

function renderUsers() {
  const body = $('#users-body');
  body.innerHTML = '';
  for (const u of state.users) {
    const tr = document.createElement('tr');
    const today = u.usage?.today || {};
    const totals = u.usage?.totals || {};

    const gName = u.groupName || groupName(u.groupId);
    tr.innerHTML =
      `<td><div>${escapeHtml(u.name || '')}</div><div class="muted">${escapeHtml(u.email)}</div></td>` +
      `<td><span class="badge ${u.role === 'admin' ? 'admin' : ''}">${u.role}</span></td>` +
      `<td class="muted">${gName ? escapeHtml(gName) : '—'}</td>` +
      `<td>${today.requests || 0} · $${(today.costUsd || 0).toFixed(4)}</td>` +
      `<td>${totals.requests || 0} · $${(totals.costUsd || 0).toFixed(4)}</td>` +
      `<td class="muted">${fmtLimit(u.limits || {})}</td>` +
      `<td>${u.disabled ? '<span class="badge disabled">disabled</span>' : '<span class="badge">active</span>'}</td>`;

    const actions = document.createElement('td');
    actions.className = 'row-actions';

    const edit = document.createElement('button');
    edit.className = 'btn ghost';
    edit.textContent = 'Edit';
    edit.addEventListener('click', () => openModal(u));

    const del = document.createElement('button');
    del.className = 'btn danger';
    del.textContent = 'Delete';
    del.addEventListener('click', () => deleteUser(u));

    actions.append(edit, del);
    tr.appendChild(actions);
    body.appendChild(tr);
  }
}

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

/* ── Modal (create / edit) ── */
function openModal(user) {
  const editing = Boolean(user);
  $('#modal-title').textContent = editing ? 'Edit user' : 'New user';
  $('#modal-error').textContent = '';
  $('#user-form').reset();

  $('#u-id').value = editing ? user.id : '';
  $('#u-email').value = editing ? user.email : '';
  $('#u-email').disabled = editing;
  $('#u-name').value = editing ? user.name || '' : '';
  $('#u-role').value = editing ? user.role : 'member';
  $('#u-default-model').value = editing ? user.defaultModel || '' : '';
  $('#u-req').value =
    editing && user.budget?.dailyRequests != null ? user.budget.dailyRequests : '';
  $('#u-cost').value = editing && user.budget?.dailyCostUsd != null ? user.budget.dailyCostUsd : '';
  $('#u-disabled').checked = editing ? Boolean(user.disabled) : false;

  // Populate the group dropdown (blank option = no group).
  const gsel = $('#u-group');
  gsel.innerHTML = '<option value="">— none —</option>';
  for (const g of state.groups) {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.textContent = g.name;
    gsel.appendChild(opt);
  }
  gsel.value = editing && user.groupId ? user.groupId : '';

  $('#pw-hint').textContent = editing ? '(leave blank to keep current)' : '(min 6 characters)';
  $('#disabled-field').classList.toggle('hidden', !editing);

  $('#user-modal').classList.remove('hidden');
}

function closeModal() {
  $('#user-modal').classList.add('hidden');
}

function numOrNull(v) {
  const s = String(v).trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

$('#new-user-btn').addEventListener('click', () => openModal(null));
$('#modal-cancel').addEventListener('click', closeModal);
$('#user-modal').addEventListener('click', (e) => {
  if (e.target.id === 'user-modal') closeModal();
});

$('#user-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#modal-error').textContent = '';
  const id = $('#u-id').value;
  const editing = Boolean(id);

  const budget = {
    dailyRequests: numOrNull($('#u-req').value),
    dailyCostUsd: numOrNull($('#u-cost').value),
  };
  const password = $('#u-password').value;
  const defaultModel = $('#u-default-model').value.trim() || null;
  const groupId = $('#u-group').value || null;

  try {
    if (editing) {
      const patch = {
        name: $('#u-name').value,
        role: $('#u-role').value,
        disabled: $('#u-disabled').checked,
        budget,
        defaultModel,
        groupId,
      };
      if (password) patch.password = password;
      await api(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
    } else {
      await api('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          email: $('#u-email').value,
          name: $('#u-name').value,
          password,
          defaultModel,
          groupId,
          role: $('#u-role').value,
          budget,
        }),
      });
    }
    closeModal();
    loadAll();
  } catch (err) {
    $('#modal-error').textContent = err.message;
  }
});

async function deleteUser(u) {
  if (!confirm(`Delete user ${u.email}? This removes their conversations and usage.`)) return;
  try {
    await api(`/api/admin/users/${u.id}`, { method: 'DELETE' });
    loadAll();
  } catch (err) {
    setError(err.message);
  }
}

/* ── Group modal (create / edit) ── */
function openGroupModal(group) {
  const editing = Boolean(group);
  $('#group-modal-title').textContent = editing ? 'Edit group' : 'New group';
  $('#group-modal-error').textContent = '';
  $('#group-form').reset();

  $('#g-id').value = editing ? group.id : '';
  $('#g-name').value = editing ? group.name : '';
  $('#g-req').value =
    editing && group.budget?.dailyRequests != null ? group.budget.dailyRequests : '';
  $('#g-cost').value =
    editing && group.budget?.dailyCostUsd != null ? group.budget.dailyCostUsd : '';

  $('#group-modal').classList.remove('hidden');
}

function closeGroupModal() {
  $('#group-modal').classList.add('hidden');
}

$('#new-group-btn').addEventListener('click', () => openGroupModal(null));
$('#group-modal-cancel').addEventListener('click', closeGroupModal);
$('#group-modal').addEventListener('click', (e) => {
  if (e.target.id === 'group-modal') closeGroupModal();
});

$('#group-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#group-modal-error').textContent = '';
  const id = $('#g-id').value;
  const editing = Boolean(id);

  const body = {
    name: $('#g-name').value,
    budget: {
      dailyRequests: numOrNull($('#g-req').value),
      dailyCostUsd: numOrNull($('#g-cost').value),
    },
  };

  try {
    if (editing) {
      await api(`/api/admin/groups/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
    } else {
      await api('/api/admin/groups', { method: 'POST', body: JSON.stringify(body) });
    }
    closeGroupModal();
    loadAll();
  } catch (err) {
    $('#group-modal-error').textContent = err.message;
  }
});

async function deleteGroup(g) {
  if (
    !confirm(
      `Delete group "${g.name}"? Members will be unassigned (their own budgets still apply).`,
    )
  )
    return;
  try {
    await api(`/api/admin/groups/${g.id}`, { method: 'DELETE' });
    loadAll();
  } catch (err) {
    setError(err.message);
  }
}

/* ── Go ── */
loadAll();
