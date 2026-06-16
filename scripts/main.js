/**
 * DDB Roll Cards — companion for D&D Beyond Sync.
 * One D&D-Beyond-styled card per action (to-hit + damage fold together) for BOTH
 * DDB-socket rolls and local dnd5e rolls (monsters), native-style damage multipliers
 * that collapse after applying, confirm hit/miss to players, and a bold player card
 * watermarked with the action's own artwork. GM-only; no MidiQOL, no 2nd socket.
 */

const NS = 'ddb-roll-cards';
const SYNC = 'ddb-sync';
const seen = new Map();
const actionCards = new Map(); // key -> { gmId, pubId, gm, pub, ts }
let applyMode = 'targeted';

// All flat, monochrome FontAwesome line/solid glyphs — no emoji-shaped icons (burst/heart/bolt swapped out).
const IC = { d20: 'fa-dice-d20', dmg: 'fa-droplet', hp: 'fa-heart-pulse', save: 'fa-shield-halved', cond: 'fa-circle-exclamation', react: 'fa-arrow-rotate-left', hit: 'fa-check', miss: 'fa-xmark', reopen: 'fa-rotate-left' };
const WM_IMG = 'icons/logo-scifi-blank.png';

/* ------------------------------------------------------------------ styles */
const STYLES = `
.ddbx2{border:1px solid rgba(0,0,0,.45);border-radius:6px;overflow:hidden;background:#17181c;color:#e9e9ea;font-family:Signika,sans-serif;}
.ddbx2-act{padding:5px 9px;font-weight:bold;font-size:12px;background:linear-gradient(90deg,#222226,#34343a);color:#f2f2f2;display:flex;align-items:center;gap:6px;}
.ddbx2-sec{padding:6px 9px;border-top:1px solid rgba(255,255,255,.07);}
.ddbx2-lbl{font-size:10px;font-weight:bold;letter-spacing:.08em;color:#e8966e;text-transform:uppercase;display:flex;align-items:center;gap:5px;flex-wrap:nowrap;white-space:nowrap;}
.ddbx2-num{font-size:28px;font-weight:bold;line-height:1;text-align:center;margin:2px 0 3px;color:#f4f4f4;}
.ddbx2-num.crit{color:#5fd07a;} .ddbx2-num.fumble{color:#ff6b6b;}
.ddbx2-pill{font-size:10px;padding:0 6px;border-radius:8px;background:rgba(255,255,255,.12);font-weight:normal;color:#e9e9ea;}
.ddbx2-tag{font-size:10px;padding:0 6px;border-radius:8px;background:rgba(224,138,106,.22);border:1px solid rgba(224,138,106,.5);font-weight:normal;color:#f3cdbc;}
.ddbx2-trow{display:flex;align-items:center;gap:6px;margin-top:4px;font-size:12px;color:#dcdcdc;}
.ddbx2-timg{width:24px;height:24px;border-radius:4px;object-fit:cover;border:1px solid rgba(0,0,0,.5);}
.ddbx2-tname{font-weight:bold;flex:1 1 auto;}
.ddbx2-stat{opacity:.8;white-space:nowrap;}
.ddbx2-hit{color:#69d77f;font-weight:bold;} .ddbx2-miss{color:#ff7b7b;font-weight:bold;}
.ddbx2-resolved{margin-top:6px;font-size:12px;color:#9fd8ac;display:flex;align-items:center;gap:6px;}
.ddbx2-mode{display:flex;gap:3px;margin-top:6px;}
.ddbx2-mults{display:flex;gap:3px;margin-top:4px;}
.ddbx2 .ddbx2-mode button,.ddbx2 .ddbx2-mults button,.ddbx2 .ddbx2-bar button,.ddbx2 .ddbx2-resolved button{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.18);color:#ededed;cursor:pointer;}
.ddbx2 .ddbx2-mode button:hover,.ddbx2 .ddbx2-mults button:hover,.ddbx2 .ddbx2-bar button:hover,.ddbx2 .ddbx2-resolved button:hover{background:rgba(255,255,255,.14);}
.ddbx2-mode button{flex:1 1 0;font-size:10px;line-height:18px;padding:0;opacity:.6;border-radius:3px;}
.ddbx2-mode button.active{opacity:1;font-weight:bold;box-shadow:inset 0 0 0 1px #e0824d;}
.ddbx2-mults button{flex:1 1 0;font-size:13px;line-height:26px;padding:0;border-radius:3px;}
.ddbx2-mults button.primary{font-weight:bold;box-shadow:inset 0 0 0 1px rgba(224,130,77,.6);}
.ddbx2-bar{display:flex;gap:5px;padding:6px 9px;border-top:1px solid rgba(255,255,255,.07);}
.ddbx2-bar.inline{border-top:none;padding:6px 0 0;}
.ddbx2-bar button{flex:1 1 0;font-size:11px;line-height:24px;padding:0 6px;border-radius:4px;white-space:nowrap;display:flex;align-items:center;justify-content:center;gap:5px;}
.ddbx2-undo{flex:0 0 26px !important;width:26px;min-width:26px;height:26px;padding:0 !important;line-height:24px;border-radius:4px;margin-left:auto;display:inline-flex;align-items:center;justify-content:center;}
.ddbx2 [data-ddbx="dtype"]{cursor:pointer;border-style:dashed;}
.ddbx2 [data-ddbx="dtype"]:hover{filter:brightness(1.25);}
.ddbx2-dsel{font-size:11px;max-width:120px;background:#222;color:#eee;border:1px solid rgba(224,138,106,.6);border-radius:8px;padding:1px 4px;}
.ddbx2 .ddbx2-sv{flex:0 0 22px;width:22px;height:22px;padding:0;margin-left:4px;border-radius:4px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.18);color:#ededed;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:11px;}
.ddbx2 .ddbx2-sv:hover{background:rgba(255,255,255,.14);}
.ddbx2 .ddbx2-sv.on.hit{box-shadow:inset 0 0 0 1px #5fd07a;color:#69d77f;}
.ddbx2 .ddbx2-sv.on.miss{box-shadow:inset 0 0 0 1px #ff6b6b;color:#ff7b7b;}
.ddbx2 .ddbx2-sv.on.dmg{box-shadow:inset 0 0 0 1px #e0824d;color:#f3cdbc;}
.ddbx2-srow{flex-wrap:wrap;}
.ddbx2-grp{display:inline-flex;gap:3px;}
.ddbx2-portion{display:inline-flex;gap:3px;margin-left:auto;}
.ddbx2-conds{display:inline-flex;align-items:center;gap:3px;flex-wrap:wrap;margin-left:4px;}
.ddbx2 .ddbx2-cond{display:inline-flex;align-items:center;gap:3px;font-size:9px;line-height:16px;padding:0 6px;border-radius:8px;background:rgba(224,138,106,.22);border:1px solid rgba(224,138,106,.5);color:#f3cdbc;cursor:pointer;}
.ddbx2 .ddbx2-cond:hover{background:rgba(224,138,106,.4);}
.ddbx2-foot{justify-content:flex-start;}
.ddbx2 .ddbx2-foot button.ddbx2-icn{flex:0 0 34px;width:34px;}
.ddbx2-pc-title{font-size:16px;font-weight:900;letter-spacing:.02em;margin-bottom:6px;color:#fff;}
.ddbx2-pc-cond{display:block;font-size:10px;opacity:.85;color:#f3cdbc;width:100%;margin-top:2px;}
.ddbx2-pc{position:relative;overflow:hidden;border-radius:8px;background:#17181c;background-image:radial-gradient(circle at 50% -20%, var(--accent,rgba(160,27,27,.28)), transparent 72%);padding:12px 10px;text-align:center;color:#eee;}
.ddbx2-pc-wm{position:absolute;inset:0;opacity:.16;pointer-events:none;}
.ddbx2-pc-body{position:relative;z-index:1;}
.ddbx2-pc-lbl.ddbx2-pc-hit{font-size:18px;letter-spacing:.12em;color:#5fd07a;text-shadow:0 0 10px rgba(95,208,122,.5);}
.ddbx2-pc-lbl.ddbx2-pc-miss{font-size:18px;letter-spacing:.12em;color:#ff6b6b;text-shadow:0 0 10px rgba(255,107,107,.5);}
.ddbx2-pc-lbl{font-size:11px;font-weight:bold;letter-spacing:.14em;text-transform:uppercase;color:#d8d8d8;}
.ddbx2-pc-num{font-size:50px;font-weight:900;line-height:.95;margin:1px 0 6px;color:#f6f6f6;}
.ddbx2-pc-num:last-of-type{margin-bottom:0;}
.ddbx2-pc-num.crit{color:#5fd07a;text-shadow:0 0 12px rgba(95,208,122,.6);}
.ddbx2-pc-num.fumble{color:#ff6b6b;text-shadow:0 0 12px rgba(255,107,107,.6);}
.ddbx2-pc-sub{font-size:10px;opacity:.5;margin-top:4px;color:#cfcfcf;}
.ddbx2-pc-tgts{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-top:7px;}
.ddbx2-pc-tgt{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:bold;background:rgba(0,0,0,.4);padding:2px 9px 2px 2px;border-radius:13px;}
.ddbx2-pc-tgt img{width:20px;height:20px;border-radius:50%;object-fit:cover;}
.ddbx2-pc-tgt .ddbx2-hit{color:#69d77f;} .ddbx2-pc-tgt .ddbx2-miss{color:#ff7b7b;}
`;
function injectStyles() { if (document.getElementById('ddbx2-styles')) return; const el = document.createElement('style'); el.id = 'ddbx2-styles'; el.textContent = STYLES; document.head.appendChild(el); }

