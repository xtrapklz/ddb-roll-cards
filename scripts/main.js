/**
 * DDB Roll Cards — companion for D&D Beyond Sync.
 * One D&D-Beyond-styled card per action (to-hit + damage fold together), native
 * dnd5e-style damage multiplier controls, and a bold Baldur's-Gate-style public
 * card with a watermark icon. GM-only interactivity; no MidiQOL, no 2nd socket.
 */

const NS = 'ddb-roll-cards';
const SYNC = 'ddb-sync';
const seen = new Map();
const actionCards = new Map(); // key -> { gmId, pubId, gm, pub, ts }
let applyMode = 'targeted';

const IC = { d20: 'fa-dice-d20', dmg: 'fa-burst', hp: 'fa-heart', save: 'fa-shield-halved', cond: 'fa-bolt', react: 'fa-arrow-rotate-left', hit: 'fa-check', miss: 'fa-xmark' };
function actionIcon() { return IC.d20; } // attacks read clearest as a d20

/* ------------------------------------------------------------------ styles */
const STYLES = `
.ddbx2{border:1px solid rgba(0,0,0,.45);border-radius:6px;overflow:hidden;background:#17181c;color:#e9e9ea;font-family:Signika,sans-serif;}
.ddbx2-act{padding:5px 9px;font-weight:bold;font-size:12px;background:linear-gradient(90deg,#222226,#34343a);color:#f2f2f2;display:flex;align-items:center;gap:6px;}
.ddbx2-sec{padding:6px 9px;border-top:1px solid rgba(255,255,255,.07);}
.ddbx2-lbl{font-size:10px;font-weight:bold;letter-spacing:.08em;color:#e8966e;text-transform:uppercase;display:flex;align-items:center;gap:5px;}
.ddbx2-num{font-size:28px;font-weight:bold;line-height:1;text-align:center;margin:2px 0 3px;color:#f4f4f4;}
.ddbx2-num.crit{color:#5fd07a;} .ddbx2-num.fumble{color:#ff6b6b;}
.ddbx2-pill{font-size:10px;padding:0 6px;border-radius:8px;background:rgba(255,255,255,.12);font-weight:normal;color:#e9e9ea;}
.ddbx2-tag{font-size:10px;padding:0 6px;border-radius:8px;background:rgba(224,138,106,.22);border:1px solid rgba(224,138,106,.5);font-weight:normal;color:#f3cdbc;}
.ddbx2-trow{display:flex;align-items:center;gap:6px;margin-top:4px;font-size:12px;color:#dcdcdc;}
.ddbx2-timg{width:24px;height:24px;border-radius:4px;object-fit:cover;border:1px solid rgba(0,0,0,.5);}
.ddbx2-tname{font-weight:bold;flex:1 1 auto;}
.ddbx2-stat{opacity:.8;white-space:nowrap;}
.ddbx2-hit{color:#69d77f;font-weight:bold;} .ddbx2-miss{color:#ff7b7b;font-weight:bold;}
.ddbx2-mode{display:flex;gap:3px;margin-top:6px;}
.ddbx2-mults{display:flex;gap:3px;margin-top:4px;}
.ddbx2 .ddbx2-mode button,.ddbx2 .ddbx2-mults button,.ddbx2 .ddbx2-bar button{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.18);color:#ededed;cursor:pointer;}
.ddbx2 .ddbx2-mode button:hover,.ddbx2 .ddbx2-mults button:hover,.ddbx2 .ddbx2-bar button:hover{background:rgba(255,255,255,.14);}
.ddbx2-mode button{flex:1 1 0;font-size:10px;line-height:18px;padding:0;opacity:.6;border-radius:3px;}
.ddbx2-mode button.active{opacity:1;font-weight:bold;box-shadow:inset 0 0 0 1px #e0824d;}
.ddbx2-mults button{flex:1 1 0;font-size:13px;line-height:26px;padding:0;border-radius:3px;}
.ddbx2-mults button.primary{font-weight:bold;box-shadow:inset 0 0 0 1px rgba(224,130,77,.6);}
.ddbx2-bar{display:flex;gap:5px;padding:6px 9px;border-top:1px solid rgba(255,255,255,.07);}
.ddbx2-bar button{flex:0 0 auto;font-size:11px;line-height:22px;padding:0 9px;border-radius:4px;white-space:nowrap;}
/* Player-facing card with watermark */
.ddbx2-pc{position:relative;overflow:hidden;border-radius:8px;background:#17181c;background-image:radial-gradient(circle at 50% -20%, var(--accent,rgba(160,27,27,.28)), transparent 72%);padding:12px 10px;text-align:center;color:#eee;}
.ddbx2-pc-wm{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;}
.ddbx2-pc-wm i{font-size:128px;opacity:.07;color:#fff;}
.ddbx2-pc-body{position:relative;z-index:1;}
.ddbx2-pc-lbl{font-size:11px;font-weight:bold;letter-spacing:.14em;text-transform:uppercase;color:#d8d8d8;}
.ddbx2-pc-num{font-size:50px;font-weight:900;line-height:.95;margin:1px 0 6px;color:#f6f6f6;}
.ddbx2-pc-num:last-of-type{margin-bottom:0;}
.ddbx2-pc-num.crit{color:#5fd07a;text-shadow:0 0 12px rgba(95,208,122,.6);}
.ddbx2-pc-num.fumble{color:#ff6b6b;text-shadow:0 0 12px rgba(255,107,107,.6);}
.ddbx2-pc-sub{font-size:10px;opacity:.5;margin-top:4px;color:#cfcfcf;}
`;
function injectStyles() { if (document.getElementById('ddbx2-styles')) return; const el = document.createElement('style'); el.id = 'ddbx2-styles'; el.textContent = STYLES; document.head.appendChild(el); }

