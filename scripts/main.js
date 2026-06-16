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
.ddbx2 .ddbx2-dsel-live{flex:1 1 auto;min-width:0;font-size:11px;background:#222;color:#f3cdbc;border:1px solid rgba(224,138,106,.5);border-radius:8px;padding:1px 6px;height:20px;text-transform:capitalize;}
.ddbx2 .ddbx2-sv{flex:0 0 22px;width:22px;height:22px;padding:0;margin-left:4px;border-radius:4px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.18);color:#ededed;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:11px;}
.ddbx2 .ddbx2-sv:hover{background:rgba(255,255,255,.14);}
.ddbx2 .ddbx2-sv.on.hit{box-shadow:inset 0 0 0 1px #5fd07a;color:#69d77f;}
.ddbx2 .ddbx2-sv.on.miss{box-shadow:inset 0 0 0 1px #ff6b6b;color:#ff7b7b;}
.ddbx2 .ddbx2-sv.on.dmg{box-shadow:inset 0 0 0 1px #e0824d;color:#f3cdbc;}
.ddbx2-srow{flex-wrap:wrap;}
.ddbx2-rrow{display:flex;gap:8px;align-items:stretch;padding:6px 0;border-top:1px solid rgba(255,255,255,.06);}
.ddbx2-rrow:first-of-type{border-top:none;}
.ddbx2-ravatar{flex:0 0 42px;width:42px;height:42px;border-radius:6px;object-fit:cover;border:1px solid rgba(0,0,0,.5);align-self:center;}
.ddbx2-rmain{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:5px;}
.ddbx2-rtop{display:flex;align-items:center;gap:7px;}
.ddbx2-rbot{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}
.ddbx2-grp{display:inline-flex;gap:3px;margin-left:auto;}
.ddbx2-portion{display:inline-flex;gap:3px;}
.ddbx2-conds{display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap;margin-left:auto;}
.ddbx2 .ddbx2-cond{display:inline-flex;align-items:center;gap:3px;font-size:9px;line-height:16px;padding:0 6px;border-radius:8px;background:rgba(224,138,106,.22);border:1px solid rgba(224,138,106,.5);color:#f3cdbc;cursor:pointer;}
.ddbx2 .ddbx2-cond:hover{background:rgba(224,138,106,.4);}
.ddbx2-foot{justify-content:flex-start;}
.ddbx2 .ddbx2-foot button.ddbx2-icn{flex:0 0 34px;width:34px;}
.ddbx2-pc-title{font-size:16px;font-weight:900;letter-spacing:.02em;margin-bottom:6px;color:#fff;}
.ddbx2-pc-cond{display:block;font-size:10px;opacity:.85;color:#f3cdbc;width:100%;margin-top:2px;}
.ddbx2-pc{position:relative;overflow:hidden;border-radius:8px;background:#17181c;background-image:radial-gradient(circle at 50% -20%, var(--accent,rgba(160,27,27,.28)), transparent 72%);padding:12px 10px;text-align:center;color:#eee;}
.ddbx2-pc-wm{position:absolute;inset:0;opacity:.16;pointer-events:none;}
.ddbx2-pc-body{position:relative;z-index:1;}
@keyframes ddbx2-pop{0%{transform:scale(.55);opacity:0;}55%{transform:scale(1.18);opacity:1;}100%{transform:scale(1);}}
@keyframes ddbx2-glow{0%{filter:drop-shadow(0 0 0 currentColor);}30%{filter:drop-shadow(0 0 6px currentColor);}100%{filter:drop-shadow(0 0 0 transparent);}}
.ddbx2-pc-badge{font-size:13px;font-weight:bold;letter-spacing:.1em;display:inline-block;animation:ddbx2-pop .45s cubic-bezier(.2,1.4,.5,1), ddbx2-glow .9s ease-out;}
.ddbx2-pc-badge.hit{color:#5fd07a;text-shadow:0 0 5px rgba(95,208,122,.35);} .ddbx2-pc-badge.miss{color:#ff6b6b;text-shadow:0 0 5px rgba(255,107,107,.35);}
.ddbx2-pc-hero.heal{color:#5fd07a;}
.ddbx2-est{font-size:11px;color:#cdb7e8;margin-left:6px;white-space:nowrap;}
.ddbx2-rk{font-size:9px;padding:0 4px;border-radius:6px;text-transform:uppercase;}
.ddbx2-rk.res{background:rgba(127,178,255,.22);color:#bcd6ff;} .ddbx2-rk.vul{background:rgba(255,107,107,.22);color:#ffb3b3;} .ddbx2-rk.imm{background:rgba(160,160,160,.22);color:#ddd;}
.ddbx2-pc-hero{font-size:46px;font-weight:900;line-height:1.05;margin:1px 0 2px;color:#f6f6f6;animation:ddbx2-pop .4s ease-out;}
.ddbx2-pc-hero.atk{color:#7fb2ff;} .ddbx2-pc-hero.dmg{color:#f0a878;} .ddbx2-pc-hero.gen{color:#9fc2ff;}
.ddbx2-pc-hero.good{color:#5fd07a;} .ddbx2-pc-hero.bad{color:#ff6b6b;}
.ddbx2-pc-hero.crit{color:#5fd07a;text-shadow:0 0 12px rgba(95,208,122,.6);}
.ddbx2-pc-hero.fumble{color:#ff6b6b;text-shadow:0 0 12px rgba(255,107,107,.6);}
.ddbx2-pc-heroL{font-size:12px;font-weight:bold;letter-spacing:.1em;text-transform:uppercase;color:#cfcfcf;}
.ddbx2-pc-bd{font-size:11px;color:#9a9a9a;margin-top:3px;}
.ddbx2-pc-mini{font-size:11px;color:#8a8a8a;margin-top:5px;}
.ddbx2-pc-gate{font-size:20px;font-weight:900;letter-spacing:.04em;color:#f3cdbc;margin:6px 0;}
.ddbx2-pc-sub{font-size:10px;opacity:.5;margin-top:6px;color:#cfcfcf;}
.ddbx2-pc-tgts{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-top:7px;}
.ddbx2-pc-tgt{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:bold;background:rgba(0,0,0,.4);padding:2px 9px 2px 2px;border-radius:13px;}
.ddbx2-pc-tgt img{width:20px;height:20px;border-radius:50%;object-fit:cover;}
.ddbx2-pc-tgt .ddbx2-hit{color:#69d77f;} .ddbx2-pc-tgt .ddbx2-miss{color:#ff7b7b;}
.ddbx-sting{position:fixed;inset:0;z-index:99990;pointer-events:none;overflow:hidden;font-family:'Modesto Condensed','Signika',serif;animation:ddbx-st-fade var(--dur,3500ms) ease forwards;}
@keyframes ddbx-st-fade{0%{opacity:0;}6%{opacity:1;}85%{opacity:1;}100%{opacity:0;}}
.ddbx-bg{position:absolute;inset:0;background-size:cover;background-position:center;filter:blur(42px) saturate(1.25) brightness(.65);opacity:.42;animation:ddbx-st-zoom var(--dur,3500ms) ease-out forwards;}
@keyframes ddbx-st-zoom{0%{transform:scale(1.32);}100%{transform:scale(1.06);}}
.ddbx-vig{position:absolute;inset:0;background:radial-gradient(ellipse 62% 58% at 50% 50%, color-mix(in srgb, var(--c2) 28%, transparent), rgba(2,2,4,.93) 74%);}
.ddbx-lb{position:absolute;left:0;right:0;height:11vh;background:#000;opacity:0;animation:ddbx-lb var(--dur,3500ms) ease forwards;}
.ddbx-lb.top{top:0;} .ddbx-lb.bot{bottom:0;}
@keyframes ddbx-lb{0%{opacity:0;transform:scaleY(0);}10%{opacity:1;transform:scaleY(1);}88%{opacity:1;}100%{opacity:0;}}
.ddbx-streak{position:absolute;left:0;right:0;top:50%;height:2px;transform:translateY(-50%) rotate(-4deg);background:linear-gradient(90deg,transparent,var(--c1),transparent);box-shadow:0 0 22px var(--c1);opacity:0;animation:ddbx-streak var(--dur,3500ms) ease-out forwards;}
@keyframes ddbx-streak{0%{opacity:0;transform:translateY(-50%) rotate(-4deg) scaleX(.2);}12%{opacity:.95;}30%{transform:translateY(-50%) rotate(-4deg) scaleX(1);}80%{opacity:.4;}100%{opacity:0;}}
.ddbx-radial{position:absolute;left:50%;top:50%;width:80vh;height:80vh;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(circle, color-mix(in srgb, var(--c1) 22%, transparent), transparent 60%);opacity:0;animation:ddbx-rad var(--dur,3500ms) ease forwards;}
@keyframes ddbx-rad{0%{opacity:0;}12%{opacity:1;}85%{opacity:.8;}100%{opacity:0;}}
.ddbx-stage{position:absolute;inset:0;animation:ddbx-rise .7s cubic-bezier(.15,1.2,.4,1);}
@keyframes ddbx-rise{0%{opacity:0;transform:scale(.96);}100%{opacity:1;transform:scale(1);}}
.ddbx-casterwrap{position:absolute;text-align:center;}
.ddbx-caster{display:inline-block;border-radius:50%;background-size:cover;background-position:center;box-shadow:0 0 0 3px var(--c1),0 0 0 9px rgba(0,0,0,.6),0 0 52px var(--c2);animation:ddbx-portin .8s cubic-bezier(.15,1.3,.4,1);}
@keyframes ddbx-portin{0%{opacity:0;transform:scale(.7);}100%{opacity:1;transform:scale(1);}}
.ddbx-cname{display:block;margin-top:12px;font-size:24px;font-weight:bold;letter-spacing:.2em;text-transform:uppercase;color:#fff;text-shadow:0 2px 10px #000,0 0 16px #000;animation:ddbx-textin .8s ease-out .1s both;}
.ddbx-center{position:absolute;text-align:center;}
.ddbx-emblem{width:96px;height:96px;margin:16px auto 0;border-radius:14px;background-size:cover;background-position:center;box-shadow:0 0 0 2px var(--c1),0 0 30px var(--c2);animation:ddbx-portin .7s cubic-bezier(.15,1.3,.4,1) .08s both;}
.ddbx-title{font-size:72px;font-weight:900;line-height:1;letter-spacing:.03em;text-transform:uppercase;background:linear-gradient(180deg,#fff 35%,var(--c1));-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 3px 20px var(--c2));animation:ddbx-textin .7s ease-out;}
@keyframes ddbx-textin{0%{opacity:0;transform:translateY(16px);letter-spacing:.2em;}100%{opacity:1;transform:translateY(0);letter-spacing:.03em;}}
.ddbx-result{position:relative;font-size:112px;font-weight:900;line-height:1;letter-spacing:.04em;text-transform:uppercase;background:linear-gradient(180deg,#fff 30%,var(--c1));-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 4px 30px var(--c1));animation:ddbx-punch .65s cubic-bezier(.2,1.5,.4,1);}
@keyframes ddbx-punch{0%{opacity:0;transform:scale(1.6);letter-spacing:.5em;}55%{opacity:1;}100%{transform:scale(1);letter-spacing:.04em;}}
.ddbx-rsub{font-size:20px;letter-spacing:.28em;text-transform:uppercase;color:#dcdcdc;margin-top:16px;animation:ddbx-textin .7s ease-out .12s both;}
.ddbx-sting.crit .ddbx-result{animation:ddbx-punch .65s cubic-bezier(.2,1.5,.4,1),ddbx-critpulse 1.1s ease-in-out .35s 2;}
@keyframes ddbx-critpulse{0%,100%{filter:drop-shadow(0 0 20px var(--c1));}50%{filter:drop-shadow(0 0 48px var(--c1)) drop-shadow(0 0 18px #fff);}}
.ddbx-burst{position:absolute;left:50%;top:50%;width:380px;height:380px;margin:-190px 0 0 -190px;border-radius:50%;background:radial-gradient(circle,var(--c1),transparent 62%);opacity:0;animation:ddbx-burst .9s ease-out forwards;}
@keyframes ddbx-burst{0%{opacity:0;transform:scale(.3);}25%{opacity:.55;}100%{opacity:0;transform:scale(1.8);}}
.ddbx-tgrp{position:absolute;display:flex;gap:20px;justify-content:center;align-items:center;}
.ddbx-tg{position:relative;border-radius:50%;background-size:cover;background-position:center;animation:ddbx-portin .6s cubic-bezier(.15,1.3,.4,1) both;}
.ddbx-tg-m{position:absolute;right:-5px;bottom:-5px;font-size:20px;background:#000a;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;}
.ddbx-tg-n{position:absolute;left:50%;bottom:-28px;transform:translateX(-50%);font-size:20px;font-weight:bold;letter-spacing:.03em;color:#fff;white-space:nowrap;text-shadow:0 2px 6px #000,0 0 10px #000;}
.ddbx-pts{position:absolute;inset:0;overflow:hidden;}
.ddbx-pt{position:absolute;bottom:-12px;border-radius:50%;background:var(--c1);opacity:0;box-shadow:0 0 8px var(--c1);animation-name:ddbx-pt-rise;animation-timing-function:ease-out;animation-fill-mode:forwards;}
.ddbx-pt.spark{background:#fff;box-shadow:0 0 10px #fff,0 0 18px var(--c1);}
@keyframes ddbx-pt-rise{0%{opacity:0;transform:translate(0,0) scale(.6);}15%{opacity:.85;}100%{opacity:0;transform:translate(var(--sway,0),-70vh) scale(1.15);}}
.lay-theater .ddbx-casterwrap{left:0;right:0;top:4vh;}
.lay-theater .ddbx-caster{width:168px;height:168px;}
.lay-theater .ddbx-center{left:0;right:0;top:52%;transform:translateY(-50%);}
.lay-theater .ddbx-tgrp{left:0;right:0;bottom:8vh;flex-wrap:wrap;}
.lay-versus .ddbx-casterwrap{left:6%;top:50%;transform:translateY(-50%);max-width:26vw;}
.lay-versus .ddbx-caster{width:200px;height:200px;}
.lay-versus .ddbx-center{left:0;right:0;top:50%;transform:translateY(-50%);}
.lay-versus .ddbx-tgrp{right:5%;top:50%;transform:translateY(-50%);flex-direction:column;gap:18px;}
.lay-orbit .ddbx-casterwrap{left:50%;top:50%;transform:translate(-50%,-50%);}
.lay-orbit .ddbx-caster{width:230px;height:230px;opacity:.5;}
.lay-orbit.ph-result .ddbx-caster{opacity:.34;}
.lay-orbit .ddbx-center::before{content:'';position:absolute;left:50%;top:50%;width:140%;height:170%;transform:translate(-50%,-50%);background:radial-gradient(ellipse,rgba(0,0,0,.72),transparent 70%);z-index:-1;}
.lay-orbit.ph-declare .ddbx-center{left:0;right:0;top:12vh;}
.lay-orbit.ph-result .ddbx-center{left:0;right:0;top:50%;transform:translateY(-50%);}
.lay-orbit .ddbx-tgrp{inset:0;display:block;}
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
function ddbFormula(roll) { const n = roll?.diceNotation || {}; const parts = (n.set || []).map(s => { const vals = (s.dice || []).map(d => d.dieValue).filter(v => v != null); const note = `${s.count || 1}${s.dieType || ''}`; return vals.length ? `${note} (${vals.join(', ')})` : note; }); const c = n.constant || 0; let f = parts.join(' + '); if (c) f += `${f ? ' + ' : ''}${c}`; return f || String(roll?.result?.total ?? ''); }
// DDB dice broken out for a Dice So Nice animation that shows the exact DDB values.
function ddbDice(roll) { const n = roll?.diceNotation || {}; const sets = (n.set || []).map(s => ({ faces: parseInt(String(s.dieType || '').replace(/\D/g, '')) || 20, values: (s.dice || []).map(d => d.dieValue).filter(v => v != null) })).filter(s => s.values.length); return sets.length ? { sets, mod: n.constant || 0 } : null; }
function natFace(roll) { const v = roll?.result?.values; if (!Array.isArray(v) || !v.length) return null; if (v.includes(20)) return 20; if (v.length === 1 && v[0] === 1) return 1; return null; }
function findItem(actor, name) { if (!actor?.items || !name) return null; const n = String(name).toLowerCase().trim().replace(/[.\s]+$/, ''); return actor.items.find(i => i.name.toLowerCase().trim().replace(/[.\s]+$/, '') === n) || actor.items.find(i => { const inm = i.name.toLowerCase().trim(); return inm.includes(n) || n.includes(inm); }) || null; }
const ABIL = { str: 'strength', dex: 'dexterity', con: 'constitution', int: 'intelligence', wis: 'wisdom', cha: 'charisma' };
const ABIL_ART = 'https://assets.forge-vtt.com/66aa49fcd530ac71a9d05346/My%20Stuff/UI%20Elements/';
// Thematic hue per ability: str red, dex green, con blue, int cyan, wis yellow, cha magenta.
const ABIL_HUE = { str: 0, dex: 120, con: 215, int: 180, wis: 50, cha: 300 };
function abilityIcon(ab) { return ab && ABIL[ab] ? `${ABIL_ART}${ABIL[ab]}.webp` : ''; }
function abilityHue(ab) { return ABIL_HUE[ab] ?? null; }
// CSS filter that recolours a grayscale/B&W image to a target hue (keeps detail, unlike a flat mask).
function recolor(H, bright) { return `grayscale(1) sepia(1) saturate(4) hue-rotate(${Math.round((H || 0) - 45)}deg) brightness(${bright ?? 1})`; }
function abilityLabel(ab) { return CONFIG.DND5E?.abilities?.[ab]?.label || (ab ? ab.toUpperCase() : 'Save'); }
function abilityShort(ab) { return (CONFIG.DND5E?.abilities?.[ab]?.abbreviation || ab || 'save').toUpperCase(); }
function defaultMult(result) { return result === 'save' ? 0.5 : 1; }
function defaultHit(t, total) { return (typeof t.ac === 'number') ? (total >= t.ac ? 'hit' : 'miss') : undefined; }
// Smart default damage portion: hit/failed-save → full; saved → half or none (per the spell); miss → none.
function defaultPortion(o, onSave) { if (o === 'hit' || o === 'fail') return 1; if (o === 'save') return onSave === 'half' ? 0.5 : 0; if (o === 'miss') return 0; return 1; }
// Conditions are a best-guess only for outcomes that "land" (hit / failed save).
function defaultConds(o, card) { return (o === 'hit' || o === 'fail') ? (card.actionConds || []) : []; }
function getOutcome(card, name) { if (card.atk) { const t = (card.targets || []).find(x => x.name === name); return card.atk.verdicts?.[name] ?? (t ? defaultHit(t, card.atk.total) : undefined); } return card.save?.results?.[name]; }
function condLabel(id) { const e = (CONFIG.statusEffects || []).find(x => x.id === id); return e ? game.i18n.localize(e.name ?? e.label ?? id) : id; }
// Read a target's damage resistances / immunities / vulnerabilities (dnd5e traits).
function dmgTraits(actor) { const t = actor?.system?.traits || {}; const s = (x) => new Set(Array.from(x?.value ?? [])); return { res: s(t.dr), imm: s(t.di), vul: s(t.dv) }; }
// Estimate what a target actually takes (per-type ×0 immune / ×½ resist / ×2 vulnerable), scaled by the portion.
function targetEstimate(actor, parts, portion) {
  if (!actor || !parts?.length) return null;
  const tr = dmgTraits(actor); let eff = 0; const marks = [];
  for (const p of parts) { let m = 1; if (tr.imm.has(p.type)) { m = 0; marks.push([p.type, 'imm']); } else if (tr.vul.has(p.type)) { m = 2; marks.push([p.type, 'vul']); } else if (tr.res.has(p.type)) { m = 0.5; marks.push([p.type, 'res']); } eff += (p.amount || 0) * m; }
  return { dmg: Math.floor(eff * Math.abs(portion)), marks };
}
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
  const healAct = acts.find(a => a.type === 'heal' || a.healing);
  const parts = dmg?.damage?.parts ?? []; const types = parts[0]?.types ? Array.from(parts[0].types) : (parts[0]?.type ? [parts[0].type] : []);
  const dcVal = sv ? (sv.save?.dc?.value ?? sv.save?.dc) : null;
  // All damage-part types in order — DDB sends one same-named damage roll per type, accumulated as parts.
  const allTypes = []; for (const a of acts) for (const p of (a.damage?.parts ?? [])) { const t = p.types ? Array.from(p.types)[0] : p.type; if (t) allTypes.push(t); }
  const isHeal = !!healAct || (!allTypes.length && /\bhe(al|aling)\b|regain.*hit points/.test((item.system?.description?.value || '').toLowerCase()) && !dmg);
  const desc = (item.system?.description?.value || '').toLowerCase();
  // On a successful save, does it deal half or no damage? Prefer the activity field, fall back to the text.
  const onSaveRaw = sv?.damage?.onSave ?? sv?.onSave ?? sv?.save?.onSave;
  const saveOnSave = (onSaveRaw === 'half' || /half (as much )?damage|half the damage|half damage/.test(desc)) ? 'half' : 'none';
  return { damageType: types[0] || '', damageTypes: allTypes.length ? allTypes : (types[0] ? [types[0]] : []), isHeal, itemType: item.type, actionType: (dmg || acts[0])?.actionType || '', saveDC: (typeof dcVal === 'number') ? dcVal : null, saveAbility: firstOf(sv?.save?.ability) || null, saveOnSave, actionConds: itemConditions(item, desc), img: item.img || '' };
}
// Best-guess conditions an action applies: from its ActiveEffect statuses, then a scan of the description text.
function itemConditions(item, desc) {
  const out = new Set();
  for (const e of (item.effects ?? [])) for (const s of (e.statuses ?? [])) out.add(s);
  const d = desc || (item.system?.description?.value || '').toLowerCase();
  for (const eff of (CONFIG.statusEffects || [])) { if (!eff.id) continue; const lbl = game.i18n.localize(eff.name ?? eff.label ?? eff.id).toLowerCase(); if (lbl.length > 3 && d.includes(lbl)) out.add(eff.id); }
  return Array.from(out);
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
  const m = (tg.mult ?? defaultPortion(outcome, card.save?.onSave));
  const pbtn = (val, lbl, ti) => `<button class="ddbx2-sv ${m === val ? 'on dmg' : ''}" data-ddbx="tmult" data-tname="${esc(t.name)}" data-mult="${val}" title="${ti}">${lbl}</button>`;
  const effConds = tg.conditions ?? defaultConds(outcome, card);
  const conds = effConds.map(id => `<span class="ddbx2-cond" data-ddbx="delcond" data-tname="${esc(t.name)}" data-cid="${esc(id)}" title="Remove">${esc(condLabel(id))} <i class="fas ${IC.miss}"></i></span>`).join('');
  // GM estimate of damage this target actually takes after its resistances/vulnerabilities.
  const est = card.dmg ? targetEstimate(actorByName(t.name), card.dmg.parts, m) : null;
  const estHtml = est ? `<span class="ddbx2-est" title="estimated after resistances">&asymp;${est.dmg}${est.marks.map(([ty, k]) => ` <span class="ddbx2-rk ${k}" title="${ty} ${k === 'imm' ? 'immune' : k === 'vul' ? 'vulnerable' : 'resistant'}">${esc(ty).slice(0, 4)}</span>`).join('')}</span>` : '';
  // Token art is a square the height of both lines, on the left.
  return `<div class="ddbx2-rrow"><img class="ddbx2-ravatar" src="${t.img}"><div class="ddbx2-rmain">`
    + `<div class="ddbx2-rtop"><span class="ddbx2-tname">${esc(t.name)}</span>`
    + (isAtk ? `<span class="ddbx2-stat">AC ${t.ac ?? '?'}</span>` : '')
    + `<span class="ddbx2-grp">${toggles}</span></div>`
    + `<div class="ddbx2-rbot"><span class="ddbx2-portion">${pbtn(0, '0', 'No damage')}${pbtn(0.5, '&frac12;', 'Half')}${pbtn(1, '1', 'Full')}${pbtn(2, '&times;2', 'Double')}</span>${estHtml}`
    + `<span class="ddbx2-conds">${conds}<button class="ddbx2-sv" data-ddbx="addcond" data-tname="${esc(t.name)}" title="Add condition"><i class="fas ${IC.cond}"></i></button></span></div></div></div>`;
}
function buildCard(card) {
  const targets = card.targets || [];
  const hasT = targets.length;
  const resolve = card.dmg && hasT && (card.atk || card.save); // unified per-target panel
  const dtypeTag = () => {
    const parts = card.dmg?.parts || [];
    if (parts.length > 1) return `<span class="ddbx2-tag">${esc(dmgTypeLabel(card.dmg))}</span>`;
    const cur = parts[0]?.type || '';
    const types = CONFIG.DND5E?.damageTypes ?? {};
    const opts = `<option value="">— type —</option>` + Object.entries(types).map(([k, v]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${esc(v?.label ?? k)}</option>`).join('');
    return `<select class="ddbx2-dsel-live" data-ddbx-dtype title="Damage type">${opts}</select>`;
  };
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
  // --- Damage / Healing (+ unified resolve panel) ---
  let dmgSec = '';
  if (card.dmg) {
    const total = dmgTotal(card.dmg);
    const gate = card.save ? `DC ${card.save.dc} ${esc(abilityShort(card.save.ability))} Save · ` : '';
    const word = card.heal ? 'Healing' : 'Damage';
    const ic = card.heal ? IC.hp : card.save ? IC.save : IC.dmg;
    const lbl = `<div class="ddbx2-lbl"><i class="fas ${ic}"></i> ${gate}${word} ${card.heal ? '' : dtypeTag()}</div>`;
    let body;
    if (resolve) {
      if (card.applied) {
        body = `<div class="ddbx2-resolved"><i class="fas ${IC.hit}"></i> ${esc(card.audit || 'Applied.')}<button class="ddbx2-undo" data-ddbx="reopenall" title="Re-open"><i class="fas ${IC.reopen}"></i></button></div>`;
      } else {
        const rows = targets.map(t => resolveRow(card, t)).join('');
        let bar;
        if (card.save) {
          // Roll all comes first; once every save is resolved it's replaced by Apply all.
          const resolved = targets.every(t => card.save.results?.[t.name]);
          bar = resolved
            ? `<button data-ddbx="applyall"><i class="fas ${IC.dmg}"></i> Apply all</button>`
            : `<button data-ddbx="rollallsaves"><i class="fas ${IC.d20}"></i> Roll all saves</button>`;
        } else {
          const lead = card.atk?.confirmed
            ? `<button data-ddbx="reopenhits" title="Hits confirmed — click to undo"><i class="fas ${IC.hit}"></i> Confirmed <i class="fas ${IC.reopen}"></i></button>`
            : `<button data-ddbx="confirmhits"><i class="fas ${IC.hit}"></i> Confirm hits</button>`;
          bar = `${lead}<button data-ddbx="applyall"><i class="fas ${IC.dmg}"></i> Apply all</button>`;
        }
        body = `${rows}<div class="ddbx2-bar inline">${bar}</div>`;
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
  const titleIcon = card.heal ? IC.hp : card.atk ? 'fa-crosshairs' : card.save ? IC.save : card.dmg ? IC.dmg : IC.d20;
  return `<div class="ddbx2"><div class="ddbx2-act"><i class="fas ${titleIcon}"></i> ${esc(card.action)}</div>${atkSec}${saveSec}${dmgSec}${genSec}${footer}</div>`;
}

/* --------------------------------------------------------------- player card */
// Layout C with a phase flip: the d20 to-hit is the hero (blue) until damage lands, then damage becomes the
// hero (orange) and the to-hit drops to small print. Multi-type damage = combined hero total + breakdown.
function publicCard(pub) {
  const dmgReady = pub.dmg && (!pub.save || pub.revealed);
  const heroMode = dmgReady ? 'dmg' : pub.atk ? 'atk' : pub.gen ? 'gen' : pub.save ? 'save' : null;
  const nat = pub.atk?.nat ?? pub.gen?.nat ?? null;
  const genHue = abilityHue(pub.gen?.ability ?? (heroMode === 'save' ? pub.save?.ability : null));
  const tint = heroMode === 'dmg' ? (pub.heal ? '#5fd07a' : '#e0824d') : (genHue != null && !pub.verdict) ? `hsl(${genHue} 70% 60%)` : nat === 20 ? '#5fd07a' : nat === 1 ? '#ff6b6b' : '#9fc2ff';
  const accent = heroMode === 'dmg' ? (pub.heal ? 'rgba(95,208,122,.26)' : 'rgba(196,93,49,.30)') : (genHue != null) ? `hsl(${genHue} 70% 45% / .28)` : heroMode === 'save' ? 'rgba(196,93,49,.22)' : 'rgba(60,110,170,.28)';
  let wm;
  if (pub.gen && genHue != null && pub.img) {
    // Ability art: recolour the B&W art to the ability hue (keeps detail) and keep it faint.
    wm = `<div class="ddbx2-pc-wm" style="background:url('${pub.img}') center/cover no-repeat;filter:${recolor(genHue, 0.9)};opacity:.16;"></div>`;
  } else if (pub.img) {
    wm = `<div class="ddbx2-pc-wm" style="background:url('${pub.img}') center/cover no-repeat;"></div>`;
  } else {
    wm = `<div class="ddbx2-pc-wm" style="background-color:${tint};-webkit-mask:url('${WM_IMG}') center/62% no-repeat;mask:url('${WM_IMG}') center/62% no-repeat;"></div>`;
  }
  // Attack verdict shown as a small badge above the hero when uniform across targets (chips carry mixed results).
  const av = pub.atk?.verdicts && Object.values(pub.atk.verdicts);
  const allSame = av && av.length && av.every(x => x === av[0]) ? av[0] : null;
  const atkV = pub.verdict || (pub.atk?.confirmed ? allSame : null);
  const badge = (atkV === 'hit' || atkV === 'miss') ? `<div class="ddbx2-pc-badge ${atkV}"><i class="fas ${atkV === 'hit' ? IC.hit : IC.miss}"></i> ${atkV === 'hit' ? 'HIT' : 'MISS'}</div>` : '';
  let body = '';
  if (heroMode === 'dmg') {
    const tl = dmgTypeLabel(pub.dmg);
    const bd = (pub.dmg.parts || []).length > 1 ? `<div class="ddbx2-pc-bd">${pub.dmg.parts.map(p => `${p.amount} ${esc(p.type || '?')}`).join(' · ')}</div>` : '';
    const word = pub.heal ? 'healing' : `${tl ? esc(tl) + ' ' : ''}damage`;
    body = `${badge}<div class="ddbx2-pc-hero ${pub.heal ? 'heal' : 'dmg'}">${dmgTotal(pub.dmg)}</div><div class="ddbx2-pc-heroL">${word}</div>${pub.heal ? '' : bd}`;
  } else if (heroMode === 'atk') {
    const cls = nat === 20 ? ' crit' : nat === 1 ? ' fumble' : '';
    body = `${badge}<div class="ddbx2-pc-hero atk${cls}">${pub.atk.total}</div><div class="ddbx2-pc-heroL">to hit</div>`;
  } else if (heroMode === 'gen') {
    const v = pub.verdict; const cls = v ? (v === 'success' ? ' good' : ' bad') : (nat === 20 ? ' crit' : nat === 1 ? ' fumble' : '');
    const lbl = v ? (v === 'success' ? 'success' : 'failure') : (pub.gen.label || 'roll');
    const style = (!v && !cls && genHue != null) ? ` style="color:hsl(${genHue} 72% 64%)"` : '';
    body = `<div class="ddbx2-pc-hero gen${cls}"${style}>${pub.gen.total}</div><div class="ddbx2-pc-heroL">${esc(lbl)}</div>`;
  } else if (heroMode === 'save') {
    body = `<div class="ddbx2-pc-gate">DC ${pub.save.dc} ${esc(abilityShort(pub.save.ability))} save</div>`;
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
  // Bottom line (after the targets): once damage is the hero, lead with "21 to hit" then the formula results.
  const bits = [];
  if (pub.atk && dmgReady) bits.push(`${pub.atk.total} to hit`);
  if (pub.save && dmgReady) bits.push(`DC ${pub.save.dc} ${esc(abilityShort(pub.save.ability))} save`);
  if (pub.formula) bits.push(esc(pub.formula));
  const sub = bits.join(' &nbsp;|&nbsp; ');
  return `<div class="ddbx2-pc" style="--accent:${accent}">${wm}<div class="ddbx2-pc-body"><div class="ddbx2-pc-title">${esc(pub.action)}</div>${body}${tgts}${sub ? `<div class="ddbx2-pc-sub">${sub}</div>` : ''}</div></div></div>`;
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
  const base = { who: p.who, action: p.action, actorId: p.actorId, saveDC: p.saveDC, img: p.img, actionConds: p.actionConds || [], heal: !!p.heal };
  const key = `${p.actorId || p.who}|${(p.action || '').toLowerCase()}`;
  const pubT = (p.targets || []).map(t => ({ name: t.name, img: t.img }));
  if (p.kind === 'to hit') {
    const gm = { ...base, targets: p.targets, dice: p.dice, atk: { total: p.total, nat: p.nat, kind: p.advKind || '' } };
    const pub = { ...base, formula: p.formula, targets: pubT, dice: p.dice, atk: { total: p.total, nat: p.nat } };
    const gmMsg = await postGM(gm); const pubMsg = await postPublic(pub);
    actionCards.set(key, { gmId: gmMsg?.id, pubId: pubMsg?.id, gm, pub, ts: Date.now() });
    dsnRoll(p.dice); announce(gm, 'declare');
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
      rec.gm.dmg = foundry.utils.deepClone(dmg); rec.pub.dmg = foundry.utils.deepClone(dmg); rec.gm.dmgDice = p.dice; rec.pub.dmgDice = p.dice; rec.ts = Date.now();
      dsnRoll(p.dice); await pushRec(rec); return;
    }
    // Case B — another damage TYPE for the same action (DDB sends one same-named roll per type → accumulate).
    if (recent && rec?.gm?.dmg && rec.gm.dmg.parts.length < expected) {
      const part = { amount: p.total, type: p.damageTypes?.[rec.gm.dmg.parts.length] || '' };
      rec.gm.dmg.parts.push(foundry.utils.deepClone(part)); rec.gm.dmg.total += p.total;
      rec.pub.dmg.parts.push(foundry.utils.deepClone(part)); rec.pub.dmg.total += p.total; rec.ts = Date.now();
      dsnRoll(p.dice); await pushRec(rec); return;
    }
    // Case C — a fresh damage card.
    const part = { amount: p.total, type: p.damageTypes?.[0] || p.dtype || '' };
    const dmg = { parts: [part], total: p.total };
    const isSave = (p.saveDC != null) && p.saveAbility;
    const gm = { ...base, targets: p.targets, dmg: foundry.utils.deepClone(dmg), dmgDice: p.dice };
    const pub = { ...base, formula: p.formula, targets: pubT, dmg: foundry.utils.deepClone(dmg), dmgDice: p.dice };
    if (isSave) { gm.save = { dc: p.saveDC, ability: p.saveAbility, onSave: p.saveOnSave, results: {} }; gm.revealed = false; pub.save = { dc: p.saveDC, ability: p.saveAbility, onSave: p.saveOnSave, results: {} }; pub.revealed = false; }
    const gmMsg = await postGM(gm); const pubMsg = await postPublic(pub);
    actionCards.set(key, { gmId: gmMsg?.id, pubId: pubMsg?.id, gm, pub, ts: Date.now() });
    dsnRoll(p.dice); announce(gm, 'declare');
    return;
  }
  const gm = { ...base, targets: p.targets, dice: p.dice, ability: p.ability, gen: { total: p.total, nat: p.nat, label: p.genLabel, ability: p.ability } };
  const pub = { ...base, formula: p.formula, targets: pubT, ability: p.ability, gen: { total: p.total, nat: p.nat, label: p.genLabel, ability: p.ability } };
  const gmMsg = await postGM(gm); const pubMsg = await postPublic(pub);
  actionCards.set(key, { gmId: gmMsg?.id, pubId: pubMsg?.id, gm, pub, ts: Date.now() });
  dsnRoll(p.dice); announce(gm, 'declare');
}

async function renderRoll(data) {
  const roll = data.rolls?.[0] || {};
  const rt = (roll.rollType || '').toLowerCase();
  const action = data.action || 'Roll';
  const actor = resolveActor(data);
  const ctx = resolveAction(actor, action);
  const kind = rt === 'to hit' ? 'to hit' : (rt === 'damage' || rt === 'heal' || ctx.isHeal) ? 'damage' : 'other';
  const checkAb = kind === 'other' ? checkAbilityFromName(action) : null;
  const img = checkAb ? abilityIcon(checkAb) : ctx.img;
  return present({ who: actor?.name || data.context?.name || 'D&D Beyond', action, actorId: actor?.id || null, saveDC: ctx.saveDC, saveAbility: ctx.saveAbility, saveOnSave: ctx.saveOnSave, actionConds: ctx.actionConds, heal: ctx.isHeal || rt === 'heal', ability: checkAb, img, kind, total: Number(roll.result?.total ?? 0), nat: natFace(roll), dtype: ctx.damageType, damageTypes: ctx.damageTypes, dice: ddbDice(roll), advKind: roll.rollKind || '', targets: snapshotTargets(), formula: ddbFormula(roll), genLabel: rt || action });
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
  const kind = rtype === 'attack' ? 'to hit' : (rtype === 'damage' || rtype === 'heal' || ctx.isHeal) ? 'damage' : 'other';
  // Skill / ability / save checks → use the dnd5e ability artwork for the associated ability.
  const r = f.roll || {};
  let ability = r.ability || null;
  if (!ability && r.skill) ability = CONFIG.DND5E?.skills?.[r.skill]?.ability;
  if (!ability && r.tool) ability = CONFIG.DND5E?.tools?.[r.tool]?.ability || 'int';
  if (!ability && kind === 'other') ability = checkAbilityFromName(action);
  const checkLabel = r.skill ? (CONFIG.DND5E?.skills?.[r.skill]?.label || action) : (rtype === 'save' && ability) ? `${abilityLabel(ability)} Save` : (rtype === 'ability' || rtype === 'check') && ability ? `${abilityLabel(ability)} Check` : (rtype || action);
  const img = (kind === 'other' && ability) ? abilityIcon(ability) : (ctx.img || item?.img || '');
  // We cancel the native message, so trigger Dice So Nice ourselves for the real local roll (attacks/damage).
  try { if (game.dice3d && (kind === 'to hit' || kind === 'damage')) game.dice3d.showForRoll(roll, game.user, true); } catch (e) {}
  present({ who, action, actorId: actor?.id || null, saveDC: ctx.saveDC, saveAbility: ctx.saveAbility, saveOnSave: ctx.saveOnSave, actionConds: ctx.actionConds, heal: ctx.isHeal || rtype === 'heal', ability: (kind === 'other') ? ability : null, img, kind, total: Number(roll.total ?? 0), nat, dtype: ctx.damageType, damageTypes: ctx.damageTypes, dice: null, advKind: '', targets: targetsFromFlags(f.targets), formula: roll.formula, genLabel: kind === 'other' ? checkLabel : (rtype || action) }).catch(e => console.error('DDB Roll Cards | local render error', e));
}

/* ----------------------------------------------------------- actions */
async function applyHealing(actor, amount) { const hp = actor.system.attributes.hp; await actor.update({ 'system.attributes.hp.value': Math.min(hp.max ?? Infinity, (hp.value || 0) + Math.abs(amount)) }); }
async function manualDamage(actor, amount) { const hp = foundry.utils.deepClone(actor.system.attributes.hp); let rem = Math.abs(amount), temp = hp.temp || 0; const ab = Math.min(temp, rem); temp -= ab; rem -= ab; await actor.update({ 'system.attributes.hp.temp': temp, 'system.attributes.hp.value': Math.max(0, (hp.value || 0) - rem) }); }
async function applyMult(card, mult, message) {
  const dmg = card?.dmg; if (!dmg) return;
  const list = applyTargetsList(); if (!list.length) { ui.notifications.warn(`DDB: ${applyMode} no token(s).`); return; }
  const heal = !!card.heal; const parts = dmgApplyParts(dmg); const applied = [];
  for (const a of list) {
    const amt = heal ? Math.floor(dmgTotal(dmg) * Math.abs(mult)) : ((targetEstimate(a, dmg.parts, mult)?.dmg) ?? Math.floor(dmgTotal(dmg) * Math.abs(mult)));
    try { if (heal) await applyHealing(a, amt); else if (typeof a.applyDamage === 'function') await a.applyDamage(parts, { multiplier: mult }); else (mult < 0 ? applyHealing : manualDamage)(a, amt); } catch (e) { console.error(e); }
    applied.push({ id: a.id, amt, mult, heal });
  }
  const n = Math.floor(dmgTotal(dmg) * Math.abs(mult)); const tl = dmgTypeLabel(dmg);
  const resolved = heal ? `${n} healing` : (mult < 0 ? `${n} healing` : `${n}${mult !== 1 ? ` (×${mult})` : ''}${tl ? ' ' + tl : ' dmg'}`);
  dmg.resolved = resolved; dmg.applied = applied;
  const rec = actionCards.get(cardKey(card));
  if (rec?.gm?.dmg) { rec.gm.dmg.resolved = resolved; rec.gm.dmg.applied = applied; }
  if (message) { try { await message.update({ content: buildCard(card), flags: { [NS]: { card } } }); } catch (e) {} }
  // GM-only audit: how much the targets actually took stays a GM secret (players already see the damage rolled).
  ChatMessage.create({ whisper: ChatMessage.getWhisperRecipients('GM').map(u => u.id), content: `Applied <b>${resolved}</b> to ${list.map(a => esc(a.name)).join(', ')}.` });
}
async function reopenDamage(card, message) {
  if (!card?.dmg) return;
  for (const e of (card.dmg.applied || [])) { const a = game.actors.get(e.id); if (!a) continue; try { if (e.heal) await manualDamage(a, e.amt); else if (typeof a.applyDamage === 'function') await a.applyDamage(dmgApplyParts(card.dmg), { multiplier: -e.mult }); else await applyHealing(a, e.amt); } catch (x) { console.error(x); } }
  delete card.dmg.resolved; delete card.dmg.applied;
  const rec = actionCards.get(cardKey(card)); if (rec?.gm?.dmg) { delete rec.gm.dmg.resolved; delete rec.gm.dmg.applied; }
  if (message) try { await message.update({ content: buildCard(card), flags: { [NS]: { card } } }); } catch (e) {}
}
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
  announce(card, 'result');
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
  if (v) announce(card, 'result');
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
    try { if (game.dice3d && roll) game.dice3d.showForRoll(roll, game.user, true); } catch (e) {}
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
  announce(card, 'result');
}
// Per-target damage portion + conditions live in card.tgt[name] = { mult, conditions:[] }. GM-only (no public push).
function ensureTgt(c, name) { c.tgt = c.tgt || {}; c.tgt[name] = c.tgt[name] || {}; return c.tgt[name]; }
async function setTargetMult(card, name, mult, message) {
  const set = (c) => { if (c) ensureTgt(c, name).mult = mult; };
  set(card); const rec = actionCards.get(cardKey(card)); if (rec) { set(rec.gm); set(rec.pub); }
  if (message) { try { await message.update({ content: buildCard(card), flags: { [NS]: { card } } }); } catch (e) {} }
}
async function setTargetCondition(card, name, cid, add, message) {
  // Materialize from the suggested defaults the first time the GM edits this target's conditions.
  const base = card.tgt?.[name]?.conditions ?? defaultConds(getOutcome(card, name), card);
  const next = Array.from(new Set(add ? [...base, cid] : base.filter(x => x !== cid)));
  const set = (c) => { if (c) ensureTgt(c, name).conditions = [...next]; };
  set(card); const rec = actionCards.get(cardKey(card)); if (rec) { set(rec.gm); set(rec.pub); }
  if (message) { try { await message.update({ content: buildCard(card), flags: { [NS]: { card } } }); } catch (e) {} }
}
// Unified apply: per-target damage/healing (portion × parts) + conditions, then confirm/reveal in one shot.
// Records exactly what was done per target so the undo can reverse it precisely.
async function applyAll(card, message) {
  const dmg = card?.dmg; if (!dmg) return;
  const targets = card.targets || []; if (!targets.length) { ui.notifications.warn('DDB: no targets to apply to.'); return; }
  const isAtk = !!card.atk, heal = !!card.heal; const parts = dmgApplyParts(dmg); const audit = []; const detail = {};
  for (const t of targets) {
    const outcome = isAtk ? (card.atk.verdicts?.[t.name] ?? defaultHit(t, card.atk.total)) : card.save?.results?.[t.name];
    const mult = card.tgt?.[t.name]?.mult ?? defaultPortion(outcome, card.save?.onSave);
    const actor = actorByName(t.name); if (!actor) continue;
    const dealt = heal ? Math.floor(dmgTotal(dmg) * Math.abs(mult)) : ((targetEstimate(actor, dmg.parts, mult)?.dmg) ?? Math.floor(dmgTotal(dmg) * Math.abs(mult)));
    if (mult !== 0) { try { if (heal) await applyHealing(actor, dealt); else if (typeof actor.applyDamage === 'function') await actor.applyDamage(parts, { multiplier: mult }); else (mult < 0 ? applyHealing : manualDamage)(actor, dealt); } catch (e) { console.error(e); } }
    const conds = card.tgt?.[t.name]?.conditions ?? defaultConds(outcome, card);
    const added = [];
    for (const cid of conds) { const has = actor.statuses?.has?.(cid); if (!has) { try { await actor.toggleStatusEffect?.(cid, { active: true }); added.push(cid); } catch (e) { console.error(e); } } }
    detail[t.name] = { mult, dealt, heal, added };
    audit.push(`${t.name} ${heal ? '+' : ''}${dealt}${conds.length ? ' [' + conds.map(condLabel).join(', ') + ']' : ''}`);
  }
  const txt = `Applied — ${audit.join(', ')}`;
  const set = (c) => { if (c) { c.applied = true; c.audit = txt; c.revealed = true; c.appliedDetail = detail; if (c.atk) c.atk.confirmed = true; } };
  set(card); const rec = actionCards.get(cardKey(card)); if (rec) { set(rec.gm); set(rec.pub); }
  await syncCards(card, message);
  ChatMessage.create({ whisper: ChatMessage.getWhisperRecipients('GM').map(u => u.id), content: `<b>${esc(card.action)}</b> — ${esc(txt)}` });
}
// Undo = reverse exactly what applyAll did: heal back the damage (or remove the healing) and drop only the
// conditions we actually added (leave ones the target already had).
async function reopenAll(card, message) {
  const detail = card.appliedDetail || {};
  for (const [name, det] of Object.entries(detail)) {
    const actor = actorByName(name); if (!actor) continue;
    try {
      if (det.heal) await manualDamage(actor, det.dealt);
      else if (typeof actor.applyDamage === 'function' && card.dmg) await actor.applyDamage(dmgApplyParts(card.dmg), { multiplier: -det.mult });
      else await applyHealing(actor, det.dealt);
    } catch (e) { console.error(e); }
    for (const cid of (det.added || [])) { try { await actor.toggleStatusEffect?.(cid, { active: false }); } catch (e) { console.error(e); } }
  }
  const set = (c) => { if (c) { c.applied = false; delete c.appliedDetail; } };
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

/* ---------------------------------------------------- cinematic phase stingers */
// Average-color → hue, so each action's stinger themes itself off its own art (consistent saturation).
function rgbToHue(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return null; let h; if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; return ((Math.round(h * 60)) + 360) % 360; }
function imgHue(src) { return new Promise(res => { if (!src) return res(null); const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => { try { const cv = document.createElement('canvas'); cv.width = cv.height = 12; const x = cv.getContext('2d'); x.drawImage(img, 0, 0, 12, 12); const d = x.getImageData(0, 0, 12, 12).data; let r = 0, g = 0, b = 0, n = 0; for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 40) continue; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; } if (!n) return res(null); res(rgbToHue(r / n, g / n, b / n)); } catch (e) { res(null); } }; img.onerror = () => res(null); img.src = src; }); }
// Build an already-evaluated Roll with the exact DDB dice values so Dice So Nice animates the real result.
function forcedRoll(dice) {
  try {
    const T = foundry.dice?.terms || {}; const DieT = T.Die || globalThis.Die; const Op = T.OperatorTerm || globalThis.OperatorTerm; const Num = T.NumericTerm || globalThis.NumericTerm;
    if (!DieT || !dice?.sets?.length) return null;
    const terms = []; let total = 0;
    for (const s of dice.sets) {
      if (!s.values.length) continue;
      if (terms.length) { const op = new Op({ operator: '+' }); op._evaluated = true; terms.push(op); }
      const d = new DieT({ number: s.values.length, faces: s.faces });
      d.results = s.values.map(v => ({ result: v, active: true })); d._evaluated = true;
      terms.push(d); total += s.values.reduce((a, b) => a + b, 0);
    }
    if (!terms.length) return null;
    if (dice.mod) { const op = new Op({ operator: '+' }); op._evaluated = true; terms.push(op); const num = new Num({ number: dice.mod }); num._evaluated = true; terms.push(num); total += dice.mod; }
    const roll = Roll.fromTerms(terms); roll._evaluated = true; roll._total = total;
    return roll;
  } catch (e) { console.warn('DDB Roll Cards | forcedRoll', e); return null; }
}
// Animate the exact DDB dice via Dice So Nice (synchronized to all clients). Called at roll time, not tied to the cinematic.
async function dsnRoll(dice) { try { if (!game.dice3d || !dice) return; const roll = forcedRoll(dice); if (roll) await game.dice3d.showForRoll(roll, game.user, true); } catch (e) { console.warn('DDB Roll Cards | dsn', e); } }
const TONE_HUE = { hit: 130, success: 130, miss: 2, failure: 2, crit: 45, critmiss: 350 };
let _declareEl = null, _declareTimer = null;
// Lift the Dice So Nice canvas above the cinematic so the 3D dice render on top of it.
function liftDice(on) {
  try {
    const c = document.getElementById('dice-box-canvas') || document.querySelector('canvas#dice-box-canvas, .dice-box-canvas');
    if (c) c.style.zIndex = on ? '100000' : '';
  } catch (e) {}
}
// Reserve only the chat CONTENT panel on the right (not the tab-toolbar column it's attached to), so the
// cinematic fills under the toolbar icons instead of leaving a void beneath them.
function rightInset() {
  const inW = window.innerWidth;
  try {
    const sb = document.getElementById('sidebar') || ui.sidebar?.element; const el = sb?.getBoundingClientRect ? sb : sb?.[0];
    const sr = el?.getBoundingClientRect?.(); if (!sr || !sr.width || sr.right < inW - 20) return 0;
    // The tab toolbar is a narrow, tall column on the inner edge of the sidebar — let the cinematic run under it.
    let tbRight = 0;
    for (const c of el.querySelectorAll('nav, menu, .tabs, .tabbed-sidebar, #sidebar-tabs, .sidebar-tabs')) { const r = c.getBoundingClientRect(); if (r.width > 8 && r.width < 80 && r.height > sr.height * 0.4 && r.left <= sr.left + 70) tbRight = Math.max(tbRight, r.right); }
    // Or use the chat content panel's left edge directly.
    let chatLeft = 0; const ce = (ui.chat?.element?.getBoundingClientRect ? ui.chat.element : ui.chat?.element?.[0]) || document.querySelector('#chat, #chat-log');
    const cr = ce?.getBoundingClientRect?.(); if (cr && cr.width > 80 && cr.left > sr.left) chatLeft = cr.left;
    const left = Math.max(sr.left, tbRight, chatLeft);
    const ins = inW - left;
    return (ins > 0 && ins < inW * 0.6) ? Math.round(ins) : 0;
  } catch (e) { return 0; }
}
function markColor(m) { return (m === 'hit' || m === 'save') ? '#69d77f' : (m === 'miss' || m === 'fail') ? '#ff7b7b' : ''; }
function markIcon(m) { return m === 'save' ? IC.save : (m === 'hit') ? IC.hit : (m === 'miss' || m === 'fail') ? IC.miss : ''; }
function targetChip(t, size, idx, n, layout) {
  const col = markColor(t.mark);
  let pos = '';
  if (layout === 'orbit') {
    // Spread along the BOTTOM arc only (20°→160°, where 90° is straight down) so targets never collide with
    // the top action block, the centered caster/nickname, or the centered result word.
    const span = 140, start = 20;
    const deg = n > 1 ? start + (idx / (n - 1)) * span : 90;
    const ang = deg * Math.PI / 180;
    const x = 50 + Math.cos(ang) * 40, y = 50 + Math.sin(ang) * 38;
    pos = `position:absolute;left:${x.toFixed(1)}%;top:${y.toFixed(1)}%;transform:translate(-50%,-50%);`;
  }
  const ring = col ? `box-shadow:0 0 0 3px ${col},0 0 20px #000a;` : 'box-shadow:0 0 0 2px var(--c1),0 0 18px #000a;';
  const mk = t.mark ? `<span class="ddbx-tg-m" style="color:${col}"><i class="fas ${markIcon(t.mark)}"></i></span>` : '';
  return `<div class="ddbx-tg" style="${pos}width:${size}px;height:${size}px;background-image:url('${t.img || 'icons/svg/mystery-man.svg'}');${ring}">${mk}<span class="ddbx-tg-n">${esc(t.name)}</span></div>`;
}
async function playStinger(p) {
  try {
    if (!document.body) return;
    if (!game.settings.get(NS, 'stingers')) return;
    const layout = game.settings.get(NS, 'stingerLayout') || 'theater';
    const crit = p.tone === 'crit' || p.tone === 'critmiss';
    // The declaration lingers (10s cap) until the result fires; the result holds ~4s.
    const dur = (p.phase === 'declare') ? 10000 : 4000;
    // The incoming result clears the lingering declaration first.
    if (p.phase === 'result' && _declareEl) { clearTimeout(_declareTimer); _declareEl.remove(); _declareEl = null; }
    // Result tone colours the moment; otherwise ability colour, then sampled art, then a default.
    let H;
    if (p.phase === 'result') H = TONE_HUE[p.tone] ?? 45;
    else H = (p.hue != null) ? p.hue : (await imgHue(p.img));
    if (H == null) H = p.heal ? 140 : 265;
    const wrap = document.createElement('div'); wrap.className = `ddbx-sting lay-${layout} ph-${p.phase}${crit ? ' crit' : ''}`;
    wrap.style.setProperty('--c1', `hsl(${H} 78% 62%)`); wrap.style.setProperty('--c2', `hsl(${H} 80% 26%)`); wrap.style.setProperty('--dur', dur + 'ms');
    let particles = ''; const N = p.phase === 'result' ? 44 : 30; for (let i = 0; i < N; i++) { const x = (Math.random() * 100).toFixed(1); const dl = (Math.random() * 1.8).toFixed(2); const du = (1.6 + Math.random() * 1.9).toFixed(2); const sz = (2 + Math.random() * 5).toFixed(1); const sway = Math.round(Math.random() * 50 - 25); const spark = i % 4 === 0 ? ' spark' : ''; particles += `<span class="ddbx-pt${spark}" style="left:${x}%;--sway:${sway}px;width:${sz}px;height:${sz}px;animation-delay:${dl}s;animation-duration:${du}s;"></span>`; }
    const tint = (p.tintArt && p.artHue != null);
    const bgFilter = tint ? `filter:blur(42px) ${recolor(p.artHue, 0.6)};` : '';
    const embFilter = tint ? `filter:${recolor(p.artHue, 1.05)};` : '';
    const frame = layout === 'theater' ? `<div class="ddbx-lb top"></div><div class="ddbx-lb bot"></div>` : layout === 'versus' ? `<div class="ddbx-streak"></div>` : `<div class="ddbx-radial"></div>`;
    // Caster portrait with the player's nickname directly beneath it.
    const caster = p.actorImg ? `<div class="ddbx-casterwrap"><span class="ddbx-caster" style="background-image:url('${p.actorImg}')"></span>${p.who ? `<span class="ddbx-cname">${esc(p.who)}</span>` : ''}</div>` : '';
    // Action name ABOVE the action artwork (declaration); result word above the art, action name beneath.
    const emblem = p.img ? `<div class="ddbx-emblem" style="background-image:url('${p.img}');${embFilter}"></div>` : '';
    const center = (p.phase === 'result')
      ? `<div class="ddbx-center"><div class="ddbx-burst"></div><div class="ddbx-result">${esc(p.word || '')}</div>${emblem}${p.action ? `<div class="ddbx-rsub">${esc(p.action)}</div>` : ''}</div>`
      : `<div class="ddbx-center"><div class="ddbx-title">${esc(p.action || '')}</div>${emblem}</div>`;
    const tg = p.targets || []; const tsize = layout === 'versus' ? 82 : layout === 'orbit' ? 72 : 78;
    const targets = tg.length ? `<div class="ddbx-tgrp">${tg.slice(0, 8).map((t, i) => targetChip(t, tsize, i, Math.min(tg.length, 8), layout)).join('')}</div>` : '';
    wrap.innerHTML = `${p.img ? `<div class="ddbx-bg" style="background-image:url('${p.img}');${bgFilter}"></div>` : ''}<div class="ddbx-vig"></div>${frame}<div class="ddbx-pts">${particles}</div><div class="ddbx-stage">${caster}${center}${targets}</div>`;
    wrap.style.right = rightInset() + 'px';
    document.body.appendChild(wrap); liftDice(true);
    const done = () => { wrap.remove(); if (_declareEl === wrap) _declareEl = null; if (!document.querySelector('.ddbx-sting')) liftDice(false); };
    if (p.phase === 'declare') { _declareEl = wrap; _declareTimer = setTimeout(done, dur); }
    else setTimeout(done, dur);
  } catch (e) { console.warn('DDB Roll Cards | stinger', e); }
}
// GM builds the terse phase payload and broadcasts it to every client.
function announce(card, phase) {
  try {
    if (!game.user?.isGM || !game.settings.get(NS, 'stingers')) return;
    const isCheck = !!card.gen;
    const actor = card.actorId ? game.actors.get(card.actorId) : null;
    const hue = abilityHue(card.ability || card.save?.ability);
    const base = { phase, action: isCheck ? (card.gen.label || card.action) : card.action, img: card.img || '', actorImg: actor?.img || '', who: card.who || actor?.name || '', hue, tintArt: isCheck && hue != null, artHue: hue };
    let payload;
    if (phase === 'declare') {
      payload = { ...base, targets: (card.targets || []).map(t => ({ name: t.name, img: t.img })) };
    } else { // result — one outcome word + per-target marks
      const nat = card.atk?.nat ?? card.gen?.nat;
      let word = '', tone = 'hit';
      if (card.atk) {
        if (nat === 20) { word = 'Critical Hit'; tone = 'crit'; } else if (nat === 1) { word = 'Critical Miss'; tone = 'critmiss'; }
        else { const v = Object.values(card.atk.verdicts || {}); const allHit = v.length && v.every(x => x === 'hit'), allMiss = v.length && v.every(x => x === 'miss'); word = allHit ? 'Hit' : allMiss ? 'Miss' : 'Hit & Miss'; tone = allMiss ? 'miss' : 'hit'; }
      } else if (isCheck) {
        if (nat === 20) { word = 'Critical Success'; tone = 'crit'; } else if (nat === 1) { word = 'Critical Failure'; tone = 'critmiss'; }
        else { word = card.gen.verdict === 'success' ? 'Success' : 'Failure'; tone = card.gen.verdict === 'success' ? 'success' : 'failure'; }
      } else if (card.save) {
        const r = Object.values(card.save.results || {}); const f = r.filter(x => x === 'fail').length, s = r.filter(x => x === 'save').length;
        word = `${f} Failed · ${s} Saved`; tone = f >= s ? 'hit' : 'miss';
      }
      const targets = (card.targets || []).map(t => ({ name: t.name, img: t.img, mark: card.atk ? (card.atk.verdicts?.[t.name] ?? defaultHit(t, card.atk.total)) : card.save ? card.save.results?.[t.name] : null }));
      payload = { ...base, word, tone, targets };
    }
    playStinger(payload);
    try { game.socket?.emit(`module.${NS}`, { t: 'stinger', payload }); } catch (e) {}
  } catch (e) { console.warn('DDB Roll Cards | announce', e); }
}

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
  game.settings.register(NS, 'stingers', { name: 'Cinematic phase announcements', hint: 'Full-screen animated stingers for each phase (declaration, hit/save results), themed off the action art. Shown to all players.', scope: 'world', config: true, type: Boolean, default: true });
  game.settings.register(NS, 'stingerLayout', { name: 'Cinematic layout', hint: 'How the cinematic arranges the caster and target portraits.', scope: 'world', config: true, type: String, default: 'theater', choices: { theater: 'Theater (letterboxed, caster top, targets in a row)', versus: 'Versus line (caster left, targets fanned right)', orbit: 'Caster centered, targets orbiting' } });
  game.settings.register(NS, 'debug', { name: 'Debug: log all incoming chat messages', hint: 'Logs every chat message (type, flags, flavor) to the console so we can identify and suppress stray native cards.', scope: 'client', config: true, type: Boolean, default: false });
  try {
    class DdbxMappingMenu extends foundry.applications.api.ApplicationV2 { async render() { editMapping(); return this; } }
    game.settings.registerMenu(NS, 'mappingMenu', { name: 'Character Mapping', label: 'Edit Character Mapping', hint: 'Map D&D Beyond characters to Foundry actors (only needed when names differ).', icon: 'fas fa-people-arrows', type: DdbxMappingMenu, restricted: true });
  } catch (e) { console.warn('DDB Roll Cards | mapping menu register failed (use DDBRollCards.editMapping())', e); }
});
Hooks.once('ready', () => {
  // Styles + the stinger socket listener run for EVERY client (players see public cards and cinematic stingers).
  injectStyles();
  // Remote clients play the overlay only; the GM's Dice So Nice roll already synchronizes its dice to them.
  try { game.socket?.on(`module.${NS}`, (m) => { if (m?.t === 'stinger') playStinger(m.payload, false); }); } catch (e) {}
  if (!game.user.isGM) return;
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
    // Always-live damage-type dropdown.
    root.querySelectorAll('select[data-ddbx-dtype]').forEach(sel => sel.addEventListener('change', () => changeDtype(card, sel.value, message)));
  });
  console.log(`DDB Roll Cards | ready (v4.18) — ${game.modules.get(SYNC)?.active ? 'riding ddb-sync socket' : 'standalone connection'}`);
});