/* ------------------------------------------------------------------ helpers */
function esc(s) { return foundry.utils.escapeHTML ? foundry.utils.escapeHTML(String(s)) : String(s); }
function getTargets() { return Array.from(game.user?.targets ?? []); }
function controlledActors() { return (canvas.tokens?.controlled ?? []).map(t => t.actor).filter(Boolean); }
function applyTargetsList() { if (applyMode === 'selected') return controlledActors(); const tg = getTargets().map(t => t.actor).filter(Boolean); return tg.length ? tg : controlledActors(); }
function getMapping() { try { const m = game.settings.get(NS, 'characterMapping'); if (m && Object.keys(m).length) return m; } catch (e) {} if (game.modules.get(SYNC)?.active) { try { return game.settings.get(SYNC, 'characterMapping') || {}; } catch (e) {} } return {}; }
function mappedActor(entityId) { const m = getMapping(); const id = m[entityId]; return id ? game.actors.get(id) : null; }
function resolveActor(data) { return mappedActor(data.context?.entityId || data.entityId) || (data.context?.name ? game.actors.getName(data.context.name) : null); }
function ddbFormula(roll) { const n = roll?.diceNotation || {}; const dice = (n.set || []).map(s => `${s.count || 1}${s.dieType || ''}`).join(' + '); const c = n.constant || 0; return (dice && c) ? `${dice} + ${c}` : (dice || String(c || (roll?.result?.total ?? ''))); }
function natFace(roll) { const v = roll?.result?.values; if (!Array.isArray(v) || !v.length) return null; if (v.includes(20)) return 20; if (v.length === 1 && v[0] === 1) return 1; return null; }
function findItem(actor, name) { if (!actor?.items || !name) return null; const n = String(name).toLowerCase().trim().replace(/[.\s]+$/, ''); return actor.items.find(i => i.name.toLowerCase().trim().replace(/[.\s]+$/, '') === n) || actor.items.find(i => { const inm = i.name.toLowerCase().trim(); return inm.includes(n) || n.includes(inm); }) || null; }
const ABIL = { str: 'strength', dex: 'dexterity', con: 'constitution', int: 'intelligence', wis: 'wisdom', cha: 'charisma' };
function abilityIcon(ab) { return ab && ABIL[ab] ? `systems/dnd5e/icons/svg/abilities/${ABIL[ab]}.svg` : ''; }
function abilityLabel(ab) { return CONFIG.DND5E?.abilities?.[ab]?.label || (ab ? ab.toUpperCase() : 'Save'); }
function abilityShort(ab) { return (CONFIG.DND5E?.abilities?.[ab]?.abbreviation || ab || 'save').toUpperCase(); }
function defaultMult(result) { return result === 'save' ? 0.5 : 1; }
function defaultHit(t, total) { return (typeof t.ac === 'number') ? (total >= t.ac ? 'hit' : 'miss') : undefined; }
// Smart default damage portion from the outcome: hit/failed-save → full, miss/saved → none, unknown → full.
function defaultPortion(o) { return (o === 'hit' || o === 'fail') ? 1 : (o === 'miss' || o === 'save') ? 0 : 1; }
function condLabel(id) { const e = (CONFIG.statusEffects || []).find(x => x.id === id); return e ? game.i18n.localize(e.name ?? e.label ?? id) : id; }
function firstOf(v) { return v instanceof Set ? Array.from(v)[0] : (Array.isArray(v) ? v[0] : v); }
function checkAbilityFromName(name) {
  if (!name) return null; const n = String(name).toLowerCase();
  const abil = CONFIG.DND5E?.abilities ?? {}; for (const [k, v] of Object.entries(abil)) { if (n === k || (v.label && n.includes(v.label.toLowerCase()))) return k; }
  const sk = CONFIG.DND5E?.skills ?? {}; for (const [k, v] of Object.entries(sk)) { if (k === n || (v.label && n.includes(v.label.toLowerCase()))) return v.ability; }
  return null;
}
function resolveAction(actor, name) {
  const item = findItem(actor, name); if (!item) return {};
  const acts = Array.from(item.system?.activities ?? []);
  const dmg = acts.find(a => a.damage?.parts?.length); const sv = acts.find(a => a.type === 'save' && a.save);
  const parts = dmg?.damage?.parts ?? []; const types = parts[0]?.types ? Array.from(parts[0].types) : (parts[0]?.type ? [parts[0].type] : []);
  const dcVal = sv ? (sv.save?.dc?.value ?? sv.save?.dc) : null;
  // All damage-part types in order — DDB sends one same-named damage roll per type, accumulated as parts.
  const allTypes = []; for (const a of acts) for (const p of (a.damage?.parts ?? [])) { const t = p.types ? Array.from(p.types)[0] : p.type; if (t) allTypes.push(t); }
  return { damageType: types[0] || '', damageTypes: allTypes.length ? allTypes : (types[0] ? [types[0]] : []), saveDC: (typeof dcVal === 'number') ? dcVal : null, saveAbility: firstOf(sv?.save?.ability) || null, img: item.img || '' };
}
function actorReactions(actor) { return (actor?.items ?? []).filter(i => { const a = i.system?.activities; if (a?.size) return Array.from(a).some(x => x?.activation?.type === 'reaction'); return i.system?.activation?.type === 'reaction'; }).map(i => i.name); }
function snapshotTargets() { return getTargets().map(t => { const a = t.actor, s = a?.system ?? {}; return { name: a?.name ?? 'Target', img: t.document?.texture?.src || a?.img || 'icons/svg/mystery-man.svg', ac: s.attributes?.ac?.value ?? null, hp: `${s.attributes?.hp?.value ?? '—'}/${s.attributes?.hp?.max ?? '—'}${s.attributes?.hp?.temp ? '+' + s.attributes.hp.temp : ''}` }; }); }

