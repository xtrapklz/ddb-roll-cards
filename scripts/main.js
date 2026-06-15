/**
 * DDB Roll Cards — companion for D&D Beyond Sync.
 *
 * Rides ddb-sync's existing game-log socket and renders rolls as one clean,
 * D&D-Beyond-styled card per ACTION:
 *   - attack to-hit + its damage fold into a SINGLE evolving card
 *   - phase-aware (attack shows AC/hit-miss; damage shows HP + typed Apply)
 *   - resolves the actor's real item/activity for damage type / melee-ranged
 *   - target token art, crit/fumble + advantage styling
 *   - GM-only interactive card + a slim public result line
 * No second connection, no MidiQOL dependency.
 */

const NS = 'ddb-roll-cards';
const SYNC = 'ddb-sync';
const seen = new Map();         // rollId -> ts (dedupe deferred+fulfilled)
const actionCards = new Map();  // `${actorKey}|${item}` -> { id, ts }  (correlate to-hit -> damage)

/* ------------------------------------------------------------------ styles */
const STYLES = `
.ddbx2{border:1px solid rgba(0,0,0,.35);border-radius:6px;overflow:hidden;font-family:Signika,sans-serif;}
.ddbx2-head{display:flex;align-items:center;gap:8px;padding:5px 8px;background:linear-gradient(90deg,#2b2a2a,#3a3837);color:#f0f0f0;}
.ddbx2-portrait{width:30px;height:30px;border-radius:50%;object-fit:cover;border:1px solid #000;flex:0 0 auto;}
.ddbx2-title{font-weight:bold;font-size:13px;line-height:1.1;}
.ddbx2-sub{font-size:11px;opacity:.8;}
.ddbx2-sec{padding:6px 8px;border-top:1px solid rgba(0,0,0,.12);}
.ddbx2-lbl{font-size:10px;font-weight:bold;letter-spacing:.08em;color:#a01b1b;text-transform:uppercase;}
.ddbx2-num{font-size:26px;font-weight:bold;line-height:1;text-align:center;margin:1px 0 2px;}
.ddbx2-num.crit{color:#1f7a33;} .ddbx2-num.fumble{color:#b71c1c;}
.ddbx2-pill{display:inline-block;font-size:10px;padding:0 6px;border-radius:8px;background:rgba(0,0,0,.12);margin-left:4px;vertical-align:middle;}
.ddbx2-tag{display:inline-block;font-size:10px;padding:0 6px;border-radius:8px;background:rgba(160,27,27,.14);border:1px solid rgba(160,27,27,.35);}
.ddbx2-trow{display:flex;align-items:center;gap:6px;margin-top:4px;font-size:12px;}
.ddbx2-timg{width:24px;height:24px;border-radius:4px;object-fit:cover;border:1px solid rgba(0,0,0,.4);flex:0 0 auto;}
.ddbx2-tname{font-weight:bold;flex:1 1 auto;}
.ddbx2-stat{opacity:.85;white-space:nowrap;}
.ddbx2-hit{color:#1b5e20;font-weight:bold;} .ddbx2-miss{color:#8e1212;font-weight:bold;}
.ddbx2-bar{display:flex;flex-wrap:wrap;gap:4px;padding:6px 8px;border-top:1px solid rgba(0,0,0,.12);}
.ddbx2-bar button{flex:0 0 auto;white-space:nowrap;font-size:11px;line-height:22px;padding:0 8px;border-radius:4px;}
.ddbx2-pub{font-size:12px;} .ddbx2-pub b{font-size:15px;}
`;
function injectStyles() {
  if (document.getElementById('ddbx2-styles')) return;
  const el = document.createElement('style'); el.id = 'ddbx2-styles'; el.textContent = STYLES;
  document.head.appendChild(el);
}

/* ------------------------------------------------------------------ helpers */
function esc(s) { return foundry.utils.escapeHTML ? foundry.utils.escapeHTML(String(s)) : String(s); }
function fmtMod(n) { n = Number(n) || 0; return (n >= 0 ? '+' : '') + n; }
function getTargets() { return Array.from(game.user?.targets ?? []); }
function requireTargets() { const t = getTargets().map(x => x.actor).filter(Boolean); if (!t.length) { ui.notifications.warn('DDB: target a token first.'); return null; } return t; }

function mappedActor(entityId) {
  let map = {}; try { map = game.settings.get(SYNC, 'characterMapping') || {}; } catch (e) {}
  const id = map[entityId];
  return id ? game.actors.get(id) : null;
}
function resolveActor(data) {
  return mappedActor(data.context?.entityId || data.entityId) || (data.context?.name ? game.actors.getName(data.context.name) : null);
}