/* ------------------------------------------------------------------ helpers */
function esc(s) { return foundry.utils.escapeHTML ? foundry.utils.escapeHTML(String(s)) : String(s); }
function getTargets() { return Array.from(game.user?.targets ?? []); }
function controlledActors() { return (canvas.tokens?.controlled ?? []).map(t => t.actor).filter(Boolean); }
function applyTargetsList() { if (applyMode === 'selected') return controlledActors(); const tg = getTargets().map(t => t.actor).filter(Boolean); return tg.length ? tg : controlledActors(); }
function mappedActor(entityId) { let m = {}; try { m = game.settings.get(SYNC, 'characterMapping') || {}; } catch (e) {} const id = m[entityId]; return id ? game.actors.get(id) : null; }
function resolveActor(data) { return mappedActor(data.context?.entityId || data.entityId) || (data.context?.name ? game.actors.getName(data.context.name) : null); }
function ddbFormula(roll) { const n = roll?.diceNotation || {}; const dice = (n.set || []).map(s => `${s.count || 1}${s.dieType || ''}`).join(' + '); const c = n.constant || 0; return (dice && c) ? `${dice} + ${c}` : (dice || String(c || (roll?.result?.total ?? ''))); }
function natFace(roll) { const v = roll?.result?.values; if (!Array.isArray(v) || !v.length) return null; if (v.includes(20)) return 20; if (v.length === 1 && v[0] === 1) return 1; return null; }
function findItem(actor, name) { if (!actor?.items || !name) return null; const n = String(name).toLowerCase().trim(); return actor.items.find(i => i.name.toLowerCase().trim() === n) || actor.items.find(i => i.name.toLowerCase().includes(n) || n.includes(i.name.toLowerCase())) || null; }
function resolveAction(actor, name) {
  const item = findItem(actor, name); if (!item) return {};
  const acts = Array.from(item.system?.activities ?? []);
  const dmg = acts.find(a => a.damage?.parts?.length); const sv = acts.find(a => a.type === 'save' && a.save);
  const parts = dmg?.damage?.parts ?? []; const types = parts[0]?.types ? Array.from(parts[0].types) : (parts[0]?.type ? [parts[0].type] : []);
  const dcVal = sv ? (sv.save?.dc?.value ?? sv.save?.dc) : null;
  return { damageType: types[0] || '', saveDC: (typeof dcVal === 'number') ? dcVal : null };
}
function actorReactions(actor) { return (actor?.items ?? []).filter(i => { const a = i.system?.activities; if (a?.size) return Array.from(a).some(x => x?.activation?.type === 'reaction'); return i.system?.activation?.type === 'reaction'; }).map(i => i.name); }
function snapshotTargets() { return getTargets().map(t => { const a = t.actor, s = a?.system ?? {}; return { name: a?.name ?? 'Target', img: t.document?.texture?.src || a?.img || 'icons/svg/mystery-man.svg', ac: s.attributes?.ac?.value ?? null, hp: `${s.attributes?.hp?.value ?? '—'}/${s.attributes?.hp?.max ?? '—'}${s.attributes?.hp?.temp ? '+' + s.attributes.hp.temp : ''}` }; }); }