/* --------------------------------------------------------------- GM card */
// One per-target row shared by attacks & saves: outcome → damage portion → conditions.
function resolveRow(card, t) {
  const isAtk = !!card.atk;
  let outcome, toggles;
  if (isAtk) {
    outcome = card.atk.verdicts?.[t.name] ?? defaultHit(t, card.atk.total);
    toggles = `<button class="ddbx2-sv ${outcome === 'hit' ? 'on hit' : ''}" data-ddbx="markhit" data-tname="${esc(t.name)}" data-v="hit" title="Hit"><i class="fas ${IC.hit}"></i></button>`
      + `<button class="ddbx2-sv ${outcome === 'miss' ? 'on miss' : ''}" data-ddbx="markhit" data-tname="${esc(t.name)}" data-v="miss" title="Miss"><i class="fas ${IC.miss}"></i></button>`;
  } else {
    outcome = card.save.results?.[t.name];
    toggles = `<button class="ddbx2-sv" data-ddbx="rollsave" data-tname="${esc(t.name)}" title="Roll save"><i class="fas ${IC.d20}"></i></button>`
      + `<button class="ddbx2-sv ${outcome === 'fail' ? 'on miss' : ''}" data-ddbx="mark" data-tname="${esc(t.name)}" data-v="fail" title="Failed"><i class="fas ${IC.miss}"></i></button>`
      + `<button class="ddbx2-sv ${outcome === 'save' ? 'on hit' : ''}" data-ddbx="mark" data-tname="${esc(t.name)}" data-v="save" title="Saved"><i class="fas ${IC.save}"></i></button>`;
  }
  const tg = card.tgt?.[t.name] || {};
  const m = (tg.mult ?? defaultPortion(outcome));
  const pbtn = (val, lbl, ti) => `<button class="ddbx2-sv ${m === val ? 'on dmg' : ''}" data-ddbx="tmult" data-tname="${esc(t.name)}" data-mult="${val}" title="${ti}">${lbl}</button>`;
  const conds = (tg.conditions || []).map(id => `<span class="ddbx2-cond" data-ddbx="delcond" data-tname="${esc(t.name)}" data-cid="${esc(id)}" title="Remove">${esc(condLabel(id))} <i class="fas ${IC.miss}"></i></span>`).join('');
  return `<div class="ddbx2-trow ddbx2-srow"><img class="ddbx2-timg" src="${t.img}"><span class="ddbx2-tname">${esc(t.name)}</span>`
    + (isAtk ? `<span class="ddbx2-stat">AC ${t.ac ?? '?'}</span>` : '')
    + `<span class="ddbx2-grp">${toggles}</span>`
    + `<span class="ddbx2-portion">${pbtn(0, '0', 'No damage')}${pbtn(0.5, '&frac12;', 'Half')}${pbtn(1, '1', 'Full')}</span>`
    + `<span class="ddbx2-conds">${conds}<button class="ddbx2-sv" data-ddbx="addcond" data-tname="${esc(t.name)}" title="Add condition"><i class="fas ${IC.cond}"></i></button></span></div>`;
}
function buildCard(card) {
  const targets = card.targets || [];
  const hasT = targets.length;
  const resolve = card.dmg && hasT && (card.atk || card.save); // unified per-target panel
  const dtypeTag = () => { const parts = card.dmg?.parts || []; if (parts.length > 1) return `<span class="ddbx2-tag">${esc(dmgTypeLabel(card.dmg))}</span>`; const d = parts[0]?.type || ''; return `<span class="ddbx2-tag" data-ddbx="dtype" title="Change damage type">${d ? esc(d) : 'set type'} <i class="fas fa-caret-down" style="opacity:.65;"></i></span>`; };
  // --- To Hit ---
  let atkSec = '';
  if (card.atk) {
    const cls = card.atk.nat === 20 ? ' crit' : card.atk.nat === 1 ? ' fumble' : '';
    const adv = card.atk.kind ? `<span class="ddbx2-pill">${esc(card.atk.kind)}</span>` : '';
    let extra = '';
    if (!resolve) {
      if (hasT) {
        const rows = targets.map(t => { const v = card.atk.verdicts?.[t.name] ?? defaultHit(t, card.atk.total); return `<div class="ddbx2-trow ddbx2-srow"><img class="ddbx2-timg" src="${t.img}"><span class="ddbx2-tname">${esc(t.name)}</span><span class="ddbx2-stat">AC ${t.ac ?? '?'}</span><span class="ddbx2-grp"><button class="ddbx2-sv ${v === 'hit' ? 'on hit' : ''}" data-ddbx="markhit" data-tname="${esc(t.name)}" data-v="hit" title="Hit"><i class="fas ${IC.hit}"></i></button><button class="ddbx2-sv ${v === 'miss' ? 'on miss' : ''}" data-ddbx="markhit" data-tname="${esc(t.name)}" data-v="miss" title="Miss"><i class="fas ${IC.miss}"></i></button></span></div>`; }).join('');
        extra = rows + (card.atk.confirmed ? `<div class="ddbx2-resolved"><i class="fas ${IC.hit}"></i> Hits confirmed<button class="ddbx2-undo" data-ddbx="reopenhits" title="Re-open"><i class="fas ${IC.reopen}"></i></button></div>` : `<div class="ddbx2-bar inline"><button data-ddbx="confirmhits"><i class="fas ${IC.hit}"></i> Confirm hits</button></div>`);
      } else {
        extra = card.atk.verdict
          ? `<div class="ddbx2-resolved" style="color:${card.atk.verdict === 'hit' ? '#69d77f' : '#ff7b7b'};"><i class="fas ${card.atk.verdict === 'hit' ? IC.hit : IC.miss}"></i> ${card.atk.verdict === 'hit' ? 'Hit' : 'Miss'} confirmed<button class="ddbx2-undo" data-ddbx="reverdict" title="Undo"><i class="fas ${IC.reopen}"></i></button></div>`
          : `<div class="ddbx2-bar inline"><button data-ddbx="verdict" data-v="hit"><i class="fas ${IC.hit}"></i> Hit</button><button data-ddbx="verdict" data-v="miss"><i class="fas ${IC.miss}"></i> Miss</button></div>`;
      }
    }
    atkSec = `<div class="ddbx2-sec"><div class="ddbx2-lbl"><i class="fas ${IC.d20}"></i> To Hit ${adv}</div><div class="ddbx2-num${cls}">${card.atk.total}</div>${extra}</div>`;
  }
  // --- Damage (+ unified resolve panel) ---
  let dmgSec = '';
  if (card.dmg) {
    const total = dmgTotal(card.dmg);
    const gate = card.save ? `DC ${card.save.dc} ${esc(abilityShort(card.save.ability))} Save · ` : '';
    const lbl = `<div class="ddbx2-lbl">${card.save ? `<i class="fas ${IC.save}"></i>` : `<i class="fas ${IC.dmg}"></i>`} ${gate}Damage ${dtypeTag()}</div>`;
    let body;
    if (resolve) {
      if (card.applied) {
        body = `<div class="ddbx2-resolved"><i class="fas ${IC.hit}"></i> ${esc(card.audit || 'Applied.')}<button class="ddbx2-undo" data-ddbx="reopenall" title="Re-open"><i class="fas ${IC.reopen}"></i></button></div>`;
      } else {
        const rows = targets.map(t => resolveRow(card, t)).join('');
        const lead = card.save ? `<button data-ddbx="rollallsaves"><i class="fas ${IC.d20}"></i> Roll all</button>` : `<button data-ddbx="confirmhits"><i class="fas ${IC.hit}"></i> Confirm hits</button>`;
        body = `${rows}<div class="ddbx2-bar inline">${lead}<button data-ddbx="applyall"><i class="fas ${IC.dmg}"></i> Apply all</button></div>`;
      }
    } else if (hasT && (card.atk || card.save)) {
      body = '<div class="ddbx2-resolved">Select tokens to resolve per target.</div>';
    } else {
      // Damage-only / no targets: global multiplier flow.
      const rows = targets.map(t => `<div class="ddbx2-trow"><img class="ddbx2-timg" src="${t.img}"><span class="ddbx2-tname">${esc(t.name)}</span><span class="ddbx2-stat"><i class="fas ${IC.hp}"></i> ${t.hp}</span></div>`).join('');
      body = card.dmg.resolved
        ? `<div class="ddbx2-resolved"><i class="fas ${IC.hit}"></i> Applied ${esc(card.dmg.resolved)}<button class="ddbx2-undo" data-ddbx="reopen" title="Re-open"><i class="fas ${IC.reopen}"></i></button></div>`
        : `${rows}<div class="ddbx2-mode"><button data-ddbx="mode" data-mode="targeted" class="${applyMode === 'targeted' ? 'active' : ''}">Targeted</button><button data-ddbx="mode" data-mode="selected" class="${applyMode === 'selected' ? 'active' : ''}">Selected</button></div>
         <div class="ddbx2-mults"><button data-ddbx="mult" data-mult="-1" title="Heal">-1</button><button data-ddbx="mult" data-mult="0" title="None">0</button><button data-ddbx="mult" data-mult="0.25" title="Quarter">&frac14;</button><button data-ddbx="mult" data-mult="0.5" title="Half">&frac12;</button><button data-ddbx="mult" data-mult="1" class="primary" title="Full">1</button><button data-ddbx="mult" data-mult="2" title="Double">2</button></div>`;
    }
    dmgSec = `<div class="ddbx2-sec">${lbl}<div class="ddbx2-num">${total}</div>${body}</div>`;
  }
  const saveSec = '';
  let genSec = '';
  if (!card.atk && !card.dmg && card.gen) {
    const gcls = card.gen.nat === 20 ? ' crit' : card.gen.nat === 1 ? ' fumble' : '';
    const genBar = card.gen.verdict
      ? `<div class="ddbx2-resolved" style="color:${card.gen.verdict === 'success' ? '#69d77f' : '#ff7b7b'};"><i class="fas ${card.gen.verdict === 'success' ? IC.hit : IC.miss}"></i> ${card.gen.verdict === 'success' ? 'Success' : 'Failure'}<button class="ddbx2-undo" data-ddbx="regen" title="Undo"><i class="fas ${IC.reopen}"></i></button></div>`
      : `<div class="ddbx2-bar inline"><button data-ddbx="genverdict" data-v="success"><i class="fas ${IC.hit}"></i> Success</button><button data-ddbx="genverdict" data-v="fail"><i class="fas ${IC.miss}"></i> Failure</button></div>`;
    genSec = `<div class="ddbx2-sec"><div class="ddbx2-lbl"><i class="fas ${IC.d20}"></i> ${esc(card.gen.label || 'Roll')}</div><div class="ddbx2-num${gcls}">${card.gen.total}</div>${genBar}</div>`;
  }
  // Compact icon utilities (tooltips on hover) so they never overflow the card width.
  const footer = `<div class="ddbx2-bar ddbx2-foot">
    ${card.save ? '' : `<button class="ddbx2-icn" data-ddbx="save" title="Roll a saving throw for targets${card.saveDC != null ? ' (DC ' + card.saveDC + ')' : ''}"><i class="fas ${IC.save}"></i></button>`}
    <button class="ddbx2-icn" data-ddbx="condition" title="Toggle a condition on targets"><i class="fas ${IC.cond}"></i></button>
    <button class="ddbx2-icn" data-ddbx="reactions" title="List target reactions"><i class="fas ${IC.react}"></i></button>
  </div>`;
  return `<div class="ddbx2"><div class="ddbx2-act"><i class="fas ${IC.d20}"></i> ${esc(card.action)}</div>${atkSec}${saveSec}${dmgSec}${genSec}${footer}</div>`;
}

