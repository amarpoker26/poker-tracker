// ── Data Layer ──
const Store = {
  get(key, def = null) {
    try { return JSON.parse(localStorage.getItem(key)) || def; } catch { return def; }
  },
  set(key, val) { localStorage.setItem(key, JSON.stringify(val)); },
};

function getPlayers() { return Store.get('players', []); }
function savePlayers(p) { Store.set('players', p); }
function getSessions() { return Store.get('sessions', []); }
function saveSessions(s) { Store.set('sessions', s); }
function getActiveSession() { return Store.get('activeSession', null); }
function saveActiveSession(s) { Store.set('activeSession', s); }

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function usd(n) { return '₹' + Math.abs(n).toFixed(2); }
function signedUsd(n) { return (n >= 0 ? '+' : '-') + usd(n); }
function amountClass(n) { return n > 0.005 ? 'positive' : n < -0.005 ? 'negative' : 'zero'; }
function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Navigation ──
let currentTab = 'sessions';
let detailOpen = false;

document.querySelectorAll('.tab').forEach(t => {
  t.addEventListener('click', () => switchTab(t.dataset.tab));
});

function switchTab(tab) {
  detailOpen = false;
  currentTab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + tab).classList.add('active');
  render();
}

function render() {
  if (currentTab === 'sessions') renderSessions();
  else if (currentTab === 'new') renderNewSession();
  else if (currentTab === 'players') renderPlayers();
  else if (currentTab === 'balances') renderBalances();
}

// ── Players Page ──
function renderPlayers() {
  const players = getPlayers();
  const el = document.getElementById('players-list');
  if (!players.length) {
    el.innerHTML = '<div class="empty-state"><div class="icon">♣</div><p>No players yet.<br>Add your poker crew above.</p></div>';
    return;
  }
  el.innerHTML = players.map(p => `
    <div class="list-item">
      <div class="list-item-left"><div class="list-item-name">${esc(p)}</div></div>
      <button class="btn btn-outline btn-sm" onclick="removePlayer('${esc(p)}')" style="width:auto;color:var(--red);border-color:var(--red-dim)">Remove</button>
    </div>
  `).join('');
}

function addPlayer() {
  const input = document.getElementById('new-player-name');
  const name = input.value.trim();
  if (!name) return;
  const players = getPlayers();
  if (players.find(p => p.toLowerCase() === name.toLowerCase())) {
    input.value = '';
    return;
  }
  players.push(name);
  savePlayers(players);
  input.value = '';
  renderPlayers();
}

document.getElementById('new-player-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') addPlayer();
});

function removePlayer(name) {
  if (!confirm(`Remove ${name} from the group?`)) return;
  savePlayers(getPlayers().filter(p => p !== name));
  renderPlayers();
}

// ── Sessions Page ──
function renderSessions() {
  const sessions = getSessions();
  const el = document.getElementById('sessions-list');
  if (!sessions.length) {
    el.innerHTML = '<div class="empty-state"><div class="icon">♠</div><p>No sessions yet.<br>Start a new poker night!</p></div>';
    return;
  }
  el.innerHTML = sessions.slice().reverse().map(s => {
    const playerCount = s.players.length;
    const totalPot = s.buyins.reduce((sum, b) => sum + b.amount, 0);
    return `
      <div class="card" onclick="openDetail('${s.id}')">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <div class="list-item-name">${formatDate(s.date)}</div>
            <div class="list-item-sub">${playerCount} players &middot; Pot: ${usd(totalPot)}</div>
          </div>
          <span class="badge ${s.settled ? 'badge-complete' : 'badge-active'}">${s.settled ? 'Settled' : 'Active'}</span>
        </div>
      </div>
    `;
  }).join('');
}

// ── Session Detail ──
function openDetail(id) {
  const sessions = getSessions();
  const s = sessions.find(x => x.id === id);
  if (!s) return;
  detailOpen = true;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-detail').classList.add('active');
  document.getElementById('btn-delete-session').onclick = () => deleteSession(id);
  renderDetail(s);
}