/* --------------------------------------------------------------- GM card */
function buildCard(card) {
  const targets = card.targets || [];
  let atkSec = '';
  if (card.atk) {
    const cls = card.atk.nat === 20 ? ' crit' : card.atk.nat === 1 ? ' fumble' : '';
    const adv = card.atk.kind ? `<span class="ddbx2-pill">${esc(card.atk.kind)}</span>` : '';
    const rows = targets.map(t => { const v = (typeof t.ac === 'number') ? (card.atk.total >= t.ac ? `<span class="ddbx2-hit"><i class="fas ${IC.hit}"></i> HIT</span>` : `<span class="ddbx2-miss"><i class="fas ${IC.miss}"></i> MISS</span>`) : ''; return `<div class="ddbx2-trow"><img class="ddbx2-timg" src="${t.img}"><span class="ddbx2-tname">${esc(t.name)}</span><span class="ddbx2-stat">AC ${t.ac ?? '?'}</span> ${v}</div>`; }).join('');
    atkSec = `<div class="ddbx2-sec"><div class="ddbx2-lbl"><i class="fas ${IC.d20}"></i> To Hit ${adv}</div><div class="ddbx2-num${cls}">${card.atk.total}</div>${rows}</div>`;
  }
  let dmgSec = '';
  if (card.dmg) {
    const tag = card.dmg.dtype ? `<span class="ddbx2-tag">${esc(card.dmg.dtype)}</span>` : '';
    const rows = targets.map(t => `<div class="ddbx2-trow"><img class="ddbx2-timg" src="${t.img}"><span class="ddbx2-tname">${esc(t.name)}</span><span class="ddbx2-stat"><i class="fas ${IC.hp}"></i> ${t.hp}</span></div>`).join('');
    dmgSec = `<div class="ddbx2-sec"><div class="ddbx2-lbl"><i class="fas ${IC.dmg}"></i> Damage ${tag}</div><div class="ddbx2-num">${card.dmg.total}</div>${rows}
      <div class="ddbx2-mode"><button data-ddbx="mode" data-mode="targeted" class="${applyMode === 'targeted' ? 'active' : ''}">Targeted</button><button data-ddbx="mode" data-mode="selected" class="${applyMode === 'selected' ? 'active' : ''}">Selected</button></div>
      <div class="ddbx2-mults">
        <button data-ddbx="mult" data-mult="-1" title="Heal">-1</button>
        <button data-ddbx="mult" data-mult="0" title="No damage">0</button>
        <button data-ddbx="mult" data-mult="0.25" title="Quarter">&frac14;</button>
        <button data-ddbx="mult" data-mult="0.5" title="Half (resist/save)">&frac12;</button>
        <button data-ddbx="mult" data-mult="1" class="primary" title="Full">1</button>
        <button data-ddbx="mult" data-mult="2" title="Double (crit/vuln)">2</button>
      </div></div>`;
  }
  let genSec = '';
  if (!card.atk && !card.dmg && card.gen) genSec = `<div class="ddbx2-sec"><div class="ddbx2-lbl"><i class="fas ${IC.d20}"></i> ${esc(card.gen.label || 'Roll')}</div><div class="ddbx2-num">${card.gen.total}</div></div>`;
  const footer = `<div class="ddbx2-bar">
    <button data-ddbx="save"><i class="fas ${IC.save}"></i> ${card.saveDC != null ? 'DC ' + card.saveDC : 'Save'}</button>
    <button data-ddbx="condition" title="Toggle condition"><i class="fas ${IC.cond}"></i></button>
    <button data-ddbx="reactions" title="List reactions"><i class="fas ${IC.react}"></i></button>
  </div>`;
  return `<div class="ddbx2"><div class="ddbx2-act"><i class="fas ${actionIcon()}"></i> ${esc(card.action)}</div>${atkSec}${dmgSec}${genSec}${footer}</div>`;
}

