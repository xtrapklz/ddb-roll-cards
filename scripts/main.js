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
  // Prefer the ddb-sync mapping; fall back to matching the DDB-sent character name
  // (so action context resolves even when the mapping is missing/mismatched).
  const actor = mappedActor(entityId) || (data.context?.name ? game.actors.getName(data.context.name) : null);
  const who = actor?.name || data.context?.name || 'D&D Beyond';
  const label = `${esc(who)} — ${esc(action)}${rollType ? ` (${esc(rollType)})` : ''}`;
  const speaker = actor ? ChatMessage.getSpeaker({ actor }) : { alias: who };

  // Resolve to the actor's real item/activity for context (melee/ranged, damage type, save DC).
  const ctx = actor ? resolveAction(actor, action) : null;
  const dtype = ctx?.damageType || '';
  let ctxHTML = '';
  if (ctx) {
    const bits = [];
    if (ctx.melee) bits.push('⚔️ melee');
    if (ctx.ranged) bits.push('🏹 ranged');
    if (ctx.damageType) bits.push(`💥 ${esc(ctx.damageType)}`);
    if (ctx.saveDC != null) bits.push(`🎲 ${esc(ctx.saveAbility || 'save')} DC ${ctx.saveDC}`);
    if (bits.length) ctxHTML = `<div class="ddbx-sub" style="opacity:.85;">${bits.join('  ·  ')}</div>`;
  }

  // PUBLIC: what + value only.
  await ChatMessage.create({
    speaker,
    content: `<div class="ddbx-card"><div class="ddbx-head">${label}</div>`
      + `<div class="ddbx-total">${total}</div>`
      + `<div class="ddbx-sub">${esc(formula)}${breakdown ? ` = ${esc(breakdown)}` : ''}</div></div>`,
  });

  // GM-ONLY: action context + battle readout + apply buttons (manual only — nothing auto-applies).
  const valueButtons = attackLike
    ? `<button type="button" data-ddbx="hit">🎯 vs AC</button>`
    : `<button type="button" data-ddbx="damage">💥 Apply ${total}${dtype ? ' ' + esc(dtype) : ''}</button>`
      + `<button type="button" data-ddbx="heal">➕ Heal</button>`
      + `<button type="button" data-ddbx="temp">🛡 Temp</button>`;
  const saveLabel = (ctx?.saveDC != null) ? `🎲 Save DC ${ctx.saveDC}` : '🎲 Save';
  const content = `<div class="ddbx-card">
      <div class="ddbx-head">${label}</div>
      <div class="ddbx-total">${total}</div>
      <div class="ddbx-sub">${esc(formula)}${breakdown ? ` = ${esc(breakdown)}` : ''}</div>
      ${ctxHTML}
      ${targetPanel(total, attackLike)}
      <div class="ddbx-bar">${valueButtons}
        <button type="button" data-ddbx="save">${saveLabel}</button>
        <button type="button" data-ddbx="condition">⚠ Cond</button>
        <button type="button" data-ddbx="reactions">↩ React</button>
      </div></div>`;
  await ChatMessage.create({
    speaker,
    whisper: ChatMessage.getWhisperRecipients('GM').map(u => u.id),
    content,
    flags: { [NS]: { total, dtype } },
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
function resolveAction(actor, actionName) {
  const item = findItem(actor, actionName);
  if (!item) return null;
  const acts = Array.from(item.system?.activities ?? []);
  const attack = acts.find(a => a.type === 'attack');
  const dmg = acts.find(a => a.damage?.parts?.length);
  const sv = acts.find(a => a.type === 'save' && a.save);
  const at = attack?.actionType || '';
  const parts = dmg?.damage?.parts ?? [];
  const types = parts[0]?.types ? Array.from(parts[0].types) : (parts[0]?.type ? [parts[0].type] : []);
  const dcVal = sv ? (sv.save?.dc?.value ?? sv.save?.dc) : null;
  let ab = sv?.save?.ability;
  ab = (ab && typeof ab === 'object') ? (Array.from(ab)[0] || null) : (typeof ab === 'string' ? ab : null);
  return {
    item,
    melee: at === 'mwak' || at === 'msak',
    ranged: at === 'rwak' || at === 'rsak',
    damageType: types[0] || '',
    saveDC: (typeof dcVal === 'number') ? dcVal : null,
    saveAbility: ab ? String(ab).toUpperCase() : null,
  };
}

async function applyTypedDamage(actor, amount, type) {
  // Prefer dnd5e's typed applyDamage so resistances/immunities apply; fall back to manual HP math.
  try {
    if (typeof actor.applyDamage === 'function') {
      await actor.applyDamage([{ value: Math.abs(amount), type: type || undefined }]);
      return;
    }
  } catch (e) { /* fall through to manual */ }
  await applyDamage(actor, amount);
}

function hitCheck(total) {
  const t = requireTargets(); if (!t) return;
  const lines = t.map(a => { const ac = a.system.attributes?.ac?.value ?? '?'; const v = (typeof ac === 'number') ? (total >= ac ? '✅ HIT' : '❌ MISS') : '—'; return `<li><b>${esc(a.name)}</b> — AC ${ac} → ${v}</li>`; }).join('');
  ChatMessage.create({ content: `<div><b>🎯 ${total}</b> vs targets<ul style="margin:4px 0 0;padding-left:18px;">${lines}</ul></div>` });
}
async function applyTo(kind, amount, dtype) {
  const t = requireTargets(); if (!t) return;
  if (!amount) { ui.notifications.warn('DDB: no value to apply on this card.'); return; }
  const verb = kind === 'heal' ? 'healing' : kind === 'temp' ? 'temp HP' : `${dtype ? dtype + ' ' : ''}damage`;
  for (const a of t) {
    try {
      if (kind === 'heal') await applyHealing(a, amount);
      else if (kind === 'temp') await applyTemp(a, amount);
      else await applyTypedDamage(a, amount, dtype);
    } catch (e) { console.error(e); }
  }
  ChatMessage.create({ content: `Applied <b>${amount}</b> ${esc(verb)} to ${t.map(a => esc(a.name)).join(', ')}.` });
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
function onAction(action, total, dtype) {
  if (!game.user?.isGM) { ui.notifications.warn('DDB: only the GM can apply card actions.'); return; }
  switch (action) {
    case 'hit': return hitCheck(total);
    case 'damage': return applyTo('damage', total, dtype);
    case 'heal': return applyTo('heal', total);
    case 'temp': return applyTo('temp', total);
    case 'save': return promptSaves();
    case 'condition': return promptCondition();
    case 'reactions': return listReactions();
  }
}

/* ------------------------------------------------------------- socket tap */
/* ------------------------------------- MidiQOL bridge (opt-in, experimental) */
// Force the NEXT d20 roll for a given actor to a specific value, by overwriting
// the rolled d20 face after evaluation. Only touches d20 terms, so damage dice
// (rolled later by MidiQOL with their own values) are left alone.
let pendingForce = null; // { actorId, values:[..], ts }

function applyForce(roll) {
  if (!pendingForce) return;
  if (Date.now() - pendingForce.ts > 10000) { pendingForce = null; return; }
  const dice = (roll?.terms ?? []).filter(t => t instanceof foundry.dice.terms.Die && t.faces === 20);
  if (!dice.length) return; // not the attack d20 (e.g. damage) — leave it
  for (const term of dice) {
    for (let i = 0; i < term.results.length; i++) {
      const v = pendingForce.values[i] ?? pendingForce.values[0];
      if (v != null && term.results[i]) term.results[i].result = v;
    }
  }
  try { roll._total = roll._evaluateTotal(); } catch (e) {}
  pendingForce = null; // consume after the first d20 roll
}

function installForceOverride() {
  if (globalThis.__ddbxForceInstalled) return;
  globalThis.__ddbxForceInstalled = true;
  const origEval = Roll.prototype.evaluate;
  Roll.prototype.evaluate = async function (...a) { const r = await origEval.apply(this, a); try { applyForce(this); } catch (e) {} return r; };
  const origSync = Roll.prototype.evaluateSync;
  if (typeof origSync === 'function') {
    Roll.prototype.evaluateSync = function (...a) { const r = origSync.apply(this, a); try { applyForce(this); } catch (e) {} return r; };
  }
  console.log('DDB Roll Cards | MidiQOL force-override installed');
}

function findItem(actor, action) {
  if (!actor?.items || !action) return null;
  const n = String(action).toLowerCase().trim();
  return actor.items.find(i => i.name.toLowerCase().trim() === n)
    || actor.items.find(i => i.name.toLowerCase().includes(n) || n.includes(i.name.toLowerCase()))
    || null;
}

async function triggerMidiAttack(data, actor) {
  const item = findItem(actor, data.action);
  if (!item) { renderRoll(data); return; } // no item match → fall back to a card
  const values = data.rolls?.[0]?.result?.values || [];
  pendingForce = { actorId: actor.id, values, ts: Date.now() };
  try { await item.use(); }
  catch (e) { console.error('DDB Roll Cards | MidiQOL trigger failed', e); }
  finally { setTimeout(() => { pendingForce = null; }, 10000); }
}

function forceModeOn() {
  try { return game.settings.get(NS, 'forceMidiAttacks'); } catch (e) { return false; }
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

  // Opt-in: route weapon to-hit rolls into MidiQOL (forced to the DDB d20) instead of a card.
  const rollType = (data.rolls[0].rollType || '').toLowerCase();
  if (forceModeOn() && rollType === 'to hit') {
    const actor = mappedActor(data.context?.entityId || data.entityId);
    if (actor && findItem(actor, data.action)) { triggerMidiAttack(data, actor); return; }
  }
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
Hooks.once('init', () => {
  game.settings.register(NS, 'forceMidiAttacks', {
    name: 'Force weapon attacks through MidiQOL',
    hint: 'EXPERIMENTAL: route D&D Beyond weapon to-hit rolls into the item\'s MidiQOL workflow and overwrite MidiQOL\'s d20 with your DDB roll. Tip: set MidiQOL to NOT auto-roll damage, then apply DDB damage from the card. Off = render all rolls as cards.',
    scope: 'world',
    config: true,
    type: Boolean,
    default: false,
  });
});

Hooks.once('ready', () => {
  if (!game.modules.get(SYNC)?.active) {
    ui.notifications.warn('DDB Roll Cards requires the "D&D Beyond Sync" module to be enabled.');
    return;
  }
  if (!game.user.isGM) return;            // only the GM renders, to avoid duplicate cards
  injectStyles();
  installForceOverride();

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
    let total, dtype;
    try { total = message.getFlag(NS, 'total'); dtype = message.getFlag(NS, 'dtype'); } catch (e) { return; }
    if (total === undefined || total === null) return;
    const root = (el instanceof HTMLElement) ? el : el?.[0];
    root?.querySelectorAll('[data-ddbx]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); onAction(b.dataset.ddbx, Number(total), dtype); }));
  });

  console.log('DDB Roll Cards | ready');
});