/* --------------------------------------------------------------- player card */
function publicCard(pub) {
  const nat = pub.atk?.nat ?? pub.gen?.nat ?? null;
  const tint = nat === 20 ? '#5fd07a' : nat === 1 ? '#ff6b6b' : (pub.dmg && !pub.atk) ? '#e0824d' : '#9fc2ff';
  const accent = (pub.dmg && !pub.atk) ? 'rgba(196,93,49,.30)' : pub.gen ? 'rgba(60,110,170,.28)' : 'rgba(160,27,27,.28)';
  const wm = pub.img
    ? `<div class="ddbx2-pc-wm" style="background:url('${pub.img}') center/cover no-repeat;"></div>`
    : `<div class="ddbx2-pc-wm" style="background-color:${tint};-webkit-mask:url('${WM_IMG}') center/62% no-repeat;mask:url('${WM_IMG}') center/62% no-repeat;"></div>`;
  const num = (label, total, n, lblCls) => { const c = n === 20 ? ' crit' : n === 1 ? ' fumble' : ''; return `<div class="ddbx2-pc-lbl${lblCls || ''}">${label}</div><div class="ddbx2-pc-num${c}">${total}</div>`; };
  let body = '';
  if (pub.atk) {
    // Single-verdict (no targets) replaces the label with HIT!/MISS. With targets, per-target marks on the
    // chips carry the result, so the label collapses to HIT!/MISS only when every target shares one outcome.
    const av = pub.atk.verdicts && Object.values(pub.atk.verdicts);
    const allSame = av && av.length && av.every(x => x === av[0]) ? av[0] : null;
    const single = pub.verdict || (pub.atk.confirmed ? allSame : null);
    const lbl = single ? (single === 'hit' ? 'HIT!' : 'MISS') : 'To Hit';
    body += num(esc(lbl), pub.atk.total, pub.atk.nat, single ? ` ddbx2-pc-${single}` : '');
  }
  if (pub.save) body += `<div class="ddbx2-pc-lbl">DC ${pub.save.dc} ${esc(abilityLabel(pub.save.ability))} Save</div>`;
  if (pub.dmg && (!pub.save || pub.revealed)) {
    const tl = dmgTypeLabel(pub.dmg);
    body += num(tl ? `${esc(tl)} Damage` : 'Damage', dmgTotal(pub.dmg), null);
  }
  if (pub.gen) {
    const lbl = pub.verdict ? (pub.verdict === 'success' ? 'SUCCESS' : 'FAILURE') : (pub.gen.label || 'Roll');
    body += num(esc(lbl), pub.gen.total, pub.gen.nat, pub.verdict ? ` ddbx2-pc-${pub.verdict === 'success' ? 'hit' : 'miss'}` : '');
  }
  let tgts = '';
  if (pub.targets?.length) {
    tgts = `<div class="ddbx2-pc-tgts">${pub.targets.map(t => {
      let mark = '';
      const sr = pub.save?.results?.[t.name];
      const av = pub.atk?.confirmed ? pub.atk.verdicts?.[t.name] : null;
      if (sr) mark = sr === 'fail' ? `<span class="ddbx2-miss"><i class="fas ${IC.miss}"></i></span>` : `<span class="ddbx2-hit"><i class="fas ${IC.save}"></i></span>`;
      else if (av === 'hit' || av === 'miss') mark = `<span class="ddbx2-${av}"><i class="fas ${av === 'hit' ? IC.hit : IC.miss}"></i></span>`;
      else if (pub.verdict === 'hit' || pub.verdict === 'miss') mark = `<span class="ddbx2-${pub.verdict}"><i class="fas ${pub.verdict === 'hit' ? IC.hit : IC.miss}"></i></span>`;
      // Conditions applied to this target appear once damage is committed.
      const conds = pub.applied ? (pub.tgt?.[t.name]?.conditions || []) : [];
      const condTxt = conds.length ? `<span class="ddbx2-pc-cond">${conds.map(c => esc(condLabel(c))).join(', ')}</span>` : '';
      return `<span class="ddbx2-pc-tgt"><img src="${t.img}">${esc(t.name)}${mark}${condTxt}</span>`;
    }).join('')}</div>`;
  }
  // Action name prominent at top; roll formula in small print at the bottom.
  return `<div class="ddbx2-pc" style="--accent:${accent}">${wm}<div class="ddbx2-pc-body"><div class="ddbx2-pc-title">${esc(pub.action)}</div>${body}${tgts}<div class="ddbx2-pc-sub">${pub.formula ? esc(pub.formula) : ''}</div></div></div>`;
}

function speakerFor(c) { return c.actorId ? ChatMessage.getSpeaker({ actor: game.actors.get(c.actorId) }) : { alias: c.who }; }
async function postGM(card) { return ChatMessage.create({ speaker: speakerFor(card), whisper: ChatMessage.getWhisperRecipients('GM').map(u => u.id), content: buildCard(card), flags: { [NS]: { card } } }); }
async function postPublic(pub) { return ChatMessage.create({ speaker: speakerFor(pub), content: publicCard(pub) }); }
async function pushRec(rec) { const gm = rec.gmId && game.messages.get(rec.gmId); const pub = rec.pubId && game.messages.get(rec.pubId); if (gm) await gm.update({ content: buildCard(rec.gm), flags: { [NS]: { card: rec.gm } } }); if (pub) await pub.update({ content: publicCard(rec.pub) }); }
// Damage parts helpers (a hit can carry several types, e.g. slashing + fire).
function dmgTotal(d) { return d ? (d.total ?? (d.parts || []).reduce((s, p) => s + (p.amount || 0), 0)) : 0; }
function dmgTypeLabel(d) { const ts = (d?.parts || []).map(p => p.type).filter(Boolean); return ts.length ? Array.from(new Set(ts)).join(' + ') : ''; }
function dmgApplyParts(d) { return (d?.parts || []).map(p => ({ value: Math.abs(p.amount || 0), type: p.type || undefined })); }

/* --------------------------------------------------------------- present */
async function present(p) {
  const base = { who: p.who, action: p.action, actorId: p.actorId, saveDC: p.saveDC, img: p.img };
  const key = `${p.actorId || p.who}|${(p.action || '').toLowerCase()}`;
  const pubT = (p.targets || []).map(t => ({ name: t.name, img: t.img }));
  if (p.kind === 'to hit') {
    const gm = { ...base, targets: p.targets, atk: { total: p.total, nat: p.nat, kind: p.advKind || '' } };
    const pub = { ...base, formula: p.formula, targets: pubT, atk: { total: p.total, nat: p.nat } };
    const gmMsg = await postGM(gm); const pubMsg = await postPublic(pub);
    actionCards.set(key, { gmId: gmMsg?.id, pubId: pubMsg?.id, gm, pub, ts: Date.now() });
    return;
  }
  if (p.kind === 'damage') {
    const rec = actionCards.get(key);
    const recent = rec && (Date.now() - rec.ts) < 60000;
    const expected = Math.max(1, (p.damageTypes?.length || 1));
    // Case A — fold the first damage into a pending attack card (To Hit already posted, no damage yet).
    if (recent && rec.gm?.atk && !rec.gm.dmg) {
      const part = { amount: p.total, type: p.damageTypes?.[0] || p.dtype || '' };
      const dmg = { parts: [part], total: p.total };
      rec.gm.dmg = foundry.utils.deepClone(dmg); rec.pub.dmg = foundry.utils.deepClone(dmg); rec.ts = Date.now();
      await pushRec(rec); return;
    }
    // Case B — another damage TYPE for the same action (DDB sends one same-named roll per type → accumulate).
    if (recent && rec?.gm?.dmg && rec.gm.dmg.parts.length < expected) {
      const part = { amount: p.total, type: p.damageTypes?.[rec.gm.dmg.parts.length] || '' };
      rec.gm.dmg.parts.push(foundry.utils.deepClone(part)); rec.gm.dmg.total += p.total;
      rec.pub.dmg.parts.push(foundry.utils.deepClone(part)); rec.pub.dmg.total += p.total; rec.ts = Date.now();
      await pushRec(rec); return;
    }
    // Case C — a fresh damage card.
    const part = { amount: p.total, type: p.damageTypes?.[0] || p.dtype || '' };
    const dmg = { parts: [part], total: p.total };
    const isSave = (p.saveDC != null) && p.saveAbility;
    const gm = { ...base, targets: p.targets, dmg: foundry.utils.deepClone(dmg) };
    const pub = { ...base, formula: p.formula, targets: pubT, dmg: foundry.utils.deepClone(dmg) };
    if (isSave) { gm.save = { dc: p.saveDC, ability: p.saveAbility, results: {} }; gm.revealed = false; pub.save = { dc: p.saveDC, ability: p.saveAbility, results: {} }; pub.revealed = false; }
    const gmMsg = await postGM(gm); const pubMsg = await postPublic(pub);
    actionCards.set(key, { gmId: gmMsg?.id, pubId: pubMsg?.id, gm, pub, ts: Date.now() });
    return;
  }
  const gm = { ...base, targets: p.targets, gen: { total: p.total, nat: p.nat, label: p.genLabel } };
  const pub = { ...base, formula: p.formula, targets: pubT, gen: { total: p.total, nat: p.nat, label: p.genLabel } };
  const gmMsg = await postGM(gm); const pubMsg = await postPublic(pub);
  actionCards.set(key, { gmId: gmMsg?.id, pubId: pubMsg?.id, gm, pub, ts: Date.now() });
}

async function renderRoll(data) {
  const roll = data.rolls?.[0] || {};
  const rt = (roll.rollType || '').toLowerCase();
  const action = data.action || 'Roll';
  const actor = resolveActor(data);
  const ctx = resolveAction(actor, action);
  const kind = rt === 'to hit' ? 'to hit' : rt === 'damage' ? 'damage' : 'other';
  const checkAb = kind === 'other' ? checkAbilityFromName(action) : null;
  const img = checkAb ? abilityIcon(checkAb) : ctx.img;
  return present({ who: actor?.name || data.context?.name || 'D&D Beyond', action, actorId: actor?.id || null, saveDC: ctx.saveDC, saveAbility: ctx.saveAbility, img, kind, total: Number(roll.result?.total ?? 0), nat: natFace(roll), dtype: ctx.damageType, damageTypes: ctx.damageTypes, advKind: roll.rollKind || '', targets: snapshotTargets(), formula: ddbFormula(roll), genLabel: rt || action });
}