/* --------------------------------------------------------------- player card */
function publicCard(pub) {
  const wm = pub.dmg && !pub.atk ? IC.dmg : IC.d20;
  const accent = (pub.dmg && !pub.atk) ? 'rgba(196,93,49,.30)' : pub.gen ? 'rgba(60,110,170,.28)' : 'rgba(160,27,27,.28)';
  const blk = (label, total, nat, tag) => { const c = nat === 20 ? ' crit' : nat === 1 ? ' fumble' : ''; return `<div class="ddbx2-pc-lbl">${esc(label)}${tag || ''}</div><div class="ddbx2-pc-num${c}">${total}</div>`; };
  let body = '';
  if (pub.atk) body += blk('To Hit', pub.atk.total, pub.atk.nat);
  if (pub.dmg) body += blk('Damage', pub.dmg.total, null, pub.dmg.dtype ? ` <span class="ddbx2-tag">${esc(pub.dmg.dtype)}</span>` : '');
  if (pub.gen) body += blk(pub.gen.label || 'Roll', pub.gen.total, pub.gen.nat);
  return `<div class="ddbx2-pc" style="--accent:${accent}"><div class="ddbx2-pc-wm"><i class="fas ${wm}"></i></div>
    <div class="ddbx2-pc-body">${body}<div class="ddbx2-pc-sub">${esc(pub.action)}${pub.formula ? ' · ' + esc(pub.formula) : ''}</div></div></div>`;
}

function speakerFor(c) { return c.actorId ? ChatMessage.getSpeaker({ actor: game.actors.get(c.actorId) }) : { alias: c.who }; }
async function postGM(card) { return ChatMessage.create({ speaker: speakerFor(card), whisper: ChatMessage.getWhisperRecipients('GM').map(u => u.id), content: buildCard(card), flags: { [NS]: { card } } }); }
async function postPublic(pub) { return ChatMessage.create({ speaker: speakerFor(pub), content: publicCard(pub) }); }

/* --------------------------------------------------------------- render */
async function renderRoll(data) {
  const roll = data.rolls?.[0] || {};
  const total = Number(roll.result?.total ?? 0);
  const rollType = (roll.rollType || '').toLowerCase();
  const action = data.action || 'Roll';
  const actor = resolveActor(data);
  const who = actor?.name || data.context?.name || 'D&D Beyond';
  const ctx = resolveAction(actor, action);
  const key = `${actor?.id || who}|${action.toLowerCase()}`;
  const base = { who, action, actorId: actor?.id || null, saveDC: ctx.saveDC };
  const nat = natFace(roll);
  const formula = ddbFormula(roll);

  if (rollType === 'to hit') {
    const gm = { ...base, targets: snapshotTargets(), atk: { total, nat, kind: roll.rollKind || '' } };
    const pub = { ...base, formula, atk: { total, nat } };
    const gmMsg = await postGM(gm); const pubMsg = await postPublic(pub);
    actionCards.set(key, { gmId: gmMsg?.id, pubId: pubMsg?.id, gm, pub, ts: Date.now() });
    return;
  }
  if (rollType === 'damage') {
    const rec = actionCards.get(key);
    if (rec && (Date.now() - rec.ts) < 60000) {
      const gmMsg = rec.gmId ? game.messages.get(rec.gmId) : null;
      const pubMsg = rec.pubId ? game.messages.get(rec.pubId) : null;
      rec.gm = { ...rec.gm, dmg: { total, dtype: ctx.damageType } };
      rec.pub = { ...rec.pub, dmg: { total, dtype: ctx.damageType } };
      if (gmMsg) await gmMsg.update({ content: buildCard(rec.gm), flags: { [NS]: { card: rec.gm } } });
      else await postGM({ ...base, targets: snapshotTargets(), dmg: rec.gm.dmg });
      if (pubMsg) await pubMsg.update({ content: publicCard(rec.pub) });
      else await postPublic({ ...base, formula, dmg: rec.pub.dmg });
      return;
    }
    await postGM({ ...base, targets: snapshotTargets(), dmg: { total, dtype: ctx.damageType } });
    await postPublic({ ...base, formula, dmg: { total, dtype: ctx.damageType } });
    return;
  }
  await postGM({ ...base, targets: snapshotTargets(), gen: { total, label: rollType || action } });
  await postPublic({ ...base, formula, gen: { total, nat, label: rollType || action } });
}