function ddbFormula(roll) {
  const n = roll?.diceNotation || {};
  const dice = (n.set || []).map(s => `${s.count || 1}${s.dieType || ''}`).join(' + ');
  const c = n.constant || 0;
  return (dice && c) ? `${dice} + ${c}` : (dice || String(c || (roll?.result?.total ?? '')));
}
function natFace(roll) {
  const vals = roll?.result?.values; // raw d20 face(s)
  if (!Array.isArray(vals) || !vals.length) return null;
  if (vals.includes(20)) return 20;
  if (vals.length === 1 && vals[0] === 1) return 1;
  return null;
}

function actorReactions(actor) {
  return (actor?.items ?? []).filter(i => {
    const acts = i.system?.activities;
    if (acts?.size) return Array.from(acts).some(a => a?.activation?.type === 'reaction');
    return i.system?.activation?.type === 'reaction';
  }).map(i => i.name);
}
function actorConditions(actor) {
  return Array.from(actor?.statuses ?? []).map(id => {
    const e = (CONFIG.statusEffects ?? []).find(x => x.id === id);
    return e ? game.i18n.localize(e.name ?? e.label ?? id) : id;
  });
}
function findItem(actor, actionName) {
  if (!actor?.items || !actionName) return null;
  const n = String(actionName).toLowerCase().trim();
  return actor.items.find(i => i.name.toLowerCase().trim() === n)
    || actor.items.find(i => i.name.toLowerCase().includes(n) || n.includes(i.name.toLowerCase())) || null;
}
function resolveAction(actor, actionName) {
  const item = findItem(actor, actionName);
  if (!item) return {};
  const acts = Array.from(item.system?.activities ?? []);
  const attack = acts.find(a => a.type === 'attack');
  const dmg = acts.find(a => a.damage?.parts?.length);
  const sv = acts.find(a => a.type === 'save' && a.save);
  const at = attack?.actionType || '';
  const parts = dmg?.damage?.parts ?? [];
  const types = parts[0]?.types ? Array.from(parts[0].types) : (parts[0]?.type ? [parts[0].type] : []);
  const dcVal = sv ? (sv.save?.dc?.value ?? sv.save?.dc) : null;
  return {
    melee: at === 'mwak' || at === 'msak',
    ranged: at === 'rwak' || at === 'rsak',
    damageType: types[0] || '',
    saveDC: (typeof dcVal === 'number') ? dcVal : null,
  };
}

/* ----------------------------------------------------------- target snapshot */
function snapshotTargets() {
  return getTargets().map(t => {
    const a = t.actor; const sys = a?.system ?? {};
    return {
      name: a?.name ?? 'Target',
      img: t.document?.texture?.src || a?.img || 'icons/svg/mystery-man.svg',
      ac: sys.attributes?.ac?.value ?? null,
      hp: `${sys.attributes?.hp?.value ?? '—'}/${sys.attributes?.hp?.max ?? '—'}${sys.attributes?.hp?.temp ? '+' + sys.attributes.hp.temp : ''}`,
    };
  });
}

/* --------------------------------------------------------------- card build */
function glyph(ctx) { return ctx?.ranged ? '🏹' : ctx?.melee ? '⚔️' : '🎲'; }