function targetsFromFlags(ft) {
  if (!ft?.length) return snapshotTargets();
  return ft.map(t => { let a = null; try { a = fromUuidSync(t.uuid); } catch (e) {} const actor = a?.actor || a; const hp = actor?.system?.attributes?.hp; return { name: t.name, img: t.img || actor?.img || 'icons/svg/mystery-man.svg', ac: t.ac ?? actor?.system?.attributes?.ac?.value ?? null, hp: hp ? `${hp.value ?? '—'}/${hp.max ?? '—'}${hp.temp ? '+' + hp.temp : ''}` : '—/—' }; });
}
function renderLocalMessage(message) {
  const f = message.flags?.dnd5e; if (!f || f.messageType !== 'roll') return;
  const roll = message.rolls?.[0]; if (!roll) return;
  const rtype = f.roll?.type;
  let actor = message.speaker?.actor ? game.actors.get(message.speaker.actor) : null;
  if (!actor && message.speaker?.token) { try { actor = (message.speaker.scene ? game.scenes.get(message.speaker.scene) : canvas.scene)?.tokens?.get(message.speaker.token)?.actor; } catch (e) {} }
  let item = null; try { item = f.item?.uuid ? fromUuidSync(f.item.uuid) : null; } catch (e) {}
  const action = item?.name || (message.flavor || '').split(' - ')[0].trim() || rtype || 'Roll';
  const who = actor?.name || message.alias || action;
  const d20 = roll.dice?.find(d => d.faces === 20)?.results?.map(x => x.result) || null;
  const nat = d20 ? (d20.includes(20) ? 20 : (d20.length === 1 && d20[0] === 1 ? 1 : null)) : null;
  const ctx = resolveAction(actor, action);
  const kind = rtype === 'attack' ? 'to hit' : rtype === 'damage' ? 'damage' : 'other';
  // Skill / ability / save checks → use the dnd5e ability artwork for the associated ability.
  const r = f.roll || {};
  let ability = r.ability || null;
  if (!ability && r.skill) ability = CONFIG.DND5E?.skills?.[r.skill]?.ability;
  if (!ability && r.tool) ability = CONFIG.DND5E?.tools?.[r.tool]?.ability || 'int';
  if (!ability && kind === 'other') ability = checkAbilityFromName(action);
  const checkLabel = r.skill ? (CONFIG.DND5E?.skills?.[r.skill]?.label || action) : (rtype === 'save' && ability) ? `${abilityLabel(ability)} Save` : (rtype === 'ability' || rtype === 'check') && ability ? `${abilityLabel(ability)} Check` : (rtype || action);
  const img = (kind === 'other' && ability) ? abilityIcon(ability) : (ctx.img || item?.img || '');
  present({ who, action, actorId: actor?.id || null, saveDC: ctx.saveDC, saveAbility: ctx.saveAbility, img, kind, total: Number(roll.total ?? 0), nat, dtype: ctx.damageType, damageTypes: ctx.damageTypes, advKind: '', targets: targetsFromFlags(f.targets), formula: roll.formula, genLabel: kind === 'other' ? checkLabel : (rtype || action) }).catch(e => console.error('DDB Roll Cards | local render error', e));
}