/* ----------------------------------------------------------- actions */
async function applyHealing(actor, amount) { const hp = actor.system.attributes.hp; await actor.update({ 'system.attributes.hp.value': Math.min(hp.max ?? Infinity, (hp.value || 0) + Math.abs(amount)) }); }
async function manualDamage(actor, amount) { const hp = foundry.utils.deepClone(actor.system.attributes.hp); let rem = Math.abs(amount), temp = hp.temp || 0; const ab = Math.min(temp, rem); temp -= ab; rem -= ab; await actor.update({ 'system.attributes.hp.temp': temp, 'system.attributes.hp.value': Math.max(0, (hp.value || 0) - rem) }); }
async function applyMult(card, mult) {
  const dmg = card?.dmg; if (!dmg) return;
  const list = applyTargetsList(); if (!list.length) { ui.notifications.warn(`DDB: ${applyMode} no token(s).`); return; }
  for (const a of list) { try { if (typeof a.applyDamage === 'function') await a.applyDamage([{ value: Math.abs(dmg.total), type: dmg.dtype || undefined }], { multiplier: mult }); else { const amt = Math.floor(Math.abs(dmg.total) * Math.abs(mult)); mult < 0 ? await applyHealing(a, amt) : await manualDamage(a, amt); } } catch (e) { console.error(e); } }
  const n = Math.floor(Math.abs(dmg.total) * Math.abs(mult));
  ChatMessage.create({ content: `Applied <b>${mult < 0 ? n + ' healing' : n + (mult !== 1 ? ` (×${mult})` : '') + ' ' + (dmg.dtype || 'damage')}</b> to ${list.map(a => esc(a.name)).join(', ')}.` });
}
async function promptSaves() { const t = applyTargetsList(); if (!t.length) { ui.notifications.warn('DDB: target/select token(s).'); return; } const buttons = Object.entries(CONFIG.DND5E?.abilities ?? {}).map(([k, c]) => ({ action: k, label: c.label ?? k.toUpperCase(), callback: () => k })); let ability; try { ability = await foundry.applications.api.DialogV2.wait({ window: { title: 'Saving Throw' }, content: '<p>Which save?</p>', buttons }); } catch (e) { return; } for (const a of t) { try { (a.rollSavingThrow ? a.rollSavingThrow({ ability }) : a.rollAbilitySave?.(ability)); } catch (e) { console.error(e); } } }
async function promptCondition() { const t = applyTargetsList(); if (!t.length) { ui.notifications.warn('DDB: target/select token(s).'); return; } const opts = (CONFIG.statusEffects ?? []).filter(e => e.id).map(e => `<option value="${e.id}">${game.i18n.localize(e.name ?? e.label ?? e.id)}</option>`).join(''); let chosen; try { chosen = await foundry.applications.api.DialogV2.wait({ window: { title: 'Toggle Condition' }, content: `<select name="cond" style="width:100%;">${opts}</select>`, buttons: [{ action: 'ok', label: 'Toggle', default: true, callback: (e, b) => b.form.elements.cond.value }, { action: 'cancel', label: 'Cancel', callback: () => null }] }); } catch (e) { return; } if (!chosen) return; for (const a of t) { try { await a.toggleStatusEffect?.(chosen); } catch (e) { console.error(e); } } }
function listReactions() { const t = applyTargetsList(); if (!t.length) { ui.notifications.warn('DDB: target/select token(s).'); return; } const blocks = t.map(a => { const r = actorReactions(a); return `<div style="margin-top:4px;"><b>${esc(a.name)}</b>: ${r.length ? esc(r.join(', ')) : '<em>none</em>'}</div>`; }).join(''); ChatMessage.create({ content: `<div><i class="fas ${IC.react}"></i> <b>Reactions</b>${blocks}</div>` }); }
function onAction(action, card, mult) {
  if (!game.user?.isGM) { ui.notifications.warn('DDB: only the GM can apply card actions.'); return; }
  switch (action) { case 'mult': return applyMult(card, Number(mult)); case 'save': return promptSaves(); case 'condition': return promptCondition(); case 'reactions': return listReactions(); }
}