function closeDetail() {
  detailOpen = false;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + currentTab).classList.add('active');
  render();
}

function deleteSession(id) {
  if (!confirm('Delete this session permanently?')) return;
  saveSessions(getSessions().filter(s => s.id !== id));
  closeDetail();
}

function renderDetail(s) {
  const el = document.getElementById('detail-content');
  const totalPot = s.buyins.reduce((sum, b) => sum + b.amount, 0);
  const hasCashouts = s.cashouts && Object.keys(s.cashouts).length;
  const hasExpenses = s.expenses && s.expenses.length;
  const result = s.settled ? calculateSession(s) : null;

  let html = `<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">
    <h2 style="color:var(--gold);font-size:17px">${formatDate(s.date)}</h2>
    <span style="color:var(--text-dim);font-size:12px">${s.players.length} players · Pot: ${usd(totalPot)}</span>
  </div>`;

  // Combined table: Buy-in | Cash-out | P&L
  html += `<div class="section-title-compact">Players</div>`;
  html += `<table class="detail-table"><thead><tr><th>Name</th><th>In</th>${hasCashouts ? '<th>Out</th>' : ''}${result ? '<th>Net</th>' : ''}</tr></thead><tbody>`;
  s.players.forEach(p => {
    const pBuyins = s.buyins.filter(b => b.player === p);
    const totalIn = pBuyins.reduce((s, b) => s + b.amount, 0);
    const co = hasCashouts ? (s.cashouts[p] ?? 0) : null;
    const net = result ? result.playerSummary[p].net : null;
    html += `<tr><td>${esc(p)}</td><td>${usd(totalIn)}${pBuyins.length > 1 ? ` <span style="color:var(--text-dim)">(${pBuyins.length}x)</span>` : ''}</td>`;
    if (hasCashouts) html += `<td>${usd(co)}</td>`;
    if (result) html += `<td class="${amountClass(net)}" style="font-weight:600">${signedUsd(net)}</td>`;
    html += `</tr>`;
  });
  html += `</tbody></table>`;

  // Expenses (compact)
  if (hasExpenses) {
    html += `<div class="section-title-compact">Expenses</div>`;
    s.expenses.forEach(ex => {
      html += `<div style="font-size:13px;padding:4px 0;border-bottom:1px solid var(--border)">
        <b>${esc(ex.description)}</b> ${usd(ex.amount)} · paid by ${esc(ex.paidBy)} · split: ${ex.splitAmong.map(esc).join(', ')}
      </div>`;
    });
  }

  // Settlements
  if (result) {
    html += `<div class="section-title-compact">Settlements</div>`;
    if (result.transfers.length === 0) {
      html += `<p style="color:var(--text-dim);font-size:13px">Everyone is settled up!</p>`;
    } else {
      result.transfers.forEach(t => {
        html += `<div class="settlement-item-compact">
          <span>${esc(t.from)}</span>
          <span class="settlement-arrow">→ ${usd(t.amount)} →</span>
          <span>${esc(t.to)}</span>
        </div>`;
      });
    }
  }

  el.innerHTML = html;
}

// ── Settlement Calculator ──
function calculateSession(s) {
  const playerSummary = {};
  s.players.forEach(p => {
    const totalBuyins = s.buyins.filter(b => b.player === p).reduce((sum, b) => sum + b.amount, 0);
    const cashout = (s.cashouts && s.cashouts[p]) || 0;
    const pokerPL = cashout - totalBuyins;

    let expenseShare = 0;
    let expenseCredit = 0;
    (s.expenses || []).forEach(ex => {
      if (ex.splitAmong.includes(p)) {
        expenseShare += ex.amount / ex.splitAmong.length;
      }
      if (ex.paidBy === p) {
        expenseCredit += ex.amount;
      }
    });

    const net = pokerPL - expenseShare + expenseCredit;
    playerSummary[p] = { pokerPL, expenseShare, expenseCredit, net };
  });

  // Greedy minimum transfers
  const balances = s.players.map(p => ({ player: p, balance: playerSummary[p].net }));
  const transfers = minimumTransfers(balances);

  return { playerSummary, transfers };
}

