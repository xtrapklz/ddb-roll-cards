/**
 * DDB Roll Cards — companion for D&D Beyond Sync.
 *
 * ddb-sync receives the campaign's rolls but (a) ignores `dice/roll/deferred`
 * events (so ability checks / saves never render) and (b) on some setups its
 * attack handling completes without posting anything. This module rides
 * ddb-sync's EXISTING connection (no second socket) by tapping the raw
 * WebSocket at game.DDBSync.websocketManager.websocket.ws, then renders EVERY
 * roll as a clean chat card: a GM-only battle readout (hit/AC, apply
 * damage/heal/temp, saves, conditions, reactions) plus a public result.
 */

const NS = 'ddb-roll-cards';
const SYNC = 'ddb-sync';
const seen = new Map(); // rollId -> timestamp (dedupe; deferred+fulfilled share an id)

/* ------------------------------------------------------------------ styles */
const STYLES = `
.ddbx-card{font-size:12px;line-height:1.35;}
.ddbx-head{font-weight:bold;font-size:13px;}
.ddbx-total{font-size:22px;font-weight:bold;text-align:center;}
.ddbx-sub{text-align:center;opacity:.7;font-size:11px;margin-bottom:2px;}
.ddbx-none{opacity:.55;font-style:italic;font-size:11px;margin-top:6px;}
.ddbx-target{border-top:1px solid rgba(127,127,127,.35);margin-top:6px;padding-top:5px;}
.ddbx-trow{display:flex;justify-content:space-between;align-items:center;gap:6px;}
.ddbx-tname{font-weight:bold;}
.ddbx-verdict{font-weight:bold;font-size:11px;white-space:nowrap;padding:1px 6px;border-radius:4px;}
.ddbx-hit{color:#1b5e20;background:rgba(46,125,50,.18);}
.ddbx-miss{color:#8e1212;background:rgba(183,28,28,.16);}
.ddbx-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:3px;margin-top:4px;}
.ddbx-stat{background:rgba(127,127,127,.14);border-radius:4px;padding:2px 4px;text-align:center;}
.ddbx-stat b{display:block;font-size:13px;}
.ddbx-stat span{font-size:9px;text-transform:uppercase;letter-spacing:.04em;opacity:.7;}
.ddbx-saves{display:grid;grid-template-columns:repeat(6,1fr);gap:2px;margin-top:4px;}
.ddbx-save{text-align:center;background:rgba(127,127,127,.1);border-radius:3px;padding:1px 0;}
.ddbx-save span{display:block;font-size:8px;opacity:.7;}
.ddbx-save b{font-size:11px;}
.ddbx-line{margin-top:4px;font-size:11px;}
.ddbx-pill{display:inline-block;padding:0 6px;border-radius:8px;background:rgba(150,60,60,.2);border:1px solid rgba(150,60,60,.4);font-size:10px;line-height:16px;margin:1px 2px 0 0;}
.ddbx-bar{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px;border-top:1px solid rgba(127,127,127,.35);padding-top:6px;}
.ddbx-bar button{flex:0 0 auto;width:auto;min-width:0;white-space:nowrap;font-size:11px;line-height:22px;padding:0 8px;}
`;
function injectStyles() {
  if (document.getElementById('ddbx-styles')) return;
  const el = document.createElement('style'); el.id = 'ddbx-styles'; el.textContent = STYLES;
  document.head.appendChild(el);
}

/* ------------------------------------------------------------------ helpers */
function esc(s) { return foundry.utils.escapeHTML ? foundry.utils.escapeHTML(String(s)) : String(s); }
function fmtMod(n) { n = Number(n) || 0; return (n >= 0 ? '+' : '') + n; }
function getTargets() { return Array.from(game.user?.targets ?? []).map(t => t.actor).filter(Boolean); }
function requireTargets() { const t = getTargets(); if (!t.length) { ui.notifications.warn('DDB: target a token first.'); return null; } return t; }

function mappedActor(entityId) {
  let map = {};
  try { map = game.settings.get(SYNC, 'characterMapping') || {}; } catch (e) {}
  const id = map[entityId];
  return id ? game.actors.get(id) : null;
}