function buildCard(card) {
  const actor = card.actorId ? game.actors.get(card.actorId) : null;
  const portrait = actor?.img || 'icons/svg/mystery-man.svg';
  const targets = card.targets || [];

  // Attack section
  let atkSec = '';
  if (card.atk) {
    const critCls = card.atk.nat === 20 ? ' crit' : card.atk.nat === 1 ? ' fumble' : '';
    const advTag = card.atk.kind ? `<span class="ddbx2-pill">${esc(card.atk.kind)}</span>` : '';
    const rows = targets.map(t => {
      const v = (typeof t.ac === 'number')
        ? (card.atk.total >= t.ac ? `<span class="ddbx2-hit">HIT</span>` : `<span class="ddbx2-miss">MISS</span>`)
        : '—';
      return `<div class="ddbx2-trow"><img class="ddbx2-timg" src="${t.img}"><span class="ddbx2-tname">${esc(t.name)}</span><span class="ddbx2-stat">AC ${t.ac ?? '?'}</span> ${v}</div>`;
    }).join('');
    atkSec = `<div class="ddbx2-sec"><div class="ddbx2-lbl">To Hit</div>
      <div class="ddbx2-num${critCls}">${card.atk.total}${advTag}</div>${rows}</div>`;
  }

  // Damage section
  let dmgSec = '';
  if (card.dmg) {
    const typeTag = card.dmg.dtype ? `<span class="ddbx2-tag">${esc(card.dmg.dtype)}</span>` : '';
    const rows = targets.map(t =>
      `<div class="ddbx2-trow"><img class="ddbx2-timg" src="${t.img}"><span class="ddbx2-tname">${esc(t.name)}</span><span class="ddbx2-stat">❤️ ${t.hp}</span></div>`
    ).join('');
    dmgSec = `<div class="ddbx2-sec"><div class="ddbx2-lbl">Damage ${typeTag}</div>
      <div class="ddbx2-num">${card.dmg.total}</div>${rows}
      <div class="ddbx2-bar">
        <button type="button" data-ddbx="damage">💥 Apply ${card.dmg.total}${card.dmg.dtype ? ' ' + esc(card.dmg.dtype) : ''}</button>
        <button type="button" data-ddbx="heal">➕ Heal</button>
        <button type="button" data-ddbx="temp">🛡 Temp</button>
      </div></div>`;
  }

  // Generic (check/save/other) number
  let genSec = '';
  if (!card.atk && !card.dmg && card.gen) {
    genSec = `<div class="ddbx2-sec"><div class="ddbx2-lbl">${esc(card.gen.label || 'Roll')}</div><div class="ddbx2-num">${card.gen.total}</div></div>`;
  }

  const footer = `<div class="ddbx2-bar">
    <button type="button" data-ddbx="save">🎲 Save${card.saveDC != null ? ' DC ' + card.saveDC : ''}</button>
    <button type="button" data-ddbx="condition">⚠ Condition</button>
    <button type="button" data-ddbx="reactions">↩ Reactions</button>
  </div>`;

  return `<div class="ddbx2">
    <div class="ddbx2-head"><img class="ddbx2-portrait" src="${portrait}">
      <div><div class="ddbx2-title">${esc(card.who)}</div><div class="ddbx2-sub">${glyph(card)} ${esc(card.action)}</div></div></div>
    ${atkSec}${dmgSec}${genSec}${footer}
  </div>`;
}

async function postGM(card) {
  const speaker = card.actorId ? ChatMessage.getSpeaker({ actor: game.actors.get(card.actorId) }) : { alias: card.who };
  const msg = await ChatMessage.create({
    speaker,
    whisper: ChatMessage.getWhisperRecipients('GM').map(u => u.id),
    content: buildCard(card),
    flags: { [NS]: { card } },
  });
  return msg;
}
async function publicLine(card, kind, total, extra) {
  const speaker = card.actorId ? ChatMessage.getSpeaker({ actor: game.actors.get(card.actorId) }) : { alias: card.who };
  await ChatMessage.create({
    speaker,
    content: `<div class="ddbx2-pub">${esc(card.who)} — ${esc(card.action)} <span class="ddbx2-lbl">${kind}</span><br><b>${total}</b> ${extra || ''}</div>`,
  });
}

/* --------------------------------------------------------------- render */
async function renderRoll(data) {
  const roll = data.rolls?.[0] || {};
  const total = Number(roll.result?.total ?? 0);
  const breakdown = roll.result?.text || '';
  const rollType = (roll.rollType || '').toLowerCase();
  const action = data.action || 'Roll';
  const actor = resolveActor(data);
  const who = actor?.name || data.context?.name || 'D&D Beyond';
  const ctx = resolveAction(actor, action);
  const key = `${actor?.id || who}|${action.toLowerCase()}`;

  const base = { who, action, actorId: actor?.id || null, melee: ctx.melee, ranged: ctx.ranged, saveDC: ctx.saveDC };

  if (rollType === 'to hit') {
    const card = { ...base, targets: snapshotTargets(), atk: { total, nat: natFace(roll), kind: roll.rollKind || '' } };
    const msg = await postGM(card);
    if (msg) actionCards.set(key, { id: msg.id, ts: Date.now() });
    publicLine(card, 'to hit', total, `<span style="opacity:.6">(${esc(ddbFormula(roll))})</span>`);
    return;
  }

  if (rollType === 'damage') {
    const rec = actionCards.get(key);
    const msg = rec ? game.messages.get(rec.id) : null;
    if (msg && (Date.now() - rec.ts) < 60000) {
      const ex = msg.getFlag(NS, 'card') || base;
      const merged = { ...ex, dmg: { total, dtype: ctx.damageType } };
      await msg.update({ content: buildCard(merged), flags: { [NS]: { card: merged } } });
    } else {
      await postGM({ ...base, targets: snapshotTargets(), dmg: { total, dtype: ctx.damageType } });
    }
    publicLine(base, 'damage', total, ctx.damageType ? esc(ctx.damageType) : '');
    return;
  }

  // checks / saves / generic
  const card = { ...base, targets: snapshotTargets(), gen: { total, label: rollType || action } };
  await postGM(card);
  publicLine(card, rollType || 'roll', total, `<span style="opacity:.6">(${esc(ddbFormula(roll))})</span>`);
}