function minimumTransfers(balances) {
  const b = balances.map(x => ({ ...x }));
  const transfers = [];
  const EPSILON = 0.01;

  while (true) {
    b.sort((a, c) => a.balance - c.balance);
    const debtor = b[0];
    const creditor = b[b.length - 1];
    if (Math.abs(debtor.balance) < EPSILON || Math.abs(creditor.balance) < EPSILON) break;
    const amount = Math.min(Math.abs(debtor.balance), creditor.balance);
    if (amount < EPSILON) break;
    transfers.push({ from: debtor.player, to: creditor.player, amount: Math.round(amount * 100) / 100 });
    debtor.balance += amount;
    creditor.balance -= amount;
  }
  return transfers;
}

// ── New Session Flow ──
function renderNewSession() {
  const active = getActiveSession();
  const el = document.getElementById('new-session-content');
  const endBtn = document.getElementById('btn-end-session');
  const titleEl = document.getElementById('new-session-title');

  if (!active) {
    endBtn.style.display = 'none';
    titleEl.textContent = 'New Session';
    const players = getPlayers();
    if (!players.length) {
      el.innerHTML = '<div class="empty-state"><div class="icon">+</div><p>Add players first in the Players tab.</p></div>';
      return;
    }
    el.innerHTML = `
      <p style="color:var(--text-dim);margin-bottom:12px">Select who's playing tonight:</p>
      <div class="player-chips" id="select-players">
        ${players.map(p => `<div class="chip" data-player="${esc(p)}" onclick="togglePlayerSelect(this)">${esc(p)}</div>`).join('')}
      </div>
      <button class="btn btn-primary mt-16" onclick="startSession()">Start Session</button>
    `;
    return;
  }

  // Active session
  endBtn.style.display = '';
  endBtn.onclick = () => showEndSession();
  titleEl.textContent = formatDate(active.date);
  const totalPot = active.buyins.reduce((s, b) => s + b.amount, 0);

  let html = `<p style="color:var(--text-dim);margin-bottom:16px">${active.players.length} players &middot; Pot: ${usd(totalPot)}</p>`;

  // Buy-ins summary
  html += `<div class="section-title">Buy-ins</div>`;
  active.players.forEach(p => {
    const pBuyins = active.buyins.filter(b => b.player === p);
    const total = pBuyins.reduce((s, b) => s + b.amount, 0);
    html += `<div class="list-item">
      <div><div class="list-item-name">${esc(p)}</div><div class="list-item-sub">${pBuyins.length} buy-in${pBuyins.length !== 1 ? 's' : ''}</div></div>
      <div style="display:flex;align-items:center;gap:8px">
        <span>${usd(total)}</span>
        <button class="btn btn-outline btn-sm" onclick="showAddBuyin('${esc(p)}')">+</button>
      </div>
    </div>`;
  });

  // Expenses
  html += `<div class="section-title" style="display:flex;justify-content:space-between;align-items:center">
    Expenses <button class="btn btn-outline btn-sm" onclick="showAddExpense()">Add</button>
  </div>`;
  if (active.expenses.length === 0) {
    html += `<p style="color:var(--text-dim);font-size:14px">No shared expenses yet.</p>`;
  } else {
    active.expenses.forEach((ex, i) => {
      html += `<div class="card" style="padding:12px">
        <div style="display:flex;justify-content:space-between;align-items:start">
          <div>
            <div style="font-weight:600">${esc(ex.description)} — ${usd(ex.amount)}</div>
            <div style="font-size:13px;color:var(--text-dim)">Paid by ${esc(ex.paidBy)} &middot; Split: ${ex.splitAmong.map(esc).join(', ')}</div>
          </div>
          <button class="btn btn-sm" style="color:var(--red);padding:4px 8px" onclick="removeExpense(${i})">×</button>
        </div>
      </div>`;
    });
  }

  el.innerHTML = html;
}