/* ----------------------------------------------------------- actions */
async function applyHealing(actor, amount) { const hp = actor.system.attributes.hp; await actor.update({ 'system.attributes.hp.value': Math.min(hp.max ?? Infinity, (hp.value || 0) + Math.abs(amount)) }); }
async function manualDamage(actor, amount) { const hp = foundry.utils.deepClone(actor.system.attributes.hp); let rem = Math.abs(amount), temp = hp.temp || 0; const ab = Math.min(temp, rem); temp -= ab; rem -= ab; await actor.update({ 'system.attributes.hp.temp': temp, 'system.attributes.hp.value': Math.max(0, (hp.value || 0) - rem) }); }
async function applyMult(card, mult, message) {
  const dmg = card?.dmg; if (!dmg) return;
  const list = applyTargetsList(); if (!list.length) { ui.notifications.warn(`DDB: ${applyMode} no token(s).`); return; }
  const parts = dmgApplyParts(dmg);
  for (const a of list) { try { if (typeof a.applyDamage === 'function') await a.applyDamage(parts, { multiplier: mult }); else { const amt = Math.floor(dmgTotal(dmg) * Math.abs(mult)); mult < 0 ? await applyHealing(a, amt) : await manualDamage(a, amt); } } catch (e) { console.error(e); } }
  const n = Math.floor(dmgTotal(dmg) * Math.abs(mult)); const tl = dmgTypeLabel(dmg);
  const resolved = mult < 0 ? `${n} healing` : `${n}${mult !== 1 ? ` (×${mult})` : ''}${tl ? ' ' + tl : ' dmg'}`;
  dmg.resolved = resolved;
  const rec = actionCards.get(cardKey(card));
  if (rec?.gm?.dmg) rec.gm.dmg.resolved = resolved;
  if (message) { try { await message.update({ content: buildCard(card), flags: { [NS]: { card } } }); } catch (e) {} }
  // GM-only audit: how much the targets actually took stays a GM secret (players already see the damage rolled).
  ChatMessage.create({ whisper: ChatMessage.getWhisperRecipients('GM').map(u => u.id), content: `Applied <b>${resolved}</b> to ${list.map(a => esc(a.name)).join(', ')}.` });
}
async function reopenDamage(card, message) { if (card?.dmg) { delete card.dmg.resolved; const rec = actionCards.get(`${card.actorId || card.who}|${(card.action || '').toLowerCase()}`); if (rec?.gm?.dmg) delete rec.gm.dmg.resolved; if (message) try { await message.update({ content: buildCard(card), flags: { [NS]: { card } } }); } catch (e) {} } }
async function setVerdict(card, v, message) {
  if (card.atk) { if (v) card.atk.verdict = v; else delete card.atk.verdict; }
  const rec = actionCards.get(`${card.actorId || card.who}|${(card.action || '').toLowerCase()}`);
  if (rec) { if (rec.gm?.atk) { if (v) rec.gm.atk.verdict = v; else delete rec.gm.atk.verdict; } if (rec.pub) { if (v) rec.pub.verdict = v; else delete rec.pub.verdict; } }
  if (message) { try { await message.update({ content: buildCard(card), flags: { [NS]: { card } } }); } catch (e) {} }
  if (rec?.pubId) { const pm = game.messages.get(rec.pubId); if (pm && rec.pub) { try { await pm.update({ content: publicCard(rec.pub) }); return; } catch (e) {} } }
  if (v) await postPublic({ who: card.who, action: card.action, actorId: card.actorId, img: card.img, verdict: v, targets: (card.targets || []).map(t => ({ name: t.name, img: t.img })) });
}
async function changeDtype(card, newType, message) {
  if (!card.dmg?.parts?.length) return;
  const set = (d) => { if (d?.parts?.[0]) d.parts[0].type = newType || ''; };
  set(card.dmg);
  const rec = actionCards.get(cardKey(card)); if (rec) { set(rec.gm?.dmg); set(rec.pub?.dmg); }
  if (message) { try { await message.update({ content: buildCard(card), flags: { [NS]: { card } } }); } catch (e) {} }
  if (rec?.pubId) { const pm = game.messages.get(rec.pubId); if (pm && rec.pub) try { await pm.update({ content: publicCard(rec.pub) }); } catch (e) {} }
}
function cardKey(card) { return `${card.actorId || card.who}|${(card.action || '').toLowerCase()}`; }
// Per-target attack hit/miss (mirrors the save flow): GM toggles each target, then confirms to players.
function setAtkVerdict(card, name, v) {
  const set = (c) => { if (c?.atk) { c.atk.verdicts = c.atk.verdicts || {}; c.atk.verdicts[name] = v; } };
  set(card); const rec = actionCards.get(cardKey(card)); if (rec) { set(rec.gm); set(rec.pub); }
}
async function markHit(card, name, v, message) {
  if (!card.atk) return; setAtkVerdict(card, name, v);
  // GM-only update — players don't see hits until the GM confirms.
  if (message) { try { await message.update({ content: buildCard(card), flags: { [NS]: { card } } }); } catch (e) {} }
}
async function confirmHits(card, message) {
  if (!card.atk) return;
  for (const t of (card.targets || [])) { if (!card.atk.verdicts?.[t.name]) setAtkVerdict(card, t.name, defaultHit(t, card.atk.total) || 'miss'); }
  const set = (c) => { if (c?.atk) c.atk.confirmed = true; };
  set(card); const rec = actionCards.get(cardKey(card)); if (rec) { set(rec.gm); set(rec.pub); }
  await syncCards(card, message);
}
async function reopenHits(card, message) {
  const set = (c) => { if (c?.atk) c.atk.confirmed = false; };
  set(card); const rec = actionCards.get(cardKey(card)); if (rec) { set(rec.gm); set(rec.pub); }
  await syncCards(card, message);
}
async function syncCards(card, message) {
  const rec = actionCards.get(cardKey(card));
  if (message) { try { await message.update({ content: buildCard(card), flags: { [NS]: { card } } }); } catch (e) {} }
  if (rec?.pubId) { const pm = game.messages.get(rec.pubId); if (pm && rec.pub) try { await pm.update({ content: publicCard(rec.pub) }); } catch (e) {} }
  return rec;
}
async function setGenVerdict(card, v, message) {
  if (card.gen) { if (v) card.gen.verdict = v; else delete card.gen.verdict; }
  const rec = actionCards.get(cardKey(card));
  if (rec) { if (rec.gm?.gen) { if (v) rec.gm.gen.verdict = v; else delete rec.gm.gen.verdict; } if (rec.pub) { if (v) rec.pub.verdict = v; else delete rec.pub.verdict; } }
  await syncCards(card, message);
}
function actorByName(name) { return canvas.tokens?.placeables?.find(t => t.actor?.name === name)?.actor || game.actors.getName(name) || null; }
// Mutate the save result on the card + its cached GM/public twins, WITHOUT pushing an update (caller syncs once).
function applyResult(card, name, v) {
  const set = (s) => { if (!s) return; s.results = s.results || {}; if (v) s.results[name] = v; else delete s.results[name]; };
  set(card.save); const rec = actionCards.get(cardKey(card)); if (rec) { set(rec.gm?.save); set(rec.pub?.save); }
}
async function markSave(card, name, v, message) {
  if (!card.save) return; const cur = card.save.results?.[name];
  applyResult(card, name, cur === v ? null : v);
  await syncCards(card, message);
}
// Roll one save with NO chat card (create:false) and no dialog (configure:false); returns the total.
async function rollOneSave(name, ab) {
  const actor = actorByName(name); if (!actor) return null;
  try {
    const res = actor.rollSavingThrow ? await actor.rollSavingThrow({ ability: ab }, { configure: false }, { create: false }) : await actor.rollAbilitySave?.(ab, { fastForward: true, chatMessage: false });
    const roll = Array.isArray(res) ? res[0] : res;
    return roll?.total ?? roll?.rolls?.[0]?.total ?? null;
  } catch (e) { console.error('DDB Roll Cards | rollOneSave', e); return null; }
}
async function rollSave(card, name, message) {
  const ab = card.save?.ability; if (!ab) return;
  const total = await rollOneSave(name, ab);
  if (typeof total === 'number' && card.save?.dc != null) { applyResult(card, name, total >= card.save.dc ? 'save' : 'fail'); await syncCards(card, message); }
  else ui.notifications.warn(`DDB: couldn't roll save for ${name}.`);
}
async function rollAllSaves(card, message) {
  const ab = card.save?.ability; if (!ab) { ui.notifications.warn('DDB: no save ability resolved.'); return; }
  for (const t of (card.targets || [])) { const total = await rollOneSave(t.name, ab); if (typeof total === 'number' && card.save?.dc != null) applyResult(card, t.name, total >= card.save.dc ? 'save' : 'fail'); }
  await syncCards(card, message);
}
// Per-target damage portion + conditions live in card.tgt[name] = { mult, conditions:[] }. GM-only (no public push).
function ensureTgt(c, name) { c.tgt = c.tgt || {}; c.tgt[name] = c.tgt[name] || {}; return c.tgt[name]; }
async function setTargetMult(card, name, mult, message) {
  const set = (c) => { if (c) ensureTgt(c, name).mult = mult; };
  set(card); const rec = actionCards.get(cardKey(card)); if (rec) { set(rec.gm); set(rec.pub); }
  if (message) { try { await message.update({ content: buildCard(card), flags: { [NS]: { card } } }); } catch (e) {} }
}
async function setTargetCondition(card, name, cid, add, message) {
  const set = (c) => { if (!c) return; const arr = (ensureTgt(c, name).conditions = ensureTgt(c, name).conditions || []); const i = arr.indexOf(cid); if (add && i < 0) arr.push(cid); if (!add && i >= 0) arr.splice(i, 1); };
  set(card); const rec = actionCards.get(cardKey(card)); if (rec) { set(rec.gm); set(rec.pub); }
  if (message) { try { await message.update({ content: buildCard(card), flags: { [NS]: { card } } }); } catch (e) {} }
}
// Unified apply: per-target damage (portion × parts) + conditions, then confirm/reveal to players in one shot.
async function applyAll(card, message) {
  const dmg = card?.dmg; if (!dmg) return;
  const targets = card.targets || []; if (!targets.length) { ui.notifications.warn('DDB: no targets to apply to.'); return; }
  const isAtk = !!card.atk; const parts = dmgApplyParts(dmg); const audit = [];
  for (const t of targets) {
    const outcome = isAtk ? (card.atk.verdicts?.[t.name] ?? defaultHit(t, card.atk.total)) : card.save?.results?.[t.name];
    const mult = card.tgt?.[t.name]?.mult ?? defaultPortion(outcome);
    const actor = actorByName(t.name); if (!actor) continue;
    if (mult !== 0) { try { if (typeof actor.applyDamage === 'function') await actor.applyDamage(parts, { multiplier: mult }); else { const amt = Math.floor(dmgTotal(dmg) * Math.abs(mult)); mult < 0 ? await applyHealing(actor, amt) : await manualDamage(actor, amt); } } catch (e) { console.error(e); } }
    const conds = card.tgt?.[t.name]?.conditions || [];
    for (const cid of conds) { try { await actor.toggleStatusEffect?.(cid, { active: true }); } catch (e) { console.error(e); } }
    const dealt = Math.floor(dmgTotal(dmg) * Math.abs(mult));
    audit.push(`${t.name} ${dealt}${conds.length ? ' [' + conds.map(condLabel).join(', ') + ']' : ''}`);
  }
  const txt = `Applied — ${audit.join(', ')}`;
  const set = (c) => { if (c) { c.applied = true; c.audit = txt; c.revealed = true; if (c.atk) c.atk.confirmed = true; } };
  set(card); const rec = actionCards.get(cardKey(card)); if (rec) { set(rec.gm); set(rec.pub); }
  await syncCards(card, message);
  ChatMessage.create({ whisper: ChatMessage.getWhisperRecipients('GM').map(u => u.id), content: `<b>${esc(card.action)}</b> — ${esc(txt)}` });
}
async function reopenAll(card, message) {
  const set = (c) => { if (c) c.applied = false; };
  set(card); const rec = actionCards.get(cardKey(card)); if (rec) { set(rec.gm); set(rec.pub); }
  await syncCards(card, message);
}
async function revealDamage(card, message) {
  card.revealed = true;
  const rec = actionCards.get(cardKey(card));
  if (rec) { if (rec.gm) rec.gm.revealed = true; if (rec.pub) rec.pub.revealed = true; }
  await syncCards(card, message);
}
async function promptSaves() { const t = applyTargetsList(); if (!t.length) { ui.notifications.warn('DDB: target/select token(s).'); return; } const buttons = Object.entries(CONFIG.DND5E?.abilities ?? {}).map(([k, c]) => ({ action: k, label: c.label ?? k.toUpperCase(), callback: () => k })); let ability; try { ability = await foundry.applications.api.DialogV2.wait({ window: { title: 'Saving Throw' }, content: '<p>Which save?</p>', buttons }); } catch (e) { return; } for (const a of t) { try { (a.rollSavingThrow ? a.rollSavingThrow({ ability }) : a.rollAbilitySave?.(ability)); } catch (e) { console.error(e); } } }
async function promptCondition() { const t = applyTargetsList(); if (!t.length) { ui.notifications.warn('DDB: target/select token(s).'); return; } const opts = (CONFIG.statusEffects ?? []).filter(e => e.id).map(e => `<option value="${e.id}">${game.i18n.localize(e.name ?? e.label ?? e.id)}</option>`).join(''); let chosen; try { chosen = await foundry.applications.api.DialogV2.wait({ window: { title: 'Toggle Condition' }, content: `<select name="cond" style="width:100%;">${opts}</select>`, buttons: [{ action: 'ok', label: 'Toggle', default: true, callback: (e, b) => b.form.elements.cond.value }, { action: 'cancel', label: 'Cancel', callback: () => null }] }); } catch (e) { return; } if (!chosen) return; for (const a of t) { try { await a.toggleStatusEffect?.(chosen); } catch (e) { console.error(e); } } }
function listReactions() { const t = applyTargetsList(); if (!t.length) { ui.notifications.warn('DDB: target/select token(s).'); return; } const blocks = t.map(a => { const r = actorReactions(a); return `<div style="margin-top:4px;"><b>${esc(a.name)}</b>: ${r.length ? esc(r.join(', ')) : '<em>none</em>'}</div>`; }).join(''); ChatMessage.create({ content: `<div><i class="fas ${IC.react}"></i> <b>Reactions</b>${blocks}</div>` }); }
function onAction(action, card, message, ds) {
  if (!game.user?.isGM) { ui.notifications.warn('DDB: only the GM can apply card actions.'); return; }
  switch (action) {
    case 'mult': return applyMult(card, Number(ds.mult), message);
    case 'reopen': return reopenDamage(card, message);
    case 'verdict': return setVerdict(card, ds.v, message);
    case 'reverdict': return setVerdict(card, null, message);
    case 'markhit': return markHit(card, ds.tname, ds.v, message);
    case 'confirmhits': return confirmHits(card, message);
    case 'reopenhits': return reopenHits(card, message);
    case 'genverdict': return setGenVerdict(card, ds.v, message);
    case 'regen': return setGenVerdict(card, null, message);
    case 'mark': return markSave(card, ds.tname, ds.v, message);
    case 'rollsave': return rollSave(card, ds.tname, message);
    case 'rollallsaves': return rollAllSaves(card, message);
    case 'tmult': return setTargetMult(card, ds.tname, Number(ds.mult), message);
    case 'delcond': return setTargetCondition(card, ds.tname, ds.cid, false, message);
    case 'applyall': return applyAll(card, message);
    case 'reopenall': return reopenAll(card, message);
    case 'reveal': return revealDamage(card, message);
    case 'save': return promptSaves();
    case 'condition': return promptCondition();
    case 'reactions': return listReactions();
  }
}