/* ----------------------------------------------------------- button actions */
async function applyDamage(actor, amount) {
  const hp = foundry.utils.deepClone(actor.system.attributes.hp);
  let rem = Math.abs(amount), temp = hp.temp || 0; const ab = Math.min(temp, rem); temp -= ab; rem -= ab;
  await actor.update({ 'system.attributes.hp.temp': temp, 'system.attributes.hp.value': Math.max(0, (hp.value || 0) - rem) });
}
async function applyTypedDamage(actor, amount, type) {
  try { if (typeof actor.applyDamage === 'function') { await actor.applyDamage([{ value: Math.abs(amount), type: type || undefined }]); return; } } catch (e) {}
  await applyDamage(actor, amount);
}
async function applyHealing(actor, amount) {
  const hp = actor.system.attributes.hp;
  await actor.update({ 'system.attributes.hp.value': Math.min(hp.max ?? Infinity, (hp.value || 0) + Math.abs(amount)) });
}
async function applyTemp(actor, amount) {
  const cur = actor.system.attributes.hp.temp || 0;
  await actor.update({ 'system.attributes.hp.temp': Math.max(cur, Math.abs(amount)) });
}
async function applyTo(kind, amount, dtype) {
  const t = requireTargets(); if (!t) return;
  if (!amount) { ui.notifications.warn('DDB: no value to apply.'); return; }
  const verb = kind === 'heal' ? 'healing' : kind === 'temp' ? 'temp HP' : `${dtype ? dtype + ' ' : ''}damage`;
  for (const a of t) { try { kind === 'heal' ? await applyHealing(a, amount) : kind === 'temp' ? await applyTemp(a, amount) : await applyTypedDamage(a, amount, dtype); } catch (e) { console.error(e); } }
  ChatMessage.create({ content: `Applied <b>${amount}</b> ${esc(verb)} to ${t.map(a => esc(a.name)).join(', ')}.` });
}
function hitCheck(total) {
  const t = requireTargets(); if (!t) return;
  const lines = t.map(a => { const ac = a.system.attributes?.ac?.value ?? '?'; const v = (typeof ac === 'number') ? (total >= ac ? '✅ HIT' : '❌ MISS') : '—'; return `<li><b>${esc(a.name)}</b> — AC ${ac} → ${v}</li>`; }).join('');
  ChatMessage.create({ content: `<div><b>🎯 ${total}</b><ul style="margin:4px 0 0;padding-left:18px;">${lines}</ul></div>` });
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
  let chosen; try { chosen = await foundry.applications.api.DialogV2.wait({ window: { title: 'Toggle Condition' }, content: `<select name="cond" style="width:100%;">${opts}</select>`, buttons: [{ action: 'ok', label: 'Toggle', default: true, callback: (e, b) => b.form.elements.cond.value }, { action: 'cancel', label: 'Cancel', callback: () => null }] }); } catch (e) { return; }
  if (!chosen) return;
  for (const a of t) { try { await a.toggleStatusEffect?.(chosen); } catch (e) { console.error(e); } }
}
function listReactions() {
  const t = requireTargets(); if (!t) return;
  const blocks = t.map(a => { const r = actorReactions(a); return `<div style="margin-top:4px;"><b>${esc(a.name)}</b>: ${r.length ? esc(r.join(', ')) : '<em>none</em>'}</div>`; }).join('');
  ChatMessage.create({ content: `<div>↩ <b>Reactions</b>${blocks}</div>` });
}
function onAction(action, card) {
  if (!game.user?.isGM) { ui.notifications.warn('DDB: only the GM can apply card actions.'); return; }
  const dmg = card?.dmg, atk = card?.atk, gen = card?.gen;
  switch (action) {
    case 'hit': return hitCheck(Number(atk?.total ?? gen?.total ?? dmg?.total ?? 0));
    case 'damage': return applyTo('damage', Number(dmg?.total ?? 0), dmg?.dtype);
    case 'heal': return applyTo('heal', Number(dmg?.total ?? 0));
    case 'temp': return applyTo('temp', Number(dmg?.total ?? 0));
    case 'save': return promptSaves();
    case 'condition': return promptCondition();
    case 'reactions': return listReactions();
  }
}