function togglePlayerSelect(chip) {
  chip.classList.toggle('selected');
}

function startSession() {
  const selected = [...document.querySelectorAll('#select-players .chip.selected')].map(c => c.dataset.player);
  if (selected.length < 2) { alert('Select at least 2 players'); return; }
  const session = {
    id: genId(),
    date: new Date().toISOString(),
    players: selected,
    buyins: [],
    expenses: [],
    cashouts: {},
    settled: false,
  };
  saveActiveSession(session);
  renderNewSession();
}

function showAddBuyin(player) {
  openModal(`
    <h2>Add Buy-in</h2>
    <p style="color:var(--text-dim);margin-bottom:12px">${esc(player)}</p>
    <div class="input-group">
      <label>Amount (₹)</label>
      <input type="number" id="buyin-amount" placeholder="0.00" inputmode="decimal" step="0.01" min="0">
    </div>
    <button class="btn btn-primary" onclick="addBuyin('${esc(player)}')">Add Buy-in</button>
  `);
  setTimeout(() => document.getElementById('buyin-amount').focus(), 300);
}

function addBuyin(player) {
  const amount = parseFloat(document.getElementById('buyin-amount').value);
  if (!amount || amount <= 0) return;
  const s = getActiveSession();
  s.buyins.push({ player, amount });
  saveActiveSession(s);
  closeModal();
  renderNewSession();
}

function showAddExpense() {
  const s = getActiveSession();
  openModal(`
    <h2>Add Expense</h2>
    <div class="input-group">
      <label>Description</label>
      <input type="text" id="exp-desc" placeholder="e.g. Pizza, Beer">
    </div>
    <div class="input-group">
      <label>Amount (₹)</label>
      <input type="number" id="exp-amount" placeholder="0.00" inputmode="decimal" step="0.01" min="0">
    </div>
    <div class="input-group">
      <label>Who paid?</label>
      <select id="exp-paidby">
        ${s.players.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('')}
      </select>
    </div>
    <div class="input-group">
      <label>Split among</label>
      <div class="player-chips" id="exp-split">
        ${s.players.map(p => `<div class="chip selected" data-player="${esc(p)}" onclick="togglePlayerSelect(this)">${esc(p)}</div>`).join('')}
      </div>
    </div>
    <button class="btn btn-primary" onclick="addExpense()">Add Expense</button>
  `);
}

function addExpense() {
  const desc = document.getElementById('exp-desc').value.trim();
  const amount = parseFloat(document.getElementById('exp-amount').value);
  const paidBy = document.getElementById('exp-paidby').value;
  const splitAmong = [...document.querySelectorAll('#exp-split .chip.selected')].map(c => c.dataset.player);
  if (!desc || !amount || amount <= 0 || !splitAmong.length) { alert('Fill in all fields and select at least one player'); return; }
  const s = getActiveSession();
  s.expenses.push({ description: desc, amount, paidBy, splitAmong });
  saveActiveSession(s);
  closeModal();
  renderNewSession();
}

function removeExpense(i) {
  if (!confirm('Remove this expense?')) return;
  const s = getActiveSession();
  s.expenses.splice(i, 1);
  saveActiveSession(s);
  renderNewSession();
}

function showEndSession() {
  const s = getActiveSession();
  if (!s.buyins.length) { alert('Add at least one buy-in first'); return; }
  let html = `<h2>End Session — Cash-outs</h2>
    <p style="color:var(--text-dim);margin-bottom:16px">Enter each player's cash-out amount.</p>`;
  s.players.forEach(p => {
    const existing = s.cashouts[p] || '';
    html += `<div class="input-group">
      <label>${esc(p)}</label>
      <input type="number" class="cashout-input" data-player="${esc(p)}" placeholder="0.00" value="${existing}" inputmode="decimal" step="0.01" min="0">
    </div>`;
  });
  html += `<button class="btn btn-gold" onclick="endSession()">Settle Session</button>`;
  openModal(html);
}