/* ------------------------------------------------------------- socket tap */
function onRaw(ev) {
  let msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
  if (typeof msg?.eventType !== 'string' || !msg.eventType.startsWith('dice/roll')) return;
  const data = msg.data || msg; const rollId = data.rollId || msg.id;
  if (!rollId || seen.has(rollId)) return; seen.set(rollId, Date.now());
  if (!data.rolls?.length) return;
  renderRoll(data).catch(e => console.error('DDB Roll Cards | render error', e));
}
function attachTap() { const ws = game.DDBSync?.websocketManager?.websocket?.ws; if (ws && !ws.__ddbxTapped) { ws.__ddbxTapped = true; ws.addEventListener('message', onRaw); console.log('DDB Roll Cards | tapped ddb-sync socket'); } }
// ddb-sync's own dice routing fires item.use() on attacks (the advantage/disadvantage dialog) and posts
// plain native roll cards. We tap the raw socket independently and render everything ourselves, so its
// routing is pure noise. Nulling diceRollMessageHandler.diceRollHandler trips its `if (this.diceRollHandler ...)`
// guard and disables all of it — without touching the WebSocket we rely on.
function muteDdbSyncRendering() {
  try {
    if (!game.settings.get(NS, 'takeover')) return;
    const h = game.DDBSync?.diceRollMessageHandler;
    if (h && h.diceRollHandler) { h.__ddbxSavedDRH = h.diceRollHandler; h.diceRollHandler = null; console.log('DDB Roll Cards | suppressed ddb-sync native roll rendering (takeover on)'); }
  } catch (e) { console.warn('DDB Roll Cards | could not suppress ddb-sync rendering', e); }
}