function ddbFormula(roll) {
  const n = roll?.diceNotation || {};
  const dice = (n.set || []).map(s => `${s.count || 1}${s.dieType || ''}`).join(' + ');
  const c = n.constant || 0;
  if (dice && c) return `${dice} + ${c}`;
  return dice || String(c || (roll?.result?.total ?? ''));
}

function actorReactions(actor) {
  return actor.items.filter(i => {
    const acts = i.system?.activities;
    if (acts?.size) return Array.from(acts).some(a => a?.activation?.type === 'reaction');
    if (Array.isArray(acts)) return acts.some(a => a?.activation?.type === 'reaction');
    return i.system?.activation?.type === 'reaction';
  }).map(i => i.name);
}
function actorConditions(actor) {
  return Array.from(actor.statuses ?? []).map(id => {
    const e = (CONFIG.statusEffects ?? []).find(x => x.id === id);
    return e ? game.i18n.localize(e.name ?? e.label ?? id) : id;
  });
}
function actorSaveCells(actor) {
  const ab = actor.system?.abilities ?? {};
  return ['str', 'dex', 'con', 'int', 'wis', 'cha'].map(k => {
    const s = ab[k]?.save; const v = (s && typeof s === 'object') ? s.value : (typeof s === 'number' ? s : (ab[k]?.mod ?? 0));
    return `<div class="ddbx-save"><span>${k.toUpperCase()}</span><b>${fmtMod(v)}</b></div>`;
  }).join('');
}

function targetPanel(total, attackLike) {
  const targets = getTargets();
  if (!targets.length) return `<div class="ddbx-none">No target selected — buttons act on whatever you target when clicked.</div>`;
  return targets.map(actor => {
    const a = actor.system ?? {};
    const ac = a.attributes?.ac?.value ?? '—';
    const hp = a.attributes?.hp ?? {};
    const hpStr = `${hp.value ?? '—'}/${hp.max ?? '—'}${hp.temp ? `+${hp.temp}` : ''}`;
    const speed = a.attributes?.movement?.walk ?? '—';
    let verdict = '';
    if (attackLike && typeof ac === 'number') {
      const hit = total >= ac;
      verdict = `<span class="ddbx-verdict ${hit ? 'ddbx-hit' : 'ddbx-miss'}">${hit ? '✅ HIT' : '❌ MISS'} · ${total} vs ${ac}</span>`;
    }
    const conds = actorConditions(actor);
    const condHTML = conds.length ? conds.map(c => `<span class="ddbx-pill">${esc(c)}</span>`).join('') : '<span style="opacity:.55;">none</span>';
    const reacts = actorReactions(actor);
    const reactHTML = reacts.length ? esc(reacts.join(', ')) : '<span style="opacity:.55;">none</span>';
    return `<div class="ddbx-target">
      <div class="ddbx-trow"><span class="ddbx-tname">🎯 ${esc(actor.name)}</span>${verdict}</div>
      <div class="ddbx-stats">
        <div class="ddbx-stat"><b>${ac}</b><span>AC</span></div>
        <div class="ddbx-stat"><b>${hpStr}</b><span>HP</span></div>
        <div class="ddbx-stat"><b>${speed}</b><span>Speed</span></div>
      </div>
      <div class="ddbx-saves">${actorSaveCells(actor)}</div>
      <div class="ddbx-line">⚠ ${condHTML}</div>
      <div class="ddbx-line">↩ <b>Reactions:</b> ${reactHTML}</div>
    </div>`;
  }).join('');
}