/* ------------------------------------- MidiQOL bridge (opt-in, experimental) */
let pendingForce = null;
function applyForce(roll) { if (!pendingForce) return; if (Date.now() - pendingForce.ts > 10000) { pendingForce = null; return; } const dice = (roll?.terms ?? []).filter(t => t instanceof foundry.dice.terms.Die && t.faces === 20); if (!dice.length) return; for (const term of dice) for (let i = 0; i < term.results.length; i++) { const v = pendingForce.values[i] ?? pendingForce.values[0]; if (v != null && term.results[i]) term.results[i].result = v; } try { roll._total = roll._evaluateTotal(); } catch (e) {} pendingForce = null; }
function installForceOverride() { if (globalThis.__ddbxForceInstalled) return; globalThis.__ddbxForceInstalled = true; const oe = Roll.prototype.evaluate; Roll.prototype.evaluate = async function (...a) { const r = await oe.apply(this, a); try { applyForce(this); } catch (e) {} return r; }; const os = Roll.prototype.evaluateSync; if (typeof os === 'function') Roll.prototype.evaluateSync = function (...a) { const r = os.apply(this, a); try { applyForce(this); } catch (e) {} return r; }; }
async function triggerMidiAttack(data, actor) { const item = findItem(actor, data.action); if (!item) { renderRoll(data); return; } pendingForce = { actorId: actor.id, values: data.rolls?.[0]?.result?.values || [], ts: Date.now() }; try { await item.use(); } catch (e) { console.error(e); } finally { setTimeout(() => { pendingForce = null; }, 10000); } }
function forceModeOn() { try { return game.settings.get(NS, 'forceMidiAttacks'); } catch (e) { return false; } }

/* ------------------------------------------------------------- socket tap */
function onRaw(ev) {
  let msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
  if (typeof msg?.eventType !== 'string' || !msg.eventType.startsWith('dice/roll')) return;
  const data = msg.data || msg; const rollId = data.rollId || msg.id;
  if (!rollId || seen.has(rollId)) return; seen.set(rollId, Date.now());
  if (!data.rolls?.length) return;
  const rt = (data.rolls[0].rollType || '').toLowerCase();
  if (forceModeOn() && rt === 'to hit') { const actor = resolveActor(data); if (actor && findItem(actor, data.action)) { triggerMidiAttack(data, actor); return; } }
  renderRoll(data).catch(e => console.error('DDB Roll Cards | render error', e));
}
function attachTap() { const ws = game.DDBSync?.websocketManager?.websocket?.ws; if (ws && !ws.__ddbxTapped) { ws.__ddbxTapped = true; ws.addEventListener('message', onRaw); console.log('DDB Roll Cards | tapped ddb-sync socket'); } }

/* --------------------------------------------------------------- bootstrap */
Hooks.once('init', () => { game.settings.register(NS, 'forceMidiAttacks', { name: 'Force weapon attacks through MidiQOL', hint: 'EXPERIMENTAL: route weapon to-hit rolls into MidiQOL and overwrite its d20 with your DDB roll. Off = render DDB Roll Cards (recommended).', scope: 'world', config: true, type: Boolean, default: false }); });
Hooks.once('ready', () => {
  if (!game.modules.get(SYNC)?.active) { ui.notifications.warn('DDB Roll Cards requires "D&D Beyond Sync" to be enabled.'); return; }
  if (!game.user.isGM) return;
  injectStyles(); installForceOverride(); attachTap();
  try { game.DDBSync?.websocketManager?.addEventListener?.('connected', () => setTimeout(attachTap, 100)); } catch (e) {}
  setInterval(() => { attachTap(); const cut = Date.now() - 60000; for (const [k, t] of seen) if (t < cut) seen.delete(k); for (const [k, r] of actionCards) if (r.ts < cut) actionCards.delete(k); }, 4000);
  Hooks.on('renderChatMessageHTML', (message, el) => {
    let card; try { card = message.getFlag(NS, 'card'); } catch (e) { return; } if (!card) return;
    const root = (el instanceof HTMLElement) ? el : el?.[0]; if (!root) return;
    root.querySelectorAll('[data-ddbx]').forEach(b => b.addEventListener('click', e => {
      e.preventDefault();
      if (b.dataset.ddbx === 'mode') { applyMode = b.dataset.mode; root.querySelectorAll('[data-ddbx="mode"]').forEach(x => x.classList.toggle('active', x.dataset.mode === applyMode)); return; }
      onAction(b.dataset.ddbx, card, b.dataset.mult);
    }));
  });
  console.log('DDB Roll Cards | ready (v3.2)');
});