/* ---------------------------------------------------- standalone DDB connection */
// Vendored from ddb-sync (MIT, AshDarkley): mint an stt token via ddb-proxy from the CobaltSession cookie,
// then open the DDB game-log WebSocket. The token expires (~5 min) and DDB recycles the serverless socket, so
// reconnect re-mints. We only consume dice rolls — everything else is rendered by our own card pipeline.
let ddbSocket = null;
class DdbSocket {
  constructor(cfg) { this.cfg = cfg; this.ws = null; this.token = null; this.attempts = 0; this.max = 10; this.delay = 500; this.closed = false; }
  async mintToken() {
    try {
      const r = await fetch(`${this.cfg.proxyUrl}/proxy/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cobalt: this.cfg.cobaltCookie }) });
      if (!r.ok) { if (r.status === 401 || r.status === 403) ui.notifications.error('DDB Roll Cards: CobaltSession cookie expired or invalid — update it in settings.'); else console.error('DDB Roll Cards | token mint HTTP', r.status); return null; }
      const d = await r.json(); return d.token || null;
    } catch (e) { console.error('DDB Roll Cards | token mint failed', e); return null; }
  }
  async connect() {
    this.closed = false;
    this.token = await this.mintToken();
    if (!this.token) { ui.notifications.warn('DDB Roll Cards: could not authenticate with D&D Beyond (check cobalt cookie / proxy URL).'); return; }
    const url = `wss://game-log-api-live.dndbeyond.com/v1?gameId=${this.cfg.campaignId}&userId=${this.cfg.userId}&stt=${this.token}`;
    try { this.ws = new WebSocket(url); } catch (e) { console.error('DDB Roll Cards | ws create failed', e); this.scheduleReconnect(); return; }
    this.ws.onopen = () => { this.attempts = 0; this.send({ type: 'authenticate', data: { token: this.token, campaignId: this.cfg.campaignId } }); console.log('DDB Roll Cards | own DDB socket connected'); };
    this.ws.onmessage = (e) => this.onMsg(e);
    this.ws.onerror = (e) => console.error('DDB Roll Cards | ws error', e);
    this.ws.onclose = (e) => { if (!this.closed && e.code !== 1000) this.scheduleReconnect(); };
  }
  onMsg(e) {
    let m; try { m = JSON.parse(e.data); } catch (x) { return; }
    if (m?.eventType === 'authenticated') { this.send({ type: 'subscribe', data: { event: 'character.update', campaignId: this.cfg.campaignId } }); return; }
    onRaw(e); // dice rolls → our renderer (ignores everything non-dice)
  }
  send(d) { if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(typeof d === 'string' ? d : JSON.stringify(d)); }
  scheduleReconnect() { if (this.attempts >= this.max) { console.error('DDB Roll Cards | max reconnect attempts'); return; } this.attempts++; setTimeout(() => { if (!this.closed) this.connect(); }, this.delay * this.attempts); }
  disconnect() { this.closed = true; if (this.ws) { try { this.ws.close(1000, 'manual'); } catch (e) {} this.ws = null; } }
}
function startOwnSocket() {
  if (!game.settings.get(NS, 'enabled')) { console.log('DDB Roll Cards | connection disabled in settings'); return; }
  const cfg = { cobaltCookie: game.settings.get(NS, 'cobaltCookie'), proxyUrl: (game.settings.get(NS, 'proxyUrl') || '').replace(/\/+$/, ''), campaignId: game.settings.get(NS, 'campaignId'), userId: game.settings.get(NS, 'userId') };
  if (!cfg.cobaltCookie || !cfg.proxyUrl || !cfg.campaignId || !cfg.userId) { ui.notifications.warn('DDB Roll Cards: connection not configured (cobalt cookie, proxy URL, campaign ID, user ID).'); return; }
  ddbSocket?.disconnect();
  ddbSocket = new DdbSocket(cfg);
  ddbSocket.connect();
}
// Copy connection settings out of ddb-sync (only possible while it's still installed/registered) so the user
// can disable/remove ddb-sync without re-entering anything.
function migrateFromSync() {
  try {
    if (!game.settings.settings.has(`${SYNC}.cobaltCookie`)) return;
    if (game.settings.get(NS, 'cobaltCookie')) return; // already migrated / configured
    const get = (k) => { try { return game.settings.get(SYNC, k); } catch (e) { return undefined; } };
    const pairs = { cobaltCookie: 'cobaltCookie', proxyUrl: 'proxyUrl', campaignId: 'campaignId', userId: 'userId', characterMapping: 'characterMapping' };
    let any = false;
    for (const [ours, theirs] of Object.entries(pairs)) { const v = get(theirs); if (v !== undefined && v !== '' && !(ours === 'characterMapping' && (!v || !Object.keys(v).length))) { game.settings.set(NS, ours, v); any = true; } }
    if (any) console.log('DDB Roll Cards | migrated connection settings from ddb-sync');
  } catch (e) { console.warn('DDB Roll Cards | migrate failed', e); }
}
function reconnect() { ddbSocket?.disconnect(); startOwnSocket(); }
// Fetch the player characters in the configured campaign from D&D Beyond (via the proxy's /proxy/campaigns).
async function fetchCampaignCharacters() {
  const proxyUrl = (game.settings.get(NS, 'proxyUrl') || '').replace(/\/+$/, '');
  const cobalt = game.settings.get(NS, 'cobaltCookie');
  const campaignId = String(game.settings.get(NS, 'campaignId') || '');
  if (!proxyUrl || !cobalt) { ui.notifications.warn('DDB Roll Cards: set Proxy URL and CobaltSession cookie first.'); return []; }
  try {
    const r = await fetch(`${proxyUrl}/proxy/campaigns`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cobalt }) });
    const j = await r.json();
    if (!j.success) { ui.notifications.error('DDB Roll Cards: ' + (j.message || 'campaign fetch failed')); return []; }
    const camps = j.data || [];
    const camp = camps.find(c => String(c.id) === campaignId);
    if (!camp) { ui.notifications.warn(`DDB Roll Cards: campaign ${campaignId} not found in your DDB campaigns.`); return []; }
    const chars = (camp.characters || []).map(c => ({ id: String(c.characterId ?? c.id ?? ''), name: c.characterName || c.name || '(unnamed)' })).filter(c => c.id);
    if (!chars.length) ui.notifications.warn('DDB Roll Cards: no characters listed for this campaign.');
    return chars;
  } catch (e) { console.error('DDB Roll Cards | campaign fetch', e); ui.notifications.error('DDB Roll Cards: campaign fetch error (see console).'); return []; }
}
function pcActorByName(name) { const n = String(name || '').toLowerCase().trim(); return game.actors.find(a => a.type === 'character' && a.name.toLowerCase().trim() === n)?.id || ''; }
// Mapping editor: lists the campaign's DDB players (fetched) against a dropdown of Foundry player-character actors.
class MappingApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = { id: 'ddbx-mapping', tag: 'div', window: { title: 'DDB Roll Cards — Character Mapping', icon: 'fas fa-people-arrows' }, position: { width: 580, height: 'auto' } };
  constructor(opts) { super(opts); this.rows = null; }
  _seed() { if (this.rows) return; this.rows = Object.entries(getMapping()).map(([ddb, actorId]) => ({ ddb, name: game.actors.get(actorId)?.name || '', actorId })); }
  _actorOptions(sel) { const pcs = game.actors.filter(a => a.type === 'character').sort((a, b) => a.name.localeCompare(b.name)); return `<option value="">— select actor —</option>` + pcs.map(a => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${esc(a.name)}</option>`).join(''); }
  async _renderHTML() {
    this._seed();
    const rows = this.rows.map((r, i) => `<tr data-i="${i}">
      <td><input class="r-ddb" value="${esc(r.ddb || '')}" placeholder="DDB id" style="width:120px"></td>
      <td class="r-name" style="font-size:11px;opacity:.8">${esc(r.name || '')}</td>
      <td><select class="r-actor" style="width:100%">${this._actorOptions(r.actorId)}</select></td>
      <td style="text-align:center"><a class="r-del" title="Remove"><i class="fas fa-trash"></i></a></td></tr>`).join('');
    return `<div style="padding:8px 10px">
      <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap">
        <button type="button" class="m-fetch"><i class="fas fa-cloud-arrow-down"></i> Fetch players from D&D Beyond</button>
        <button type="button" class="m-add"><i class="fas fa-plus"></i> Add row</button>
      </div>
      <table style="width:100%"><thead><tr><th style="text-align:left">DDB ID</th><th style="text-align:left">DDB name</th><th style="text-align:left">Foundry actor</th><th></th></tr></thead><tbody class="m-body">${rows || ''}</tbody></table>
      <p style="font-size:11px;opacity:.65;margin:6px 0">Fetch pulls your campaign's players (by Campaign ID) and auto-matches by name. Adjust dropdowns, then Save. Rolls also resolve by name automatically — mapping is only needed when names differ.</p>
      <div style="display:flex;justify-content:flex-end;gap:6px;margin-top:6px">
        <button type="button" class="m-cancel">Cancel</button>
        <button type="button" class="m-save"><i class="fas fa-check"></i> Save</button></div></div>`;
  }
  async _replaceHTML(result, content) { content.innerHTML = result; this._wire(content); }
  _collect(root) { const body = root.querySelector('.m-body'); if (!body) return; this.rows = Array.from(body.querySelectorAll('tr')).map(tr => ({ ddb: tr.querySelector('.r-ddb')?.value.trim() || '', name: tr.querySelector('.r-name')?.textContent || '', actorId: tr.querySelector('.r-actor')?.value || '' })); }
  _wire(root) {
    root.querySelector('.m-fetch')?.addEventListener('click', async () => {
      this._collect(root); ui.notifications.info('DDB Roll Cards: fetching campaign players…');
      const chars = await fetchCampaignCharacters();
      for (const c of chars) { const ex = this.rows.find(r => r.ddb === c.id); if (ex) ex.name = c.name; else this.rows.push({ ddb: c.id, name: c.name, actorId: pcActorByName(c.name) }); }
      this.render();
    });
    root.querySelector('.m-add')?.addEventListener('click', () => { this._collect(root); this.rows.push({ ddb: '', name: '', actorId: '' }); this.render(); });
    root.querySelectorAll('.r-del').forEach(a => a.addEventListener('click', (e) => { this._collect(root); const i = Number(e.currentTarget.closest('tr')?.dataset.i); if (!Number.isNaN(i)) this.rows.splice(i, 1); this.render(); }));
    root.querySelector('.m-cancel')?.addEventListener('click', () => this.close());
    root.querySelector('.m-save')?.addEventListener('click', async () => {
      this._collect(root); const out = {}; for (const r of this.rows) if (r.ddb && r.actorId) out[r.ddb] = r.actorId;
      await game.settings.set(NS, 'characterMapping', out); ui.notifications.info(`DDB Roll Cards: saved ${Object.keys(out).length} mapping(s).`); this.close();
    });
  }
}
function editMapping() { new MappingApp().render(true); }

/* --------------------------------------------------------------- bootstrap */
Hooks.once('init', () => {
  // --- Standalone connection (no ddb-sync needed). Values auto-migrate from ddb-sync if it's installed. ---
  game.settings.register(NS, 'enabled', { name: 'Connect to D&D Beyond', hint: 'When ddb-sync is NOT installed, DDB Roll Cards opens its own connection to the D&D Beyond game log.', scope: 'world', config: true, type: Boolean, default: true });
  game.settings.register(NS, 'cobaltCookie', { name: 'CobaltSession cookie', hint: 'Your dndbeyond.com CobaltSession cookie value (DevTools → Application → Cookies).', scope: 'world', config: true, type: String, default: '' });
  game.settings.register(NS, 'proxyUrl', { name: 'Proxy URL', hint: 'ddb-proxy base URL, e.g. https://your-proxy.onrender.com (no trailing slash).', scope: 'world', config: true, type: String, default: '' });
  game.settings.register(NS, 'campaignId', { name: 'Campaign (game) ID', hint: 'D&D Beyond campaign/game ID.', scope: 'world', config: true, type: String, default: '' });
  game.settings.register(NS, 'userId', { name: 'D&D Beyond user ID', hint: 'Your D&D Beyond user ID.', scope: 'world', config: true, type: String, default: '' });
  game.settings.register(NS, 'characterMapping', { scope: 'world', config: false, type: Object, default: {} });
  game.settings.register(NS, 'takeover', { name: 'Take over DDB rendering (when ddb-sync is installed)', hint: "Suppresses ddb-sync's own native roll cards and its item.use() attack prompt (the advantage/disadvantage dialog). Ignored once ddb-sync is removed.", scope: 'world', config: true, type: Boolean, default: true });
  game.settings.register(NS, 'debug', { name: 'Debug: log all incoming chat messages', hint: 'Logs every chat message (type, flags, flavor) to the console so we can identify and suppress stray native cards.', scope: 'client', config: true, type: Boolean, default: false });
  try {
    class DdbxMappingMenu extends foundry.applications.api.ApplicationV2 { async render() { editMapping(); return this; } }
    game.settings.registerMenu(NS, 'mappingMenu', { name: 'Character Mapping', label: 'Edit Character Mapping', hint: 'Map D&D Beyond characters to Foundry actors (only needed when names differ).', icon: 'fas fa-people-arrows', type: DdbxMappingMenu, restricted: true });
  } catch (e) { console.warn('DDB Roll Cards | mapping menu register failed (use DDBRollCards.editMapping())', e); }
});
Hooks.once('ready', () => {
  if (!game.user.isGM) return;
  injectStyles();
  window.DDBRollCards = { reconnect, startOwnSocket, editMapping };
  const syncActive = !!game.modules.get(SYNC)?.active;
  if (syncActive) {
    // ddb-sync is still installed: ride its socket and suppress its rendering. Migrate its settings so the
    // user can disable ddb-sync whenever they want and we seamlessly switch to our own connection.
    migrateFromSync();
    attachTap(); muteDdbSyncRendering();
    try { game.DDBSync?.websocketManager?.addEventListener?.('connected', () => setTimeout(() => { attachTap(); muteDdbSyncRendering(); }, 100)); } catch (e) {}
    setInterval(() => { attachTap(); muteDdbSyncRendering(); const sc = Date.now() - 60000, rc = Date.now() - 3600000; for (const [k, t] of seen) if (t < sc) seen.delete(k); for (const [k, r] of actionCards) if (r.ts < rc) actionCards.delete(k); }, 4000);
  } else {
    // Standalone: we own the connection.
    startOwnSocket();
    setInterval(() => { const sc = Date.now() - 60000, rc = Date.now() - 3600000; for (const [k, t] of seen) if (t < sc) seen.delete(k); for (const [k, r] of actionCards) if (r.ts < rc) actionCards.delete(k); }, 4000);
  }
  // Replace native local dnd5e roll cards (GM-authored — monsters etc.) with ours.
  Hooks.on('preCreateChatMessage', (message) => {
    try {
      if (!game.user.isGM) return;
      if (game.settings.get(NS, 'debug')) {
        const f0 = message.flags || {};
        console.log('[ddbx debug] preCreate', { dnd5eType: f0.dnd5e?.messageType, rollType: f0.dnd5e?.roll?.type, flavor: message.flavor, rolls: message.rolls?.length, flagKeys: Object.keys(f0), dnd5e: f0.dnd5e });
      }
      const f = message.flags?.dnd5e; if (!f || f.messageType !== 'roll' || !message.rolls?.length) return; renderLocalMessage(message); return false;
    } catch (e) { console.error('DDB Roll Cards | intercept error', e); }
  });
  Hooks.on('renderChatMessageHTML', (message, el) => {
    let card; try { card = message.getFlag(NS, 'card'); } catch (e) { return; } if (!card) return;
    const root = (el instanceof HTMLElement) ? el : el?.[0]; if (!root) return;
    root.querySelectorAll('[data-ddbx]').forEach(b => b.addEventListener('click', e => {
      e.preventDefault();
      if (b.dataset.ddbx === 'mode') { applyMode = b.dataset.mode; root.querySelectorAll('[data-ddbx="mode"]').forEach(x => x.classList.toggle('active', x.dataset.mode === applyMode)); return; }
      if (b.dataset.ddbx === 'dtype') {
        if (!game.user.isGM || !card.dmg?.parts?.length) return;
        const cur = card.dmg.parts[0]?.type;
        const types = CONFIG.DND5E?.damageTypes ?? {};
        const sel = document.createElement('select'); sel.className = 'ddbx2-dsel';
        for (const [k, v] of Object.entries(types)) { const o = document.createElement('option'); o.value = k; o.textContent = v?.label ?? k; if (k === cur) o.selected = true; sel.appendChild(o); }
        b.replaceWith(sel); sel.focus();
        sel.addEventListener('change', () => changeDtype(card, sel.value, message));
        return;
      }
      if (b.dataset.ddbx === 'addcond') {
        if (!game.user.isGM) return;
        const effs = (CONFIG.statusEffects || []).filter(x => x.id);
        const sel = document.createElement('select'); sel.className = 'ddbx2-dsel';
        sel.appendChild(Object.assign(document.createElement('option'), { value: '', textContent: '+ condition' }));
        for (const e of effs) { const o = document.createElement('option'); o.value = e.id; o.textContent = game.i18n.localize(e.name ?? e.label ?? e.id); sel.appendChild(o); }
        b.replaceWith(sel); sel.focus();
        sel.addEventListener('change', () => { if (sel.value) setTargetCondition(card, b.dataset.tname, sel.value, true, message); });
        return;
      }
      onAction(b.dataset.ddbx, card, message, b.dataset);
    }));
  });
  console.log(`DDB Roll Cards | ready (v4.3) — ${game.modules.get(SYNC)?.active ? 'riding ddb-sync socket' : 'standalone connection'}`);
});