/* --------------------------------------------------------------- rendering */
async function renderRoll(data) {
  const roll = data.rolls?.[0] || {};
  const total = Number(roll.result?.total ?? 0);
  const formula = ddbFormula(roll);
  const breakdown = roll.result?.text || '';
  const action = data.action || 'Roll';
  const rollType = (roll.rollType || '').toLowerCase();
  const attackLike = rollType === 'to hit' || formula.includes('d20');
  const entityId = data.context?.entityId || data.entityId;
  const actor = mappedActor(entityId);
  const who = actor?.name || data.context?.name || 'D&D Beyond';
  const label = `${esc(who)} — ${esc(action)}${rollType ? ` (${esc(rollType)})` : ''}`;
  const speaker = actor ? ChatMessage.getSpeaker({ actor }) : { alias: who };

  // PUBLIC: what + value only.
  await ChatMessage.create({
    speaker,
    content: `<div class="ddbx-card"><div class="ddbx-head">${label}</div>`
      + `<div class="ddbx-total">${total}</div>`
      + `<div class="ddbx-sub">${esc(formula)}${breakdown ? ` = ${esc(breakdown)}` : ''}</div></div>`,
  });

  // GM-ONLY: battle readout + action bar.
  const valueButtons = attackLike
    ? `<button type="button" data-ddbx="hit">🎯 vs AC</button>`
    : `<button type="button" data-ddbx="damage">💥 Dmg</button>`
      + `<button type="button" data-ddbx="heal">➕ Heal</button>`
      + `<button type="button" data-ddbx="temp">🛡 Temp</button>`;
  const content = `<div class="ddbx-card">
      <div class="ddbx-head">${label}</div>
      <div class="ddbx-total">${total}</div>
      <div class="ddbx-sub">${esc(formula)}${breakdown ? ` = ${esc(breakdown)}` : ''}</div>
      ${targetPanel(total, attackLike)}
      <div class="ddbx-bar">${valueButtons}
        <button type="button" data-ddbx="save">🎲 Save</button>
        <button type="button" data-ddbx="condition">⚠ Cond</button>
        <button type="button" data-ddbx="reactions">↩ React</button>
      </div></div>`;
  await ChatMessage.create({
    speaker,
    whisper: ChatMessage.getWhisperRecipients('GM').map(u => u.id),
    content,
    flags: { [NS]: { total } },
  });
}

/* ----------------------------------------------------------- button actions */
async function applyDamage(actor, amount) {
  const hp = foundry.utils.deepClone(actor.system.attributes.hp);
  let rem = Math.abs(amount), temp = hp.temp || 0;
  const ab = Math.min(temp, rem); temp -= ab; rem -= ab;
  await actor.update({ 'system.attributes.hp.temp': temp, 'system.attributes.hp.value': Math.max(0, (hp.value || 0) - rem) });
}
async function applyHealing(actor, amount) {
  const hp = actor.system.attributes.hp;
  await actor.update({ 'system.attributes.hp.value': Math.min(hp.max ?? Infinity, (hp.value || 0) + Math.abs(amount)) });
}
async function applyTemp(actor, amount) {
  const cur = actor.system.attributes.hp.temp || 0;
  await actor.update({ 'system.attributes.hp.temp': Math.max(cur, Math.abs(amount)) });
}
function hitCheck(total) {
  const t = requireTargets(); if (!t) return;
  const lines = t.map(a => { const ac = a.system.attributes?.ac?.value ?? '?'; const v = (typeof ac === 'number') ? (total >= ac ? '✅ HIT' : '❌ MISS') : '—'; return `<li><b>${esc(a.name)}</b> — AC ${ac} → ${v}</li>`; }).join('');
  ChatMessage.create({ content: `<div><b>🎯 ${total}</b> vs targets<ul style="margin:4px 0 0;padding-left:18px;">${lines}</ul></div>` });
}
async function applyTo(kind, amount) {
  const t = requireTargets(); if (!t) return;
  if (!amount) { ui.notifications.warn('DDB: no value to apply on this card.'); return; }
  const fn = kind === 'heal' ? applyHealing : kind === 'temp' ? applyTemp : applyDamage;
  const verb = kind === 'heal' ? 'healing' : kind === 'temp' ? 'temp HP' : 'damage';
  for (const a of t) { try { await fn(a, amount); } catch (e) { console.error(e); } }
  ChatMessage.create({ content: `Applied <b>${amount}</b> ${verb} to ${t.map(a => esc(a.name)).join(', ')}.` });
}
async function promptSaves() {
  const t = requireTargets(); if (!t) return;
  const buttons = Object.entries(CONFIG.DND5E?.abilities ?? {}).map(([k, c]) => ({ action: k, label: c.label ?? k.toUpperCase(), callback: () => k }));
  if (!buttons.length) return;
  let ability; try { ability = await foundry.applications.api.DialogV2.wait({ window: { title: 'Saving Throw' }, content: '<p>Which save?</p>', buttons }); } catch (e) { return; }
  for (const a of t) { try { (a.rollSavingThrow ? a.rollSavingThrow({ ability }) : a.rollAbilitySave?.(ability)); } catch (e) { console.error(e); } }
}
async function promptCondition() {
  const t = requireTargets(); if (!t) return;
  const opts = (CONFIG.statusEffects ?? []).filter(e => e.id).map(e => `<option value="${e.id}">${game.i18n.localize(e.name ?? e.label ?? e.id)}</option>`).join('');
  let chosen; try {
    chosen = await foundry.applications.api.DialogV2.wait({ window: { title: 'Toggle Condition' }, content: `<select name="cond" style="width:100%;">${opts}</select>`, buttons: [{ action: 'ok', label: 'Toggle', default: true, callback: (e, b) => b.form.elements.cond.value }, { action: 'cancel', label: 'Cancel', callback: () => null }] });
  } catch (e) { return; }
  if (!chosen) return;
  for (const a of t) { try { await a.toggleStatusEffect?.(chosen); } catch (e) { console.error(e); } }
}
function listReactions() {
  const t = requireTargets(); if (!t) return;
  const blocks = t.map(a => { const r = actorReactions(a); return `<div style="margin-top:4px;"><b>${esc(a.name)}</b>: ${r.length ? esc(r.join(', ')) : '<em>none</em>'}</div>`; }).join('');
  ChatMessage.create({ content: `<div>↩ <b>Reactions</b>${blocks}</div>` });
}
function onAction(action, total) {
  if (!game.user?.isGM) { ui.notifications.warn('DDB: only the GM can apply card actions.'); return; }
  switch (action) {
    case 'hit': return hitCheck(total);
    case 'damage': return applyTo('damage', total);
    case 'heal': return applyTo('heal', total);
    case 'temp': return applyTo('temp', total);
    case 'save': return promptSaves();
    case 'condition': return promptCondition();
    case 'reactions': return listReactions();
  }
}