/* ------------------------------------- MidiQOL bridge (opt-in, experimental) */
let pendingForce = null;
function applyForce(roll) {
  if (!pendingForce) return;
  if (Date.now() - pendingForce.ts > 10000) { pendingForce = null; return; }
  const dice = (roll?.terms ?? []).filter(t => t instanceof foundry.dice.terms.Die && t.faces === 20);
  if (!dice.length) return;
  for (const term of dice) for (let i = 0; i < term.results.length; i++) { const v = pendingForce.values[i] ?? pendingForce.values[0]; if (v != null && term.results[i]) term.results[i].result = v; }
  try { roll._total = roll._evaluateTotal(); } catch (e) {}
  pendingForce = null;
}
function installForceOverride() {
  if (globalThis.__ddbxForceInstalled) return; globalThis.__ddbxForceInstalled = true;
  const oe = Roll.prototype.evaluate; Roll.prototype.evaluate = async function (...a) { const r = await oe.apply(this, a); try { applyForce(this); } catch (e) {} return r; };
  const os = Roll.prototype.evaluateSync; if (typeof os === 'function') Roll.prototype.evaluateSync = function (...a) { const r = os.apply(this, a); try { applyForce(this); } catch (e) {} return r; };
}
async function triggerMidiAttack(data, actor) {
  const item = findItem(actor, data.action); if (!item) { renderRoll(data); return; }
  pendingForce = { actorId: actor.id, values: data.rolls?.[0]?.result?.values || [], ts: Date.now() };
  try { await item.use(); } catch (e) { console.error(e); } finally { setTimeout(() => { pendingForce = null; }, 10000); }
}
function forceModeOn() { try { return game.settings.get(NS, 'forceMidiAttacks'); } catch (e) { return false; } }

/* ------------------------------------------------------------- socket tap */
function onRaw(ev) {
  let msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
  if (typeof msg?.eventType !== 'string' || !msg.eventType.startsWith('dice/roll')) return;
  const data = msg.data || msg;
  const rollId = data.rollId || msg.id;
  if (!rollId || seen.has(rollId)) return;
  seen.set(rollId, Date.now());
  if (!data.rolls?.length) return;
  const rollType = (data.rolls[0].rollType || '').toLowerCase();
  if (forceModeOn() && rollType === 'to hit') {
    const actor = resolveActor(data);
    if (actor && findItem(actor, data.action)) { triggerMidiAttack(data, actor); return; }
  }
  renderRoll(data).catch(e => console.error('DDB Roll Cards | render error', e));
}
function attachTap() {
  const ws = game.DDBSync?.websocketManager?.websocket?.ws;
  if (ws && !ws.__ddbxTapped) { ws.__ddbxTapped = true; ws.addEventListener('message', onRaw); console.log('DDB Roll Cards | tapped ddb-sync socket'); }
}

/* --------------------------------------------------------------- bootstrap */
Hooks.once('init', () => {
  game.settings.register(NS, 'forceMidiAttacks', {
    name: 'Force weapon attacks through MidiQOL',
    hint: 'EXPERIMENTAL: route weapon to-hit rolls into the item\'s MidiQOL workflow and overwrite its d20 with your DDB roll. Off = render the DDB Roll Cards (recommended).',
    scope: 'world', config: true, type: Boolean, default: false,
  });
});

Hooks.once('ready', () => {
  if (!game.modules.get(SYNC)?.active) { ui.notifications.warn('DDB Roll Cards requires "D&D Beyond Sync" to be enabled.'); return; }
  if (!game.user.isGM) return;
  injectStyles();
  installForceOverride();
  attachTap();
  try { game.DDBSync?.websocketManager?.addEventListener?.('connected', () => setTimeout(attachTap, 100)); } catch (e) {}
  setInterval(() => {
    attachTap();
    const cut = Date.now() - 60000;
    for (const [k, t] of seen) if (t < cut) seen.delete(k);
    for (const [k, r] of actionCards) if (r.ts < cut) actionCards.delete(k);
  }, 4000);
  Hooks.on('renderChatMessageHTML', (message, el) => {
    let card; try { card = message.getFlag(NS, 'card'); } catch (e) { return; }
    if (!card) return;
    const root = (el instanceof HTMLElement) ? el : el?.[0];
    root?.querySelectorAll('[data-ddbx]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); onAction(b.dataset.ddbx, card); }));
  });
  console.log('DDB Roll Cards | ready (v3 unified card)');
});