function endSession() {
  const s = getActiveSession();
  const inputs = document.querySelectorAll('.cashout-input');
  const cashouts = {};
  inputs.forEach(inp => {
    cashouts[inp.dataset.player] = parseFloat(inp.value) || 0;
  });
  s.cashouts = cashouts;
  s.settled = true;

  const sessions = getSessions();
  sessions.push(s);
  saveSessions(sessions);
  saveActiveSession(null);
  closeModal();
  switchTab('sessions');
}

// ── Balances Page ──
let balancesTab = 'outstanding';

function renderBalances() {
  const sessions = getSessions().filter(s => s.settled);
  const el = document.getElementById('balances-content');
  if (!sessions.length) {
    el.innerHTML = '<div class="empty-state"><div class="icon">♦</div><p>No settled sessions yet.<br>Complete a session to see balances.</p></div>';
    return;
  }

  // Cumulative net per player
  const cumulative = {};
  sessions.forEach(s => {
    const result = calculateSession(s);
    for (const [p, data] of Object.entries(result.playerSummary)) {
      cumulative[p] = (cumulative[p] || 0) + data.net;
    }
  });

  // Tab switcher
  let html = `<div class="balance-tabs">
    <button class="balance-tab ${balancesTab === 'outstanding' ? 'active' : ''}" onclick="switchBalancesTab('outstanding')">Outstanding</button>
    <button class="balance-tab ${balancesTab === 'settled' ? 'active' : ''}" onclick="switchBalancesTab('settled')">Settled</button>
  </div>`;

  // Cumulative P&L always visible
  html += `<div class="section-title">Cumulative P&L</div>`;
  const sorted = Object.entries(cumulative).sort((a, b) => b[1] - a[1]);
  sorted.forEach(([p, net]) => {
    html += `<div class="list-item">
      <div class="list-item-name">${esc(p)}</div>
      <div class="${amountClass(net)}" style="font-weight:700;font-size:17px">${signedUsd(net)}</div>
    </div>`;
  });

  if (balancesTab === 'outstanding') {
    const balances = sorted.map(([player, balance]) => ({ player, balance }));
    const transfers = minimumTransfers(balances);
    html += `<div class="section-title">Outstanding Settlements</div>`;
    if (!transfers.length) {
      html += `<p style="color:var(--text-dim)">Everyone is settled up!</p>`;
    } else {
      transfers.forEach(t => {
        html += `<div class="settlement-item">
          <span>${esc(t.from)}</span>
          <span class="settlement-arrow">→ ${usd(t.amount)} →</span>
          <span>${esc(t.to)}</span>
        </div>`;
      });
    }
  } else {
    html += `<div class="section-title">Settled Sessions</div>`;
    sessions.slice().reverse().forEach(s => {
      const result = calculateSession(s);
      html += `<div class="card" style="padding:12px;margin-bottom:8px">
        <div style="font-weight:600;color:var(--gold);margin-bottom:6px">${formatDate(s.date)}</div>`;
      result.transfers.forEach(t => {
        html += `<div style="font-size:13px;padding:2px 0;color:var(--text-dim)">
          ${esc(t.from)} → ${usd(t.amount)} → ${esc(t.to)}
        </div>`;
      });
      if (!result.transfers.length) {
        html += `<div style="font-size:13px;color:var(--text-dim)">Even split</div>`;
      }
      html += `</div>`;
    });
  }

  html += `<p style="color:var(--text-dim);font-size:12px;margin-top:16px;text-align:center">Across ${sessions.length} settled session${sessions.length !== 1 ? 's' : ''}</p>`;
  el.innerHTML = html;
}

function switchBalancesTab(tab) {
  balancesTab = tab;
  renderBalances();
}

// ── Modal ──
function openModal(html) {
  document.getElementById('modal-content').innerHTML = html;
  document.getElementById('modal').classList.add('active');
}

function closeModal() {
  document.getElementById('modal').classList.remove('active');
}

document.getElementById('modal').addEventListener('click', e => {
  if (e.target.id === 'modal') closeModal();
});

// ── Util ──
function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ── Service Worker ──
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ── Init ──
render();