/* ------------------------------------------------------------- socket tap */
function onRaw(ev) {
  let msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
  if (typeof msg?.eventType !== 'string' || !msg.eventType.startsWith('dice/roll')) return;
  const data = msg.data || msg;
  const rollId = data.rollId || msg.id;
  if (!rollId) return;
  if (seen.has(rollId)) return;            // dedupe deferred + fulfilled of same roll
  seen.set(rollId, Date.now());
  if (!data.rolls?.length) return;
  renderRoll(data).catch(e => console.error('DDB Roll Cards | render error', e));
}

function attachTap() {
  const ws = game.DDBSync?.websocketManager?.websocket?.ws;
  if (ws && !ws.__ddbxTapped) {
    ws.__ddbxTapped = true;
    ws.addEventListener('message', onRaw);
    console.log('DDB Roll Cards | tapped ddb-sync socket');
  }
}

/* --------------------------------------------------------------- bootstrap */
Hooks.once('ready', () => {
  if (!game.modules.get(SYNC)?.active) {
    ui.notifications.warn('DDB Roll Cards requires the "D&D Beyond Sync" module to be enabled.');
    return;
  }
  if (!game.user.isGM) return;            // only the GM renders, to avoid duplicate cards
  injectStyles();

  attachTap();
  // Re-attach whenever ddb-sync reconnects (it builds a fresh socket each time).
  try { game.DDBSync?.websocketManager?.addEventListener?.('connected', () => setTimeout(attachTap, 100)); } catch (e) {}
  // Safety net: keep checking (covers first connect + reconnects) and prune the dedupe map.
  setInterval(() => {
    attachTap();
    const cutoff = Date.now() - 60000;
    for (const [k, t] of seen) if (t < cutoff) seen.delete(k);
  }, 4000);

  // Wire button clicks on our GM cards.
  Hooks.on('renderChatMessageHTML', (message, el) => {
    let f; try { f = message.getFlag(NS, 'total'); } catch (e) { return; }
    if (f === undefined || f === null) return;
    const root = (el instanceof HTMLElement) ? el : el?.[0];
    root?.querySelectorAll('[data-ddbx]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); onAction(b.dataset.ddbx, Number(f)); }));
  });

  console.log('DDB Roll Cards | ready');
});
