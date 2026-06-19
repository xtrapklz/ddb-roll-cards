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
let groupContest = null; // active group contest awaiting participant rolls: { key, names:Set, ts }
let applyMode = 'targeted';

// All flat, monochrome FontAwesome line/solid glyphs — no emoji-shaped icons (burst/heart/bolt swapped out).
const IC = { d20: 'fa-dice-d20', dmg: 'fa-droplet', hp: 'fa-heart-pulse', save: 'fa-shield-halved', cond: 'fa-circle-exclamation', hit: 'fa-check', miss: 'fa-xmark', reopen: 'fa-rotate-left' };
const WM_IMG = 'icons/logo-scifi-blank.png';

/* ------------------------------------------------------------------ styles */
const STYLES = `
/* Semantic palette — one source of truth for card + cinematic colour. (--c1/--c2/--accent stay dynamic per element.) */
.ddbx2, .ddbx2-pc, .ddbx-sting{
  --good:#69d77f; --good-soft:#9fd8ac; --bad:#ff6b6b; --bad-soft:#ff9b9b;
  --coral:#e0824d; --coral-text:#f3cdbc; --info:#7fb2ff; --info-soft:#9bd0ff;
  --skill:#bda9e8; --gold:#ffd34d; --txt:#f4f4f4; --txt-dim:#cfcfcf; --txt-mute:#9a9a9a;
}
/* Both cards inherit the ambient chat font so the GM card and the player card read consistently (the player card
   already inherited it; the GM card used to force Signika). One font scheme everywhere. */
.ddbx2{border:1px solid rgba(0,0,0,.45);border-radius:6px;overflow:hidden;background:#17181c;color:var(--txt);font-family:inherit;}
.ddbx2-pc{font-family:inherit;}
.ddbx2-act{padding:5px 9px;font-weight:bold;font-size:12px;background:linear-gradient(90deg,#222226,#34343a);color:var(--txt);display:flex;align-items:center;gap:6px;}
.ddbx2-sec{padding:6px 9px;border-top:1px solid rgba(255,255,255,.07);}
.ddbx2-lbl{font-size:10px;font-weight:bold;letter-spacing:.08em;color:var(--coral);text-transform:uppercase;display:flex;align-items:center;gap:5px;flex-wrap:nowrap;white-space:nowrap;}
.ddbx2-num{font-size:28px;font-weight:bold;line-height:1;text-align:center;margin:2px 0 3px;color:var(--txt);}
.ddbx2-num.crit{color:var(--good);} .ddbx2-num.fumble{color:var(--bad);}
.ddbx2-pill{font-size:10px;padding:0 6px;border-radius:8px;background:rgba(255,255,255,.12);font-weight:normal;color:var(--txt);}
.ddbx2-tag{font-size:10px;padding:0 6px;border-radius:8px;background:rgba(224,130,77,.22);border:1px solid rgba(224,130,77,.5);font-weight:normal;color:var(--coral-text);}
.ddbx2-trow{display:flex;align-items:center;gap:6px;margin-top:4px;font-size:12px;color:var(--txt-dim);}
.ddbx2-timg{width:24px;height:24px;border-radius:4px;object-fit:cover;border:1px solid rgba(0,0,0,.5);}
.ddbx2-tname{font-weight:bold;flex:1 1 auto;}
.ddbx2-stat{opacity:.8;white-space:nowrap;}
.ddbx2-hit{color:var(--good);font-weight:bold;} .ddbx2-miss{color:var(--bad);font-weight:bold;}
.ddbx2-resolved{margin-top:6px;font-size:12px;color:var(--good-soft);display:flex;align-items:center;gap:6px;}
.ddbx2-mode{display:flex;gap:3px;margin-top:6px;}
.ddbx2-mults{display:flex;gap:3px;margin-top:4px;}
.ddbx2 .ddbx2-mode button,.ddbx2 .ddbx2-mults button,.ddbx2 .ddbx2-bar button,.ddbx2 .ddbx2-resolved button{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.18);color:var(--txt);cursor:pointer;}
.ddbx2 .ddbx2-mode button:hover,.ddbx2 .ddbx2-mults button:hover,.ddbx2 .ddbx2-bar button:hover,.ddbx2 .ddbx2-resolved button:hover{background:rgba(255,255,255,.14);}
.ddbx2-mode button{flex:1 1 0;font-size:10px;line-height:18px;padding:0;opacity:.6;border-radius:3px;}
.ddbx2-mode button.active{opacity:1;font-weight:bold;box-shadow:inset 0 0 0 1px var(--coral);}
.ddbx2-mults button{flex:1 1 0;font-size:13px;line-height:26px;padding:0;border-radius:3px;}
.ddbx2-mults button.primary{font-weight:bold;box-shadow:inset 0 0 0 1px rgba(224,130,77,.6);}
.ddbx2-bar{display:flex;gap:5px;padding:6px 9px;border-top:1px solid rgba(255,255,255,.07);}
.ddbx2-bar.inline{border-top:none;padding:6px 0 0;}
.ddbx2-bar button[disabled]{opacity:.4;cursor:not-allowed;}
.ddbx2-wait{flex:0 0 auto;display:inline-flex;align-items:center;gap:5px;font-size:11px;color:#d8c79f;padding:0 4px;}
.ddbx2 .ddbx2-bar button.ddbx2-cancel{flex:0 0 auto;background:rgba(220,80,80,.14);border-color:rgba(220,80,80,.4);color:#f0b3b3;}
.ddbx2 .ddbx2-bar button.ddbx2-cancel:hover{background:rgba(220,80,80,.28);}
.ddbx2-bar button{flex:1 1 0;font-size:11px;line-height:24px;padding:0 6px;border-radius:4px;white-space:nowrap;display:flex;align-items:center;justify-content:center;gap:5px;}
.ddbx2-undo{flex:0 0 26px !important;width:26px;min-width:26px;height:26px;padding:0 !important;line-height:24px;border-radius:4px;margin-left:auto;display:inline-flex;align-items:center;justify-content:center;}
.ddbx2 [data-ddbx="dtype"]{cursor:pointer;border-style:dashed;}
.ddbx2 [data-ddbx="dtype"]:hover{filter:brightness(1.25);}
.ddbx2-dsel{font-size:11px;max-width:120px;background:#222;color:var(--txt);border:1px solid rgba(224,130,77,.6);border-radius:8px;padding:1px 4px;}
.ddbx2 .ddbx2-dsel-live{flex:1 1 auto;min-width:0;font-size:11px;background:#222;color:var(--coral-text);border:1px solid rgba(224,130,77,.5);border-radius:8px;padding:1px 6px;height:20px;text-transform:capitalize;}
.ddbx2 .ddbx2-dsel-live.ddbx2-needpick{border-color:var(--gold);box-shadow:0 0 0 1px var(--gold),0 0 8px rgba(255,211,77,.5);color:var(--gold);animation:ddbx2-needpick 1.4s ease-in-out infinite;}
@keyframes ddbx2-needpick{0%,100%{box-shadow:0 0 0 1px var(--gold),0 0 6px rgba(255,211,77,.35);}50%{box-shadow:0 0 0 1px var(--gold),0 0 12px rgba(255,211,77,.7);}}
.ddbx2 .ddbx2-sv{flex:0 0 22px;width:22px;height:22px;padding:0;margin-left:4px;border-radius:4px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.18);color:var(--txt);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:11px;}
.ddbx2 .ddbx2-sv:hover{background:rgba(255,255,255,.14);}
.ddbx2 .ddbx2-sv.react{width:auto;padding:0 7px;color:var(--gold,#e0c060);box-shadow:inset 0 0 0 1px rgba(224,192,96,.5);font-weight:600;}
.ddbx2 .ddbx2-react{display:inline-flex;align-items:center;gap:4px;margin-left:6px;font-size:11px;color:var(--gold,#e0c060);opacity:.95;}
.ddbx2 .ddbx2-react.miss{color:var(--good);}
.ddbx-multi{font-family:inherit;}
.ddbx-multi-h{display:flex;align-items:center;gap:7px;margin-bottom:2px;}
.ddbx-multi-h img{flex:0 0 auto;object-fit:cover;}
.ddbx-multi-sub{font-size:11px;opacity:.75;margin:0 0 6px 2px;}
.ddbx-multi-row{display:flex;flex-wrap:wrap;gap:5px;}
.ddbx-multibtn{flex:0 0 auto;padding:3px 9px;border-radius:5px;background:rgba(224,192,96,.12);border:1px solid rgba(224,192,96,.45);color:var(--gold,#e0c060);cursor:pointer;font-weight:600;font-size:12px;}
.ddbx-multibtn:hover{background:rgba(224,192,96,.24);}
.ddbx-multibtn.done{opacity:.4;text-decoration:line-through;}
.ddbx2 .ddbx-legres{width:100%;padding:4px 8px;border-radius:5px;background:rgba(96,160,224,.14);border:1px solid rgba(96,160,224,.5);color:#7fb0e0;cursor:pointer;font-weight:600;}
.ddbx2 .ddbx-legres:hover{background:rgba(96,160,224,.26);}
.ddbx2 .ddbx2-sv.on.hit{box-shadow:inset 0 0 0 1px var(--good);color:var(--good);}
.ddbx2 .ddbx2-sv.on.miss{box-shadow:inset 0 0 0 1px var(--bad);color:var(--bad);}
.ddbx2 .ddbx2-sv.on.dmg{box-shadow:inset 0 0 0 1px var(--coral);color:var(--coral-text);}
.ddbx2-condsec{display:flex;align-items:center;gap:5px;margin-top:8px;flex-wrap:wrap;color:var(--coral);}
.ddbx2 .ddbx2-condsec select{flex:1 1 90px;min-width:70px;}
.ddbx2 .ddbx2-condsec button{flex:0 0 auto;font-size:10px;line-height:22px;padding:0 9px;border-radius:4px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.18);color:var(--txt);cursor:pointer;}
.ddbx2 .ddbx2-condsec button:hover{background:rgba(255,255,255,.14);}
.ddbx2 .ddbx2-cinput{width:46px;font-size:13px;text-align:center;background:#222;color:#fff;border:1px solid rgba(255,255,255,.25);border-radius:4px;padding:1px 2px;}
.ddbx2 [data-ddbx="editnum"]{cursor:pointer;}
.ddbx2-dcrow{display:flex;align-items:center;gap:4px;margin-top:7px;font-size:11px;color:var(--txt-mute);}
.ddbx2 .ddbx2-dcrow .ddbx2-sv{flex:1 1 0;width:auto;height:24px;margin-left:0;}
.ddbx2-dcrow span{letter-spacing:.06em;}
.ddbx2 .ddbx2-dcrow button{flex:0 0 30px;width:30px;}
.ddbx2-pc-name{font-size:17px;font-weight:bold;letter-spacing:.06em;color:#fff;margin-bottom:2px;}
.ddbx2-pc-ctx{font-size:13px;font-weight:bold;letter-spacing:.08em;text-transform:uppercase;color:var(--txt-dim);margin-top:5px;}
.ddbx2-pc-ctx.ddbx2-pc-hit{color:var(--good);} .ddbx2-pc-ctx.ddbx2-pc-miss{color:var(--bad);}
.ddbx2-srow{flex-wrap:wrap;}
.ddbx2-rrow{display:flex;gap:8px;align-items:stretch;padding:6px 0;border-top:1px solid rgba(255,255,255,.06);}
.ddbx2-rrow:first-of-type{border-top:none;}
.ddbx2-ravatar{flex:0 0 42px;width:42px;height:42px;border-radius:6px;object-fit:cover;border:1px solid rgba(0,0,0,.5);align-self:center;}
.ddbx2-ravatar.tall{flex:0 0 56px;width:56px;height:auto;align-self:stretch;min-height:54px;}
.ddbx2-rmain{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:5px;}
.ddbx2-rtop{display:flex;align-items:center;gap:7px;}
.ddbx2-rbot{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}
.ddbx2-grp{display:inline-flex;gap:3px;margin-left:auto;}
.ddbx2-portion{display:flex;gap:5px;width:100%;}
.ddbx2 .ddbx2-portion>*{flex:1 1 0;min-width:0;width:auto;height:27px;line-height:25px;margin-left:0;font-size:13px;}
.ddbx2 .ddbx2-calc{cursor:default;background:rgba(0,0,0,.32);border-style:dashed;font-weight:bold;color:var(--txt);}
.ddbx2 .ddbx2-calc:hover{background:rgba(0,0,0,.32);}
.ddbx2 .ddbx2-calc.heal{color:var(--good);border-color:rgba(105,215,127,.5);}
.ddbx2 .ddbx2-calc.vul{color:var(--bad-soft);border-color:rgba(255,90,90,.55);}
.ddbx2 .ddbx2-calc.res{color:var(--info-soft);border-color:rgba(127,178,255,.5);}
.ddbx2 .ddbx2-calc.imm{color:#bcbcbc;}
.ddbx2-condsec2{display:flex;gap:6px;margin-top:8px;}
.ddbx2 .ddbx2-condsec2 select{flex:1 1 0;min-width:0;}
.ddbx2-pc-title{font-size:16px;font-weight:900;letter-spacing:.02em;margin-bottom:6px;color:#fff;}
.ddbx2-pc-conds{display:flex;flex-wrap:wrap;gap:3px;width:100%;margin-top:4px;}
.ddbx2-pc-condchip{display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:bold;letter-spacing:.02em;line-height:1;padding:2px 7px 2px 3px;border-radius:9px;background:rgba(224,130,77,.18);color:var(--coral-text);box-shadow:inset 0 0 0 1px rgba(224,130,77,.45);}
.ddbx2-pc-condchip img{width:13px;height:13px;border-radius:3px;filter:drop-shadow(0 1px 1px #000);}
.ddbx2-pc{position:relative;overflow:hidden;border-radius:8px;background:#17181c;background-image:radial-gradient(circle at 50% -20%, var(--accent,rgba(160,27,27,.28)), transparent 72%);padding:12px 10px;text-align:center;color:var(--txt);}
.ddbx2-pc-wm{position:absolute;inset:0;opacity:.16;pointer-events:none;}
.ddbx2-pc-body{position:relative;z-index:1;}
@keyframes ddbx2-pop{0%{transform:scale(.55);opacity:0;}55%{transform:scale(1.18);opacity:1;}100%{transform:scale(1);}}
@keyframes ddbx2-glow{0%{filter:drop-shadow(0 0 0 currentColor);}30%{filter:drop-shadow(0 0 6px currentColor);}100%{filter:drop-shadow(0 0 0 transparent);}}
.ddbx2-pc-badge{font-size:13px;font-weight:bold;letter-spacing:.1em;display:inline-block;animation:ddbx2-pop .45s cubic-bezier(.2,1.4,.5,1), ddbx2-glow .9s ease-out;}
.ddbx2-pc-badge.hit{color:var(--good);text-shadow:0 0 5px rgba(95,208,122,.35);} .ddbx2-pc-badge.miss{color:var(--bad);text-shadow:0 0 5px rgba(255,107,107,.35);}
.ddbx2-pc-hero.heal{color:var(--good);}
.ddbx2-pc-hero{font-size:46px;font-weight:900;line-height:1.05;margin:1px 0 2px;color:var(--txt);animation:ddbx2-pop .4s ease-out;}
.ddbx2-pc-hero.atk{color:var(--info);} .ddbx2-pc-hero.dmg{color:#f0a878;} .ddbx2-pc-hero.gen{color:var(--info);}
.ddbx2-pc-hero.good{color:var(--good);} .ddbx2-pc-hero.bad{color:var(--bad);}
.ddbx2-pc-hero.crit{color:var(--good);text-shadow:0 0 12px rgba(95,208,122,.6);}
.ddbx2-pc-hero.fumble{color:var(--bad);text-shadow:0 0 12px rgba(255,107,107,.6);}
.ddbx2-pc-heroL{font-size:12px;font-weight:bold;letter-spacing:.1em;text-transform:uppercase;color:var(--txt-dim);}
.ddbx2-pc-bd{font-size:11px;color:var(--txt-mute);margin-top:3px;}
.ddbx2-pc-gate{font-size:20px;font-weight:900;letter-spacing:.04em;color:var(--coral-text);margin:6px 0;}
.ddbx2-pc-sub{font-size:10px;opacity:.5;margin-top:6px;color:var(--txt-dim);}
.ddbx2-pc-tgts{display:flex;flex-direction:column;gap:5px;margin-top:8px;}
.ddbx2-pc-trow{display:flex;align-items:center;gap:8px;background:rgba(0,0,0,.3);border-radius:8px;padding:4px 9px 4px 5px;text-align:left;}
.ddbx2-pc-trow > img{flex:0 0 28px;width:28px;height:28px;border-radius:50%;object-fit:cover;}
.ddbx2-pc-tmid{flex:1 1 auto;min-width:0;}
.ddbx2-pc-tname{display:block;font-size:13px;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#fff;}
.ddbx2-pc-tbar{position:relative;height:5px;border-radius:3px;background:rgba(255,255,255,.13);overflow:hidden;margin-top:3px;}
.ddbx2-pc-tbar span{display:block;height:100%;border-radius:3px;transition:width .4s ease;}
.ddbx2-pc-tright{flex:0 0 auto;display:flex;align-items:center;gap:6px;font-size:14px;}
.ddbx2-pc-trow .ddbx2-hit{color:var(--good);} .ddbx2-pc-trow .ddbx2-miss{color:var(--bad);}
.ddbx2-pc-trow .ddbx2-pc-conds{margin-top:3px;}
.ddbx-sting{position:fixed;inset:0;z-index:auto;pointer-events:none;overflow:hidden;font-family:'Modesto Condensed','Signika',serif;animation:ddbx-st-fade var(--dur,3500ms) ease forwards;}
@keyframes ddbx-st-fade{0%{opacity:0;}6%{opacity:1;}85%{opacity:1;}100%{opacity:0;}}
.ddbx-sting.persist{animation:ddbx-st-in .5s ease forwards;}
@keyframes ddbx-st-in{0%{opacity:0;}100%{opacity:1;}}
.ddbx-critflash{position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at 50% 45%, color-mix(in srgb,var(--c1) 65%,transparent), transparent 62%);opacity:0;animation:ddbx-critflash 1.1s ease-out;}
@keyframes ddbx-critflash{0%{opacity:0;}12%{opacity:1;}40%{opacity:.25;}60%{opacity:.7;}100%{opacity:0;}}
.lay-orbit .ddbx-sting.crit .ddbx-result{font-size:104px;}
.ddbx-sting.critwin .ddbx-result{text-shadow:0 0 30px var(--gold);}
.ddbx-sting.critfail .ddbx-result{filter:drop-shadow(0 0 26px var(--bad));}
.ddbx-bg{position:absolute;inset:0;background-size:cover;background-position:center;filter:blur(64px) saturate(1.25) brightness(.6);opacity:.42;animation:ddbx-st-zoom var(--dur,3500ms) ease-out forwards;}
@keyframes ddbx-st-zoom{0%{transform:scale(1.32);}100%{transform:scale(1.06);}}
.ddbx-vig{position:absolute;inset:0;background:radial-gradient(ellipse 62% 58% at 50% 50%, color-mix(in srgb, var(--c2) 28%, transparent), rgba(2,2,4,.93) 74%);}
.ddbx-sting.colorbg .ddbx-vig{background:radial-gradient(ellipse 64% 60% at 50% 46%, color-mix(in srgb, var(--c1) 24%, transparent), color-mix(in srgb, var(--c2) 30%, rgba(2,2,4,.96)) 72%);}
.ddbx-radial{position:absolute;left:50%;top:50%;width:80vh;height:80vh;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(circle, color-mix(in srgb, var(--c1) 22%, transparent), transparent 60%);opacity:0;animation:ddbx-rad var(--dur,3500ms) ease forwards;}
@keyframes ddbx-rad{0%{opacity:0;}12%{opacity:1;}85%{opacity:.8;}100%{opacity:0;}}
.ddbx-stage{position:absolute;inset:0;animation:ddbx-rise .7s cubic-bezier(.15,1.2,.4,1);}
@keyframes ddbx-rise{0%{opacity:0;transform:scale(.96);}100%{opacity:1;transform:scale(1);}}
.ddbx-casterwrap{position:absolute;text-align:center;}
.ddbx-caster{display:inline-block;border-radius:50%;background-size:cover;background-position:center;box-shadow:0 0 0 3px var(--c1),0 0 0 9px rgba(0,0,0,.6),0 0 52px var(--c2);animation:ddbx-portin .8s cubic-bezier(.15,1.3,.4,1);}
@keyframes ddbx-portin{0%{opacity:0;transform:scale(.7);}100%{opacity:1;transform:scale(1);}}
.ddbx-cname{display:block;margin-top:12px;font-size:26px;font-weight:bold;letter-spacing:.18em;text-transform:uppercase;color:#fff;text-shadow:0 2px 10px #000,0 0 16px #000;animation:ddbx-textin .8s ease-out .1s both;}
.ddbx-casterport{position:relative;display:inline-block;line-height:0;}
.ddbx-actbadge{position:absolute;right:-4px;bottom:6px;width:70px;height:70px;border-radius:50%;background-size:cover;background-position:center;background-color:#15101c;box-shadow:0 0 0 3px var(--c1),0 0 0 6px rgba(0,0,0,.6),0 0 20px #000b;animation:ddbx-badgein .55s cubic-bezier(.15,1.4,.4,1) .22s both;}
@keyframes ddbx-badgein{0%{opacity:0;transform:scale(.2) rotate(-30deg);}100%{opacity:1;transform:scale(1) rotate(0);}}
.ddbx-strike{position:relative;width:232px;height:232px;border-radius:50%;background-size:cover;background-position:center;background-color:#15101c;box-shadow:0 0 0 4px var(--c1),0 0 0 9px rgba(0,0,0,.5),0 0 60px var(--c1);animation:ddbx-strikein 1s cubic-bezier(.18,1.3,.32,1) both;}
@keyframes ddbx-strikein{0%{opacity:0;transform:translate(-180px,-150px) rotate(-46deg) scale(.5);}55%{opacity:1;transform:translate(0,0) rotate(8deg) scale(1.12);}75%{transform:translate(0,0) rotate(-2deg) scale(.97);}100%{opacity:1;transform:translate(0,0) rotate(0) scale(1);}}
.ddbx-center{position:absolute;text-align:center;}
.ddbx-glow{width:0;height:2px;margin:12px auto 4px;background:linear-gradient(90deg,transparent,var(--c1),transparent);box-shadow:0 0 16px var(--c1);animation:ddbx-glowline .9s cubic-bezier(.2,.8,.3,1) .25s both;}
@keyframes ddbx-glowline{0%{width:0;opacity:0;}40%{opacity:1;}100%{width:62%;opacity:.95;}}
.ddbx-title{font-size:72px;font-weight:900;line-height:1;letter-spacing:.03em;text-transform:uppercase;background:linear-gradient(180deg,#fff 35%,var(--c1));-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 3px 20px var(--c2));animation:ddbx-textin .7s ease-out;}
@keyframes ddbx-textin{0%{opacity:0;transform:translateY(16px);letter-spacing:.2em;}100%{opacity:1;transform:translateY(0);letter-spacing:.03em;}}
.ddbx-total{font-size:92px;font-weight:900;line-height:1;margin-top:16px;background:linear-gradient(180deg,#fff,var(--c1));-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 3px 24px var(--c2));opacity:0;animation:ddbx-reveal .6s cubic-bezier(.2,1.5,.4,1) 1.3s both;}
@keyframes ddbx-reveal{0%{opacity:0;transform:scale(1.5);}60%{opacity:1;}100%{opacity:1;transform:scale(1);}}
.ddbx-result{position:relative;font-size:112px;font-weight:900;line-height:1;letter-spacing:.04em;text-transform:uppercase;background:linear-gradient(180deg,#fff 30%,var(--c1));-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 4px 30px var(--c1));animation:ddbx-punch .65s cubic-bezier(.2,1.5,.4,1);}
@keyframes ddbx-punch{0%{opacity:0;transform:scale(1.6);letter-spacing:.5em;}55%{opacity:1;}100%{transform:scale(1);letter-spacing:.04em;}}
.ddbx-rsub{font-size:24px;letter-spacing:.22em;text-transform:uppercase;color:var(--txt);margin-top:16px;animation:ddbx-textin .7s ease-out .12s both;}
.ddbx-dc{font-size:24px;font-weight:bold;letter-spacing:.18em;text-transform:uppercase;color:var(--c1);margin-top:12px;opacity:0;animation:ddbx-textin .6s ease-out 2.1s both;}
.ddbx-sting.crit .ddbx-result{animation:ddbx-punch .65s cubic-bezier(.2,1.5,.4,1),ddbx-critpulse 1.1s ease-in-out .35s 2;}
@keyframes ddbx-critpulse{0%,100%{filter:drop-shadow(0 0 20px var(--c1));}50%{filter:drop-shadow(0 0 48px var(--c1)) drop-shadow(0 0 18px #fff);}}
.ddbx-burst{position:absolute;left:50%;top:50%;width:380px;height:380px;margin:-190px 0 0 -190px;border-radius:50%;background:radial-gradient(circle,var(--c1),transparent 62%);opacity:0;animation:ddbx-burst .9s ease-out forwards;}
@keyframes ddbx-burst{0%{opacity:0;transform:scale(.3);}25%{opacity:.55;}100%{opacity:0;transform:scale(1.8);}}
.ddbx-tgrp{position:absolute;display:flex;gap:20px;justify-content:center;align-items:center;}
.ddbx-tg{position:relative;border-radius:50%;background-size:cover;background-position:center;box-shadow:0 0 0 3px var(--c1),0 0 18px #000a;animation:ddbx-portin .6s cubic-bezier(.15,1.3,.4,1) both;}
.ddbx-tg.win{box-shadow:0 0 0 5px var(--good),0 0 34px var(--good);}
.ddbx-tg.lose{box-shadow:0 0 0 5px var(--bad),0 0 24px #b33;opacity:.62;filter:grayscale(.35);}
.ddbx-tg-m{position:absolute;right:-6px;bottom:-6px;font-size:24px;background:#000c;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 12px #000;}
.ddbx-tg-n{position:absolute;left:50%;bottom:-32px;transform:translateX(-50%);font-size:26px;font-weight:bold;letter-spacing:.03em;color:#fff;white-space:nowrap;text-shadow:0 2px 6px #000,0 0 10px #000;}
.ddbx-pts{position:absolute;inset:0;overflow:hidden;}
.ddbx-pt{position:absolute;bottom:-12px;border-radius:50%;background:var(--c1);opacity:0;box-shadow:0 0 8px var(--c1);animation-name:ddbx-pt-rise;animation-timing-function:ease-out;animation-fill-mode:forwards;}
.ddbx-pt.spark{background:#fff;box-shadow:0 0 10px #fff,0 0 18px var(--c1);}
@keyframes ddbx-pt-rise{0%{opacity:0;transform:translate(0,0) scale(.6);}15%{opacity:.85;}100%{opacity:0;transform:translate(var(--sway,0),-70vh) scale(1.15);}}
/* Caster (orbit) layout. EVERY element is pinned to the same axis — left:50% + translateX(-50%) of the full-screen
   stage — so the title, caster and targets share one centre line that lands on the scene's true centre (the spot
   the combat carousel marks). The target row is a centred flex row, never an arc, so a single target sits dead under
   the caster and multiple fan out symmetrically. */
.lay-orbit .ddbx-casterwrap{left:50%;top:50%;transform:translate(-50%,-50%);}
.lay-orbit .ddbx-caster{width:208px;height:208px;}
.lay-orbit .ddbx-center{left:0;right:0;top:21vh;}
.lay-orbit .ddbx-title{font-size:54px;}
.lay-orbit .ddbx-result{font-size:88px;}
.lay-orbit .ddbx-total{font-size:64px;margin-top:8px;}
.lay-orbit .ddbx-dc{font-size:24px;margin-top:8px;}
.lay-orbit .ddbx-tgrp{left:50%;right:auto;top:62%;transform:translateX(-50%);display:flex;gap:30px;justify-content:center;align-items:flex-start;}
.ddbx-tex{position:absolute;inset:0;pointer-events:none;opacity:.32;mix-blend-mode:overlay;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");background-size:300px 300px;}
.ddbx-crestbg{position:absolute;inset:0;opacity:.30;animation:ddbx-st-zoom var(--dur,3500ms) ease-out forwards;}
.ddbx-gparts{position:absolute;inset:0;display:flex;flex-wrap:wrap;gap:32px;align-items:center;justify-content:center;padding:20vh 6vw 8vh;}
.ddbx-gp{position:relative;text-align:center;animation:ddbx-portin .6s cubic-bezier(.15,1.3,.4,1) both;}
.ddbx-gp-img{position:relative;width:150px;height:150px;border-radius:50%;background-size:cover;background-position:center;box-shadow:0 0 0 3px var(--c1),0 0 22px #000a;margin:0 auto;}
.ddbx-gp.win .ddbx-gp-img{box-shadow:0 0 0 6px var(--good),0 0 48px var(--good);transform:scale(1.08);}
.ddbx-gp.lose{opacity:.5;filter:grayscale(.45);}
.ddbx-gp-n{font-size:26px;font-weight:bold;color:#fff;margin-top:10px;text-shadow:0 2px 6px #000;}
.ddbx-gval{display:block;font-size:40px;font-weight:900;color:var(--c1);text-shadow:0 2px 10px #000;}
.ddbx-gval.pend{color:#888;}
.ddbx-crown{position:absolute;top:-26px;left:50%;transform:translateX(-50%);font-size:30px;color:var(--gold);text-shadow:0 0 14px #ffb300;animation:ddbx-reveal .6s ease-out .2s both;}
.ddbx-fx{position:absolute;inset:0;pointer-events:none;overflow:hidden;}
.fx-impact,.fx-fire,.fx-cold,.fx-ooze,.fx-heal{animation:ddbx-flash .6s ease-out;}
.fx-impact{background:radial-gradient(circle at 50% 50%, color-mix(in srgb,var(--c1) 45%,transparent), transparent 62%);}
@keyframes ddbx-flash{0%{opacity:0;}18%{opacity:1;}100%{opacity:0;}}
.fx-fire{background:radial-gradient(circle at 50% 82%, color-mix(in srgb,#ff7a18 60%,transparent), transparent 60%);animation:ddbx-flicker .8s ease-out;}
@keyframes ddbx-flicker{0%{opacity:0;}14%{opacity:1;}40%{opacity:.55;}62%{opacity:.95;}100%{opacity:0;}}
.fx-cold{background:radial-gradient(circle,transparent 48%, rgba(150,215,255,.3));box-shadow:inset 0 0 180px 70px rgba(120,200,255,.45);}
.fx-ooze{background:linear-gradient(180deg, color-mix(in srgb,var(--c1) 55%,transparent), transparent 42%);animation:ddbx-flicker .9s ease-out;}
.fx-heal{background:radial-gradient(circle at 50% 50%, rgba(95,208,122,.4), transparent 62%);animation:ddbx-flash .9s ease-out;}
.fx-shock{background:#fff;opacity:0;animation:ddbx-shock .55s steps(1);}
@keyframes ddbx-shock{0%,100%{opacity:0;}8%{opacity:.85;}13%{opacity:0;}22%{opacity:.7;}27%{opacity:0;}}
.fx-slash span{position:absolute;top:-10%;height:120%;width:6px;background:linear-gradient(180deg,transparent,#fff,transparent);box-shadow:0 0 16px #fff,0 0 30px var(--c1);opacity:0;animation:ddbx-slashin .5s ease-out forwards;}
.fx-slash span:nth-child(1){left:32%;animation-delay:0s;} .fx-slash span:nth-child(2){left:50%;animation-delay:.1s;} .fx-slash span:nth-child(3){left:68%;animation-delay:.2s;}
@keyframes ddbx-slashin{0%{opacity:0;transform:rotate(20deg) translateY(-40px) scaleY(.3);}28%{opacity:1;}100%{opacity:0;transform:rotate(20deg) translateY(40px) scaleY(1.1);}}
.fx-pierce{background:repeating-conic-gradient(from 0deg at 50% 50%, transparent 0 15deg, color-mix(in srgb,var(--c1) 55%,transparent) 15deg 17deg);opacity:0;animation:ddbx-pierce .55s ease-out;}
@keyframes ddbx-pierce{0%{opacity:0;transform:scale(.35);}30%{opacity:.9;}100%{opacity:0;transform:scale(1.5);}}
.fx-burst span{position:absolute;left:50%;top:50%;width:40px;height:40px;border-radius:50%;border:6px solid var(--c1);transform:translate(-50%,-50%);opacity:0;animation:ddbx-ring .65s ease-out forwards;}
.fx-burst span:nth-child(2){animation-delay:.13s;}
@keyframes ddbx-ring{0%{opacity:.9;width:30px;height:30px;}100%{opacity:0;width:95vw;height:95vw;}}
/* --- Damage impact: edge flash + punchy number + diagonal slash --- */
.ddbx-vig.hit{background:radial-gradient(ellipse 70% 64% at 50% 50%, transparent 32%, color-mix(in srgb,var(--c2) 30%,transparent) 64%, rgba(2,2,4,.92) 100%);}
.ddbx-flash{position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at 50% 50%, color-mix(in srgb,var(--c1) 55%,transparent), transparent 60%);opacity:0;animation:ddbx-hitflash .5s ease-out;}
@keyframes ddbx-hitflash{0%{opacity:0;}10%{opacity:.95;}100%{opacity:0;}}
.ddbx-impact-art{position:absolute;left:0;right:0;top:13vh;display:flex;justify-content:center;}
.ddbx-impact-readout{position:absolute;left:0;right:0;bottom:15vh;display:flex;flex-direction:column;align-items:center;gap:6px;}
.lay-orbit .ddbx-impact-readout .ddbx-result{font-size:128px;}
.ddbx-impact-readout .ddbx-rsub{margin-top:0;}
.dmgnum{font-size:128px;background:none;-webkit-text-fill-color:#fff;color:#fff;text-shadow:0 4px 14px #000,0 0 6px #000,0 0 30px var(--c1);animation:ddbx-dmgpunch .7s cubic-bezier(.2,1.5,.35,1) .25s both;}
@keyframes ddbx-dmgpunch{0%{opacity:0;transform:scale(2.2);filter:blur(8px);}50%{opacity:1;transform:scale(.94);filter:blur(0);}72%{transform:scale(1.06);}100%{opacity:1;transform:scale(1);}}
.impactwrap .fx-slash{transform:rotate(-24deg) scale(1.5);}
.impactwrap .fx-slash span{width:10px;}
/* --- Screen shake (applied to Foundry's #board) --- */
.ddbx-shake-soft{animation:ddbx-shake-s .4s cubic-bezier(.36,.07,.19,.97);}
.ddbx-shake-med{animation:ddbx-shake-m .5s cubic-bezier(.36,.07,.19,.97);}
.ddbx-shake-hard{animation:ddbx-shake-h .6s cubic-bezier(.36,.07,.19,.97);}
@keyframes ddbx-shake-s{10%,90%{transform:translate(-1px,0);}30%,70%{transform:translate(2px,-1px);}50%{transform:translate(-2px,1px);}}
@keyframes ddbx-shake-m{10%,90%{transform:translate(-3px,1px);}20%,80%{transform:translate(5px,-2px);}40%,60%{transform:translate(-7px,3px);}50%{transform:translate(7px,-3px);}}
@keyframes ddbx-shake-h{10%,90%{transform:translate(-5px,2px) rotate(-.3deg);}20%,80%{transform:translate(9px,-4px) rotate(.4deg);}40%,60%{transform:translate(-13px,6px) rotate(-.5deg);}50%{transform:translate(13px,-6px) rotate(.5deg);}}
/* --- Group Check cinematic --- */
.ddbx-center.gc-head{top:15vh;}
.ddbx-gskill{display:block;font-size:24px;letter-spacing:.08em;text-transform:uppercase;color:var(--skill);margin-top:6px;text-shadow:0 2px 6px #000;}
.ddbx-gskill.pend{color:#8a8a96;}
.ddbx-gparts.revealing .ddbx-gp.win{animation:ddbx-portin .6s cubic-bezier(.15,1.3,.4,1) both, ddbx-winpop .7s ease-out .25s;}
@keyframes ddbx-winpop{0%{transform:scale(1.08);}40%{transform:scale(1.2);}100%{transform:scale(1.08);}}
.ddbx-gparts.revealing .ddbx-gp.lose{opacity:.55;filter:saturate(.6);}
/* --- Group Check cards (GM + public) --- */
.ddbx2-pskill{font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:var(--skill);}
.ddbx2 .ddbx2-rbot{flex-wrap:nowrap;}
.ddbx2 .ddbx2-rbot .ddbx2-cinput{margin-left:auto;flex:0 0 54px;width:54px;text-align:right;}
.ddbx2 .ddbx2-rtop .ddbx2-grp{margin-left:auto;}
.ddbx2 .ddbx2-rtop .ddbx2-grp .ddbx2-cinput{flex:0 0 54px;width:54px;text-align:right;}
.ddbx2-desc{margin-top:8px;border-top:1px solid rgba(255,255,255,.08);padding-top:6px;}
.ddbx2-desc summary{cursor:pointer;font-size:12px;font-weight:bold;letter-spacing:.04em;color:var(--txt-dim);list-style:none;display:flex;align-items:center;gap:6px;}
.ddbx2-desc summary::-webkit-details-marker{display:none;}
.ddbx2-desc summary::marker{content:'';}
.ddbx2-desc[open] summary{margin-bottom:6px;}
.ddbx2-desc-body{font-size:12px;line-height:1.5;color:var(--txt-dim);max-height:280px;overflow:auto;}
.ddbx2-desc-body p{margin:.35em 0;} .ddbx2-desc-body img{max-width:100%;} .ddbx2-desc-body table{width:100%;border-collapse:collapse;} .ddbx2-desc-body td,.ddbx2-desc-body th{border:1px solid rgba(255,255,255,.12);padding:2px 5px;}
.ddbx2-rrow.win{background:rgba(105,215,127,.08);} .ddbx2-rrow.lose{opacity:.7;}
.ddbx2-gsum{margin-top:8px;font-size:13px;color:var(--txt);text-align:center;}
.ddbx2-gsum b{color:#fff;}
.ddbx2-pcg{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-top:8px;}
.ddbx2-pcg-p{position:relative;width:78px;text-align:center;}
.ddbx2-pcg-img{position:relative;width:62px;height:62px;border-radius:50%;background-size:cover;background-position:center;margin:0 auto;box-shadow:0 0 0 2px var(--accent),0 2px 8px #0008;}
.ddbx2-pcg-p.win .ddbx2-pcg-img{box-shadow:0 0 0 3px var(--good),0 0 16px var(--good);}
.ddbx2-pcg-p.lose{opacity:.6;}
.ddbx2-pcg-n{font-size:12px;font-weight:bold;color:#fff;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.ddbx2-pcg-s{font-size:10px;letter-spacing:.04em;text-transform:uppercase;color:var(--skill);min-height:12px;}
.ddbx2-pcg-val{font-size:18px;font-weight:900;color:#fff;}
.ddbx2-pcg-pend{font-size:18px;font-weight:900;color:#888;}
.ddbx2-pcg-crown{position:absolute;top:-12px;left:50%;transform:translateX(-50%);font-size:14px;color:var(--gold);text-shadow:0 0 8px #ffb300;}
.ddbx-conn{position:fixed;left:10px;bottom:10px;z-index:60;display:flex;align-items:center;gap:6px;font:11px/1 Signika,sans-serif;background:rgba(20,20,24,.9);border:1px solid rgba(255,255,255,.15);border-radius:12px;padding:5px 9px;color:#dcdcdc;cursor:pointer;opacity:.8;user-select:none;}
.ddbx-conn:hover{opacity:1;}
.ddbx-conn .dot{width:8px;height:8px;border-radius:50%;background:#888;box-shadow:0 0 7px currentColor;}
.ddbx-conn.ok .dot{background:#69d77f;color:#69d77f;} .ddbx-conn.warn{} .ddbx-conn.warn .dot{background:#ffcf5a;color:#ffcf5a;animation:ddbx-connpulse 1s ease-in-out infinite;} .ddbx-conn.down .dot{background:#ff6b6b;color:#ff6b6b;}
@keyframes ddbx-connpulse{0%,100%{opacity:1;}50%{opacity:.35;}}
`;
function injectStyles() { if (document.getElementById('ddbx2-styles')) return; const el = document.createElement('style'); el.id = 'ddbx2-styles'; el.textContent = STYLES; document.head.appendChild(el); }

/* ------------------------------------------------------------------ helpers */
function esc(s) { return foundry.utils.escapeHTML ? foundry.utils.escapeHTML(String(s)) : String(s); }
// Sanitize a string used inside a CSS url('…') within an HTML style attribute: strip the chars that could break
// out of the quoted url, the style attribute, or into markup. Prevents XSS via image paths in cinematic/chip HTML.
function cleanUrl(s) { return String(s ?? '').replace(/['"<>\\\r\n\t]/g, '').slice(0, 2000); }
// Harden a stinger payload received over the socket (ANY client can emit one) before it reaches innerHTML: coerce
// numbers/booleans, cap + clean strings, sanitize image URLs, bound the targets array. Defense against XSS/abuse.
function sanitizeStinger(p) {
  if (!p || typeof p !== 'object') return null;
  const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };
  const str = (v, n = 120) => (v == null ? '' : String(v).slice(0, n));
  const tri = v => (v === true ? true : v === false ? false : undefined);
  return {
    phase: ['declare', 'result', 'impact'].includes(p.phase) ? p.phase : 'result',
    word: str(p.word), action: str(p.action), who: str(p.who), mode: str(p.mode, 16), tone: str(p.tone, 16), dtype: str(p.dtype, 24), srcLabel: str(p.srcLabel, 24), cue: str(p.cue, 64), color: str(p.color, 32),
    img: cleanUrl(p.img), actorImg: cleanUrl(p.actorImg),
    dc: num(p.dc), total: num(p.total), hue: num(p.hue), artHue: num(p.artHue), avg: num(p.avg),
    heal: !!p.heal, crest: !!p.crest, group: !!p.group, tintArt: !!p.tintArt, reveal: !!p.reveal, pass: p.pass == null ? null : !!p.pass,
    applyIds: Array.isArray(p.applyIds) ? p.applyIds.slice(0, 50).map(x => str(x, 40)) : [],
    targets: Array.isArray(p.targets) ? p.targets.slice(0, 12).map(x => ({ name: str(x?.name, 80), img: cleanUrl(x?.img), mark: str(x?.mark, 16), skill: str(x?.skill, 40), total: num(x?.total), win: tri(x?.win) })) : [],
  };
}
function getTargets() { return Array.from(game.user?.targets ?? []); }
// Tokens targeted by ANY user (targeting is broadcast, so this is consistent on the GM client where rolls land).
function allTargetedTokens() { return (canvas.tokens?.placeables ?? []).filter(t => t.targeted?.size > 0); }
// Player-owned targeted tokens — the basis for an auto group check.
function playerTargetedTokens() { return allTargetedTokens().filter(t => t.actor?.hasPlayerOwner); }
// Serialize roll handling so two near-simultaneous rolls can't each create a duplicate group-check card.
let _rollChain = Promise.resolve();
function enqueueRoll(fn) { _rollChain = _rollChain.then(fn).catch(e => console.error('DDB Roll Cards | roll error', e)); return _rollChain; }
function controlledActors() { return (canvas.tokens?.controlled ?? []).map(t => t.actor).filter(Boolean); }
function applyTargetsList() { if (applyMode === 'selected') return controlledActors(); const tg = getTargets().map(t => t.actor).filter(Boolean); return tg.length ? tg : controlledActors(); }
function getMapping() { try { const m = game.settings.get(NS, 'characterMapping'); if (m && Object.keys(m).length) return m; } catch (e) {} if (game.modules.get(SYNC)?.active) { try { return game.settings.get(SYNC, 'characterMapping') || {}; } catch (e) {} } return {}; }
function mappedActor(entityId) { const m = getMapping(); const id = m[entityId]; return id ? game.actors.get(id) : null; }
function resolveActor(data) { return mappedActor(data.context?.entityId || data.entityId) || (data.context?.name ? game.actors.getName(data.context.name) : null); }
function ddbFormula(roll) { const n = roll?.diceNotation || {}; const parts = (n.set || []).map(s => { const vals = (s.dice || []).map(d => d.dieValue).filter(v => v != null); const note = `${s.count || 1}${s.dieType || ''}`; return vals.length ? `${note} (${vals.join(', ')})` : note; }); const c = n.constant || 0; let f = parts.join(' + '); if (c) f += `${f ? ' + ' : ''}${c}`; return f || String(roll?.result?.total ?? ''); }
// DDB dice broken out for a Dice So Nice animation that shows the exact DDB values.
function ddbDice(roll) { const n = roll?.diceNotation || {}; const sets = (n.set || []).map(s => ({ faces: parseInt(String(s.dieType || '').replace(/\D/g, '')) || 20, values: (s.dice || []).map(d => d.dieValue).filter(v => v != null) })).filter(s => s.values.length); return sets.length ? { sets, mod: n.constant || 0 } : null; }
// Clean dice notation (no rolled values), e.g. "2d12 + 1d6 + 1d100 + 5" — used to label custom rolls that have no action name.
function ddbNotation(roll) { const n = roll?.diceNotation || {}; const parts = (n.set || []).map(s => `${s.count || 1}${s.dieType || ''}`).filter(Boolean); const c = n.constant || 0; let f = parts.join(' + '); if (c) f += `${f ? ' + ' : ''}${c}`; return f; }
function natFace(roll) { const v = roll?.result?.values; if (!Array.isArray(v) || !v.length) return null; if (v.includes(20)) return 20; if (v.length === 1 && v[0] === 1) return 1; return null; }
function findItem(actor, name) { if (!actor?.items || !name) return null; const n = String(name).toLowerCase().trim().replace(/[.\s]+$/, ''); return actor.items.find(i => i.name.toLowerCase().trim().replace(/[.\s]+$/, '') === n) || actor.items.find(i => { const inm = i.name.toLowerCase().trim(); return inm.includes(n) || n.includes(inm); }) || null; }
const ABIL = { str: 'strength', dex: 'dexterity', con: 'constitution', int: 'intelligence', wis: 'wisdom', cha: 'charisma' };
const ABIL_ART = 'https://assets.forge-vtt.com/66aa49fcd530ac71a9d05346/My%20Stuff/UI%20Elements/';
// Thematic hue per ability: str red, dex green, con blue, int cyan, wis yellow, cha magenta.
const ABIL_HUE = { str: 0, dex: 120, con: 215, int: 180, wis: 50, cha: 300 };
function abilityIcon(ab) { return ab && ABIL[ab] ? 'icons/svg/d20-grey.svg' : ''; }
function abilityHue(ab) { return ABIL_HUE[ab] ?? null; }
// CSS filter that recolours a grayscale/B&W image to a target hue (keeps detail, unlike a flat mask).
function recolor(H, bright) { return `grayscale(1) sepia(1) saturate(4) hue-rotate(${Math.round((H || 0) - 45)}deg) brightness(${bright ?? 1})`; }
function hexToHue(hex) { if (!hex) return null; let h = String(hex).trim().replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); if (h.length < 6) return null; const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16); return [r, g, b].some(isNaN) ? null : rgbToHue(r, g, b); }
// The actor's theme colour: a sheet-color flag if present, else the owning player's colour (what tints the sheet).
function actorThemeColor(actor) {
  if (!actor) return null;
  const f = actor.flags || {};
  const c = f.dnd5e?.sheetColor || f.dnd5e?.color || f.core?.sheetColor || actor.system?.details?.color;
  if (c) return (c.css || c);
  try { const owner = game.users?.find(u => !u.isGM && actor.testUserPermission?.(u, 'OWNER')); if (owner?.color) return (owner.color.css || owner.color); } catch (e) {}
  return null;
}
function abilityLabel(ab) { return CONFIG.DND5E?.abilities?.[ab]?.label || (ab ? ab.toUpperCase() : 'Save'); }
function abilityShort(ab) { return (CONFIG.DND5E?.abilities?.[ab]?.abbreviation || ab || 'save').toUpperCase(); }
function titleCase(s) { return String(s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()); }
function defaultMult(result) { return result === 'save' ? 0.5 : 1; }
function defaultHit(t, total) { return (typeof t.ac === 'number') ? (total >= t.ac ? 'hit' : 'miss') : undefined; }
// Effective to-hit = the player's (external D&D Beyond) roll total PLUS any adjustment from effects WE created in
// Foundry (currently weapon corrosion). We never touch the DDB roll — we just fold our own effects into the hit/miss
// math and the number we present. `adjust` is signed (negative = penalty).
function atkEff(a) { return Number(a?.total || 0) + Number(a?.adjust || 0); }
// Sum the attack-roll adjustments from OUR effects on the weapon used for this action. Extensible: today it reads the
// weaponCorrosion stack count; add more of our own effects here as they appear.
function ourAttackAdjust(actor, action) {
  try {
    const weapon = findItem(actor, action); if (!weapon) return { total: 0, label: '' };
    const corr = (weapon.effects?.contents || weapon.effects || []).find(e => e.getFlag?.(NS, 'weaponCorrosion'));
    const stacks = corr?.getFlag?.(NS, 'weaponCorrosion')?.stacks || 0;
    if (stacks > 0) return { total: -stacks, label: `−${stacks} corroded` };
    return { total: 0, label: '' };
  } catch (e) { return { total: 0, label: '' }; }
}
// Blended resistance multiplier for a target across the damage parts (×0 immune / ×½ resist / ×2 vuln).
function resBlend(actor, parts) {
  if (!actor || !parts?.length) return { mult: 1, marks: [] };
  const tr = dmgTraits(actor); let eff = 0, raw = 0; const marks = [];
  for (const p of parts) { const a = p.amount || 0; raw += a; let m = 1; if (tr.imm.has(p.type)) { m = 0; marks.push([p.type, 'imm']); } else if (tr.vul.has(p.type)) { m = 2; marks.push([p.type, 'vul']); } else if (tr.res.has(p.type)) { m = 0.5; marks.push([p.type, 'res']); } eff += a * m; }
  return { mult: raw > 0 ? eff / raw : 1, marks };
}
// Smart default portion = outcome (hit/fail→full, save→half|none, miss→none) × the target's resistance.
// The portion IS the final multiplier; damage is applied as total×portion (no separate resistance pass).
function defaultPortion(o, onSave, actor, parts) {
  const base = (o === 'hit' || o === 'fail') ? 1 : (o === 'save') ? (onSave === 'half' ? 0.5 : 0) : (o === 'miss') ? 0 : 1;
  return base * resBlend(actor, parts).mult;
}
// Conditions are a best-guess only for outcomes that "land" (hit / failed save).
function defaultConds(o, card) { return (o === 'hit' || o === 'fail') ? (card.actionConds || []) : []; }
function condLabel(id) { const e = (CONFIG.statusEffects || []).find(x => x.id === id); return e ? game.i18n.localize(e.name ?? e.label ?? id) : id; }
function condIcon(id) { const e = (CONFIG.statusEffects || []).find(x => x.id === id); return e?.img || e?.icon || ''; }
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
// Enrich an item description for display. dnd5e's own action enrichers ([[/attack]], [[/damage]], [[/check]],
// [[/save]] — what raw SRD monster descriptions are built from) don't resolve in a chat-card context and are
// redundant with our card, so we strip them (keeping real prose); a description that was ONLY enrichers collapses
// to nothing and the section is hidden. Remaining prose / @UUID links / generic [[/r]] rolls still enrich.
async function enrichDesc(html, relativeTo) {
  if (!html) return '';
  let cleaned = String(html).replace(/\[\[\/(?:attack|damage|healing|heal|check|save|skill|tool|item)\b[^\]]*\]\]/gi, ' ');
  cleaned = cleaned.replace(/<p>(?:\s|&nbsp;|\.|,|;)*<\/p>/gi, '').replace(/^(?:\s|&nbsp;|\.|,|;)+$/g, '').trim();
  if (!cleaned) return '';
  try {
    const TE = foundry.applications?.ux?.TextEditor?.implementation || globalThis.TextEditor;
    if (TE?.enrichHTML) return await TE.enrichHTML(cleaned, { secrets: false, async: true, relativeTo, rollData: relativeTo?.getRollData?.() ?? {} });
  } catch (e) {}
  return cleaned;
}
function checkAbilityFromName(name) {
  if (!name) return null; const n = String(name).toLowerCase();
  const abil = CONFIG.DND5E?.abilities ?? {}; for (const [k, v] of Object.entries(abil)) { if (n === k || (v.label && n.includes(v.label.toLowerCase()))) return k; }
  const sk = CONFIG.DND5E?.skills ?? {}; for (const [k, v] of Object.entries(sk)) { if (k === n || (v.label && n.includes(v.label.toLowerCase()))) return v.ability; }
  return null;
}
// Resolve a skill id from free text (a roll's flavor/name) — dnd5e doesn't always expose the skill id in the message
// flag for monster sheet rolls, so we match the skill's label (longest first, so "Sleight of Hand" beats "Hand").
function skillFromText(text) {
  if (!text) return null; const t = String(text).toLowerCase();
  const sk = CONFIG.DND5E?.skills ?? {};
  const hits = Object.entries(sk).filter(([, v]) => { const l = (v.label || '').toLowerCase(); return l && t.includes(l); });
  hits.sort((a, b) => (b[1].label || '').length - (a[1].label || '').length);
  return hits[0]?.[0] || null;
}
// Parse an action's duration into ActiveEffect timing (rounds for combat, seconds for world time). Instantaneous /
// permanent / special → null (those conditions, e.g. a knock-prone, persist until removed, not on a timer).
function parseDuration(item) {
  try {
    const d = item?.system?.duration; if (!d || !d.units) return null;
    const u = String(d.units), v = Math.max(1, Number(d.value) || 1);
    if (['inst', 'instantaneous', 'perm', 'spec', 'disp', ''].includes(u)) return null;
    if (u === 'round' || u === 'turn') return { rounds: v, seconds: v * 6 };
    if (u === 'minute') return { rounds: v * 10, seconds: v * 60 };
    if (u === 'hour') return { rounds: v * 600, seconds: v * 3600 };
    if (u === 'day') return { seconds: v * 86400 };
    return null;
  } catch (e) { return null; }
}
function resolveAction(actor, name) {
  const item = findItem(actor, name); if (!item) return {};
  const acts = Array.from(item.system?.activities ?? []);
  const dmg = acts.find(a => a.damage?.parts?.length); const sv = acts.find(a => a.type === 'save' && a.save);
  const healAct = acts.find(a => a.type === 'heal' || a.healing);
  const parts = dmg?.damage?.parts ?? []; const types = parts[0]?.types ? Array.from(parts[0].types) : (parts[0]?.type ? [parts[0].type] : []);
  // A single damage part listing MULTIPLE types is a player CHOICE (Chromatic Orb: acid/cold/fire/…). Don't default
  // it to the first type (acid) — leave it unset so the card asks for the pick, since the choice drives resistance.
  const typeChoice = (parts.length === 1 && types.length > 1) ? types : null;
  const dcVal = sv ? (sv.save?.dc?.value ?? sv.save?.dc) : null;
  // All damage-part types in order — DDB sends one same-named damage roll per type, accumulated as parts.
  const allTypes = []; for (const a of acts) for (const p of (a.damage?.parts ?? [])) { const t = p.types ? Array.from(p.types)[0] : p.type; if (t) allTypes.push(t); }
  const isHeal = !!healAct || (!allTypes.length && /\bhe(al|aling)\b|regain.*hit points/.test((item.system?.description?.value || '').toLowerCase()) && !dmg);
  const desc = (item.system?.description?.value || '').toLowerCase();
  // On a successful save, does it deal half or no damage? Prefer the activity field, fall back to the text.
  const onSaveRaw = sv?.damage?.onSave ?? sv?.onSave ?? sv?.save?.onSave;
  const saveOnSave = (onSaveRaw === 'half' || /half (as much )?damage|half the damage|half damage/.test(desc)) ? 'half' : 'none';
  return { damageType: typeChoice ? '' : (types[0] || ''), damageTypes: typeChoice ? [] : (allTypes.length ? allTypes : (types[0] ? [types[0]] : [])), typeChoices: typeChoice, isHeal, itemType: item.type, actionType: (dmg || acts[0])?.actionType || '', saveDC: (typeof dcVal === 'number') ? dcVal : null, saveAbility: firstOf(sv?.save?.ability) || null, saveOnSave, actionConds: itemConditions(item, desc), duration: parseDuration(item), img: item.img || '', descHtml: item.system?.description?.value || '' };
}
// --- 5.5E / SRD 5.2 condition lexicon (built by a multi-agent SRD scour, verified vs dnd5e 5.3.3) ----------------
// Each trigger is a SELF-CONTAINED "creature gains this" phrasing (so no separate applies-cue is needed); bare
// condition words are deliberately omitted because they substring-match immunity/removal/definitional text. A match
// only counts if no exclusion phrase sits in the (preceding-biased) window around it. `recurring` carries the
// start-of-turn mechanic for the condition-automation engine (Burning = 1d4 fire).
const COND_EXCLUDE = new RegExp([
  "isn't", "isn’t", "is not", "aren't", "are not", "wasn't", "weren't", "won't be", "will not be",
  "can't be", "cannot", "can not", "couldn't be", "doesn't", "does not", "don't", "do not", "didn't",
  "no longer", "\\bnever\\b", "not have the", "not gain", "not become", "immune", "immunity",
  "resistant to", "resistance to", "advantage on .{0,24}saving throw", "advantage against being",
  "prevents?", "protect(ed|ion|s)?", "warded against", "shielded from", "safe from", "against being",
  "to avoid", "avoids?\\b", "to resist", "resists?\\b", "negates?", "success negates", "on a success",
  "successful sav", "succeeds on", "removes?\\b", "removed", "is cured", "cured of", "cures?\\b",
  "\\bends? the\\b", "\\bends? one\\b", "\\bends? any\\b", "\\bends? all\\b", "to end the", "to end one",
  "ending the", "freed from", "free of the", "free from", "is freed", "is removed", "\\bobjects?\\b",
  "unattended", "nonmagical", "flammable", "inanimate", "untended", "already has the", "no longer has the",
  "while (it|you|the target|a creature) (has|have|is)", "if (it|the target|a creature) (has|have|is)",
  "the following conditions", "immune to all conditions",
].join('|'));
const COND_LEX = {
  blinded: { triggers: ['has the blinded condition', 'gains the blinded condition', 'gain the blinded condition', 'is blinded', 'are blinded', 'becomes blinded', 'become blinded', 'gives you the blinded condition', 'blinded by this spell', 'blinded by the spell', 'blinded for 1 minute', 'blinded for 1 hour', 'knocked blind', 'struck blind', 'stricken blind'] },
  charmed: { triggers: ['gains the charmed condition', 'gain the charmed condition', 'becomes charmed', 'you charm', 'charms the target', 'charms it', 'falls under your charm', "falls under the spell's charm", 'succumbs to the charm', 'charmed for the duration', 'charmed until', 'charmed for 1 minute', 'charmed for 1 hour', 'charmed for 24 hours'] },
  deafened: { triggers: ['becomes deafened', 'become deafened', 'gains the deafened condition', 'gain the deafened condition', 'suffers the deafened condition', 'left deafened', 'rendered deafened', 'deafens', 'struck deafened', 'knocked deafened'] },
  exhaustion: { triggers: ['gain a level of exhaustion', 'gains a level of exhaustion', 'gain one level of exhaustion', 'gains one level of exhaustion', 'gain 1 level of exhaustion', 'gains 1 level of exhaustion', 'gain two levels of exhaustion', 'gains two levels of exhaustion', 'suffer a level of exhaustion', 'suffers a level of exhaustion', 'take a level of exhaustion', 'takes a level of exhaustion', 'another level of exhaustion', 'an additional level of exhaustion', 'gains the exhaustion condition', 'becomes exhausted'] },
  frightened: { triggers: ['becomes frightened', 'become frightened', 'is now frightened', 'frightened of you', 'frightened of the caster', 'frightened of the source', 'frightened until', 'frightened for', 'gains the frightened condition', 'gain the frightened condition', 'subjected to the frightened condition', 'or have the frightened condition', 'or be frightened', 'or become frightened', 'or becomes frightened', 'or is frightened', 'and is frightened', 'and becomes frightened', 'frightens', 'frighten the'] },
  grappled: { triggers: ['becomes grappled', 'become grappled', 'becoming grappled', 'grapples it', 'grapples the target', 'grapples the creature', 'grapples you', 'grappling the target', 'grabs the target', 'seizes the target', 'gains the grappled condition', 'gain the grappled condition', 'subjected to the grappled condition', 'suffers the grappled condition', 'or be grappled', 'or become grappled'] },
  incapacitated: { triggers: ['becomes incapacitated', 'is now incapacitated', 'rendered incapacitated', 'renders it incapacitated', 'renders the target incapacitated', 'left incapacitated', 'leaves it incapacitated', 'knocked incapacitated', 'gains the incapacitated condition', 'gain the incapacitated condition', 'subjects it to the incapacitated condition', 'suffers the incapacitated condition'] },
  invisible: { triggers: ['is invisible', 'are invisible', 'becomes invisible', 'become invisible', 'becoming invisible', 'turns invisible', 'turn invisible', 'turning invisible', 'is now invisible', 'has the invisible condition', 'gains the invisible condition', 'gain the invisible condition', 'with the invisible condition', "you're invisible", 'you are invisible', 'rendered invisible', 'made invisible', 'magically invisible', 'fades into invisibility'] },
  paralyzed: { triggers: ['gains the paralyzed condition', 'gain the paralyzed condition', 'is paralyzed', 'are paralyzed', 'becomes paralyzed', 'become paralyzed', 'is now paralyzed', 'leaves it paralyzed', 'leaving it paralyzed', 'rendered paralyzed', 'left paralyzed', 'or be paralyzed', 'or become paralyzed', 'or have the paralyzed condition', 'or gain the paralyzed condition', 'and is paralyzed', 'and has the paralyzed condition', 'the target has the paralyzed condition until', 'it has the paralyzed condition until'] },
  petrified: { triggers: ['becomes petrified', 'become petrified', 'becoming petrified', 'instantly petrified', 'permanently petrified', 'has the petrified condition', 'gains the petrified condition', 'gain the petrified condition', 'turns to stone', 'turned to stone', 'turned into stone', 'turned into a statue', 'transformed into stone'] },
  poisoned: { triggers: ['gains the poisoned condition', 'gain the poisoned condition', 'has the poisoned condition', 'suffers the poisoned condition', 'subjected to the poisoned condition', 'becomes poisoned', 'become poisoned', 'becoming poisoned', 'is now poisoned', 'remains poisoned'] },
  prone: { triggers: ['is knocked prone', 'are knocked prone', 'knocks it prone', 'knocks the target prone', 'knocks the creature prone', 'you knock the target prone', 'falls prone', 'drops prone', 'is pushed prone', 'is thrown prone', 'is flung prone', 'leaving it prone', 'is now prone', 'becomes prone', 'gains the prone condition'] },
  restrained: { triggers: ['becomes restrained', 'become restrained', 'becoming restrained', 'is now restrained', 'restrain the target', 'restrain the creature', 'restrains the target', 'restrains it', 'gains the restrained condition', 'gain the restrained condition', 'is restrained until', 'grappled and restrained'] },
  stunned: { triggers: ['is stunned', 'are stunned', 'becomes stunned', 'become stunned', 'is now stunned', 'is also stunned', 'gains the stunned condition', 'gain the stunned condition', 'rendered stunned', 'left stunned', 'stunned until', 'stunned for'] },
  unconscious: { triggers: ['gains the unconscious condition', 'becomes unconscious', 'become unconscious', 'falls unconscious', 'fall unconscious', 'falling unconscious', 'passes out', 'loses consciousness', 'lose consciousness'] },
  burning: { triggers: ['gains the burning condition', 'gain the burning condition', 'is now burning', 'now has the burning condition', 'becomes burning', 'starts burning', 'start burning', 'starts to burn', 'begins burning', 'begins to burn', 'the target burns', 'the creature burns', 'target also burns', "also burns for the spell's duration", 'bursts into flame', 'bursts into flames', 'catches fire', 'catch fire', 'catches on fire', 'set on fire', 'sets on fire', 'set ablaze', 'set aflame', 'set alight', 'engulfed in flames', 'engulfed in flame'], recurring: { formula: '1d4', type: 'fire', when: 'turnStart', label: 'Burn' } },
};
function condRecurring(id) { return COND_LEX[id]?.recurring || null; }
// Conditions to auto-suggest: (1) statuses the item's own ActiveEffects grant (trusted), then (2) lexicon triggers
// found in the description — a hit counts only if no exclusion phrase sits in the window around it (preceding-biased,
// so trailing "on a success" / duration clauses don't block a real application). Triggers are matched as literal substrings.
function itemConditions(item, desc) {
  const out = new Set();
  for (const e of (item.effects ?? [])) for (const s of (e.statuses ?? [])) out.add(s); // (1) reliable
  const d = (desc || item.system?.description?.value || '').toLowerCase();
  if (!d) return Array.from(out);
  const defined = new Set((CONFIG.statusEffects || []).map(e => e.id)); // only suggest statuses this system actually has
  for (const [id, entry] of Object.entries(COND_LEX)) {
    if (out.has(id) || !defined.has(id)) continue;
    // Curated synonyms PLUS uniform label templates (the per-condition lists weren't consistent — e.g. "or be
    // poisoned" was missing). Skip exhaustion/burning, whose phrasings are bespoke, not "<label>"-shaped.
    let triggers = entry.triggers;
    if (id !== 'exhaustion' && id !== 'burning') {
      const lbl = condLabel(id).toLowerCase();
      triggers = triggers.concat([`is ${lbl}`, `are ${lbl}`, `becomes ${lbl}`, `become ${lbl}`, `or be ${lbl}`, `or is ${lbl}`, `and is ${lbl}`, `or becomes ${lbl}`, `gains the ${lbl} condition`, `gain the ${lbl} condition`, `has the ${lbl} condition`, `or have the ${lbl} condition`]);
    }
    for (const trig of triggers) {
      let from = 0, idx;
      while ((idx = d.indexOf(trig, from)) !== -1) {
        const win = d.slice(Math.max(0, idx - 60), idx + trig.length + 6);
        if (!COND_EXCLUDE.test(win)) { out.add(id); break; }
        from = idx + trig.length;
      }
      if (out.has(id)) break;
    }
  }
  return Array.from(out);
}
function snapshotTargets(tokens) { return (tokens || getTargets()).map(t => { const a = t.actor, s = a?.system ?? {}; const hp = s.attributes?.hp ?? {}; return { id: t.id, name: a?.name ?? 'Target', img: a?.img || t.document?.texture?.src || 'icons/svg/mystery-man.svg', ac: s.attributes?.ac?.value ?? null, hp: `${hp.value ?? '—'}/${hp.max ?? '—'}${hp.temp ? '+' + hp.temp : ''}`, hpVal: Number(hp.value) || 0, hpMax: Number(hp.max) || 0 }; }); }
// A contested check's win/loss: vs the roller (targeted) or highest-wins (group). Returns 'hit'|'miss'|null.
function contestWin(card, name) {
  const tot = card.gen?.contestResults?.[name]; if (tot == null) return null;
  if (card.gen?.group) { const all = [card.gen.total ?? 0, ...Object.values(card.gen.contestResults)]; return tot >= Math.max(...all) ? 'hit' : 'miss'; }
  return (card.gen.total >= tot) ? 'hit' : 'miss';
}

/* --------------------------------------------------------------- GM card */
// One per-target row shared by attacks & saves: outcome → damage portion → conditions.
function resolveRow(card, t) {
  const isAtk = !!card.atk; const k = tkey(t);
  let outcome, toggles;
  if (isAtk) {
    outcome = card.atk.verdicts?.[k] ?? defaultHit(t, atkEff(card.atk));
    toggles = `<button class="ddbx2-sv ${outcome === 'hit' ? 'on hit' : ''}" data-ddbx="markhit" data-tkey="${esc(k)}" data-v="hit" title="Hit"><i class="fas ${IC.hit}"></i></button>`
      + `<button class="ddbx2-sv ${outcome === 'miss' ? 'on miss' : ''}" data-ddbx="markhit" data-tkey="${esc(k)}" data-v="miss" title="Miss"><i class="fas ${IC.miss}"></i></button>`;
  } else {
    outcome = card.save.results?.[k];
    toggles = `<button class="ddbx2-sv ${outcome === 'fail' ? 'on miss' : ''}" data-ddbx="mark" data-tkey="${esc(k)}" data-v="fail" title="Failed"><i class="fas ${IC.miss}"></i></button>`
      + `<button class="ddbx2-sv ${outcome === 'save' ? 'on hit' : ''}" data-ddbx="mark" data-tkey="${esc(k)}" data-v="save" title="Saved"><i class="fas ${IC.save}"></i></button>`;
  }
  const tg = card.tgt?.[k] || {};
  const actor = targetActor(t);
  const m = (tg.mult ?? defaultPortion(outcome, card.save?.onSave, actor, card.dmg?.parts));
  const pbtn = (val, lbl, ti) => `<button class="ddbx2-sv ${m === val ? 'on dmg' : ''}" data-ddbx="tmult" data-tkey="${esc(k)}" data-mult="${val}" title="${ti}">${lbl}</button>`;
  // Fifth box: the calculated damage after resistances (non-interactable), tinted if resisted/vulnerable/immune.
  const rb = card.dmg ? resBlend(actor, card.dmg.parts) : null;
  const marks = rb?.marks || [];
  const dealt = card.dmg ? Math.floor(dmgTotal(card.dmg) * Math.abs(m)) : 0;
  const heal = m < 0;
  const rkCls = marks.some(x => x[1] === 'vul') ? ' vul' : marks.some(x => x[1] === 'imm') ? ' imm' : marks.some(x => x[1] === 'res') ? ' res' : '';
  const rkTitle = marks.length ? 'after ' + marks.map(([ty, k]) => `${ty} ${k === 'imm' ? 'immunity' : k === 'vul' ? 'vulnerability' : 'resistance'}`).join(', ') : 'calculated damage';
  const calc = `<span class="ddbx2-sv ddbx2-calc${heal ? ' heal' : ''}${rkCls}" title="${rkTitle}">${heal ? '+' : ''}${dealt}</span>`;
  // Portrait stretches the full row height (reaches the bottom of the multiplier row); name + outcome on top,
  // the five equal boxes (-1x / 0x / 1x / 2x / calculated) below.
  return `<div class="ddbx2-rrow"><img class="ddbx2-ravatar tall" src="${t.img}"><div class="ddbx2-rmain">`
    + `<div class="ddbx2-rtop"><span class="ddbx2-tname">${esc(t.name)}</span>`
    + (isAtk ? `<span class="ddbx2-stat">AC ${t.ac ?? '?'}</span>` : '')
    + `<span class="ddbx2-grp">${toggles}</span></div>`
    + `<div class="ddbx2-rbot"><span class="ddbx2-portion">${pbtn(-1, '-1x', 'Heal')}${pbtn(0, '0x', 'No damage')}${pbtn(1, '1x', 'Full')}${pbtn(2, '2x', 'Double')}${calc}</span></div>`
    + `</div></div>`;
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
    // A choose-one-of-N spell (Chromatic Orb) → restrict the picker to its choices and prompt for one (drives resistance).
    const choices = card.dmg?.typeChoices;
    if (Array.isArray(choices) && choices.length > 1) {
      const opts = `<option value="">⚠ choose type</option>` + choices.map(k => `<option value="${k}" ${k === cur ? 'selected' : ''}>${esc(types[k]?.label ?? k)}</option>`).join('');
      return `<select class="ddbx2-dsel-live${cur ? '' : ' ddbx2-needpick'}" data-ddbx-dtype title="Choose the damage type">${opts}</select>`;
    }
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
        const rows = targets.map(t => { const k = tkey(t); const v = card.atk.verdicts?.[k] ?? defaultHit(t, atkEff(card.atk)); return `<div class="ddbx2-trow ddbx2-srow"><img class="ddbx2-timg" src="${t.img}"><span class="ddbx2-tname">${esc(t.name)}</span><span class="ddbx2-stat">AC ${t.ac ?? '?'}</span><span class="ddbx2-grp"><button class="ddbx2-sv ${v === 'hit' ? 'on hit' : ''}" data-ddbx="markhit" data-tkey="${esc(k)}" data-v="hit" title="Hit"><i class="fas ${IC.hit}"></i></button><button class="ddbx2-sv ${v === 'miss' ? 'on miss' : ''}" data-ddbx="markhit" data-tkey="${esc(k)}" data-v="miss" title="Miss"><i class="fas ${IC.miss}"></i></button></span>${reactionBtn(card, t, k, v)}</div>`; }).join('');
        extra = rows + (card.atk.confirmed ? `<div class="ddbx2-resolved"><i class="fas ${IC.hit}"></i> Hits confirmed<button class="ddbx2-undo" data-ddbx="reopenhits" title="Re-open"><i class="fas ${IC.reopen}"></i></button></div>` : `<div class="ddbx2-bar inline"><button data-ddbx="confirmhits"><i class="fas ${IC.hit}"></i> Confirm hits</button></div>`);
      } else {
        extra = card.atk.verdict
          ? `<div class="ddbx2-resolved" style="color:${card.atk.verdict === 'hit' ? 'var(--good)' : 'var(--bad)'};"><i class="fas ${card.atk.verdict === 'hit' ? IC.hit : IC.miss}"></i> ${card.atk.verdict === 'hit' ? 'Hit' : 'Miss'} confirmed<button class="ddbx2-undo" data-ddbx="reverdict" title="Undo"><i class="fas ${IC.reopen}"></i></button></div>`
          : `<div class="ddbx2-bar inline"><button data-ddbx="verdict" data-v="hit"><i class="fas ${IC.hit}"></i> Hit</button><button data-ddbx="verdict" data-v="miss"><i class="fas ${IC.miss}"></i> Miss</button></div>`;
      }
    }
    // No damage yet (native card suppressed) → offer a Roll-damage button that rolls the item's damage and folds it in.
    const dmgBtn = !card.dmg ? `<div class="ddbx2-bar inline"><button data-ddbx="rolldamage"><i class="fas ${IC.dmg}"></i> Roll damage</button></div>` : '';
    // If one of our own effects (weapon corrosion) adjusts the roll, show "rolled → effective" so the verdict reads true.
    const adjNote = card.atk.adjust ? `<div class="ddbx2-adjnote" style="font-size:11px;opacity:.85;margin-top:1px">${card.atk.total} <span style="color:var(--bad)">${esc(card.atk.adjLabel || (card.atk.adjust < 0 ? '' : '+') + card.atk.adjust)}</span> → <b>${atkEff(card.atk)}</b> to hit</div>` : '';
    atkSec = `<div class="ddbx2-sec"><div class="ddbx2-lbl"><i class="fas ${IC.d20}"></i> To Hit ${adv}</div><div class="ddbx2-num${cls}">${card.atk.total}</div>${adjNote}${extra}${dmgBtn}</div>`;
  }
  // --- Damage / Healing (+ unified resolve panel) ---
  let dmgSec = '';
  if (card.dmg) {
    const total = dmgTotal(card.dmg);
    const gate = card.save ? `DC ${card.save.dc} ${esc(abilityLabel(card.save.ability))} Save · ` : '';
    const word = card.heal ? 'Healing' : 'Damage';
    const ic = card.heal ? IC.hp : card.save ? IC.save : IC.dmg;
    const lbl = `<div class="ddbx2-lbl"><i class="fas ${ic}"></i> ${gate}${word} ${card.heal ? '' : dtypeTag()}</div>`;
    let body;
    if (resolve) {
      if (card.applied) {
        body = `<div class="ddbx2-resolved"><i class="fas ${IC.hit}"></i> ${esc(card.audit || 'Applied.')}</div><div class="ddbx2-bar inline"><button data-ddbx="reopenall"><i class="fas ${IC.reopen}"></i> Undo</button></div>`;
      } else {
        const rows = targets.map(t => resolveRow(card, t)).join('');
        // Lead action: Roll all (save) or Confirm hits (attack).
        const lead = card.save
          ? `<div class="ddbx2-bar inline"><button data-ddbx="rollallsaves"><i class="fas ${IC.d20}"></i> Roll all saves</button></div>`
          : card.atk?.confirmed
            ? `<div class="ddbx2-resolved"><i class="fas ${IC.hit}"></i> Hits confirmed<button class="ddbx2-undo" data-ddbx="reopenhits" title="Re-open"><i class="fas ${IC.reopen}"></i></button></div>`
            : `<div class="ddbx2-bar inline"><button data-ddbx="confirmhits"><i class="fas ${IC.hit}"></i> Confirm hits</button></div>`;
        // Status condition: pick one + when it lands (rides along with Apply all). Null default; two equal dropdowns.
        const effs = (CONFIG.statusEffects || []).filter(e => e.id);
        const condId = card.condId || '';
        const condOpts = `<option value="">Condition</option>` + effs.map(e => `<option value="${e.id}" ${e.id === condId ? 'selected' : ''}>${esc(game.i18n.localize(e.name ?? e.label ?? e.id))}</option>`).join('');
        const gl = card.save ? { dmg: 'failed', safe: 'saved' } : { dmg: 'hit', safe: 'miss' };
        const when = card.condWhen || 'all';
        const whenOpts = `<option value="dmg" ${when === 'dmg' ? 'selected' : ''}>On ${gl.dmg}</option><option value="safe" ${when === 'safe' ? 'selected' : ''}>On ${gl.safe}</option><option value="all" ${when === 'all' ? 'selected' : ''}>On all</option>`;
        const condSec = `<div class="ddbx2-condsec2"><select class="ddbx2-dsel ddbx2-condpick">${condOpts}</select><select class="ddbx2-dsel ddbx2-condwhen">${whenOpts}</select></div>`;
        body = `${rows}${lead}${condSec}<div class="ddbx2-bar inline"><button data-ddbx="applyall"><i class="fas ${IC.dmg}"></i> Apply all</button></div>`;
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
    if (hasT) {
      // Contested check. Each target rolls the chosen skill (NPCs auto via Roll all; players awaited / entered
      // by hand). Group contests keep results hidden until the GM reveals.
      const group = !!card.gen.group, hidden = group && card.gen.hidden;
      const sk = CONFIG.DND5E?.skills || {}, ab = CONFIG.DND5E?.abilities || {};
      const optsFor = (cur) => `<option value="">— skill —</option><optgroup label="Skills">${Object.entries(sk).map(([k, v]) => `<option value="skill:${k}" ${cur === 'skill:' + k ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</optgroup>`
        + `<optgroup label="Ability checks">${Object.entries(ab).map(([k, v]) => `<option value="abil:${k}" ${cur === 'abil:' + k ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</optgroup>`;
      if (group) {
        // Group Check: every targeted player is equal; the skill each rolled comes from their own DDB roll.
        // Two modes — Average (the party's mean, rounded up) or Contest (winners/losers). Hidden until the GM reveals.
        const o = groupOutcome(card);
        const mode = card.gen.mode || 'check';
        const modeBtns = `<div class="ddbx2-mode"><button data-ddbx="gmode" data-mode="check" class="${mode === 'check' ? 'active' : ''}" title="Party average (round up)">Average</button><button data-ddbx="gmode" data-mode="contest" class="${mode === 'contest' ? 'active' : ''}" title="Highest wins (or all who beat the DC)">Contest</button></div>`;
        const dcRow = `<div class="ddbx2-dcrow">${[5, 10, 15, 20, 25, 30].map(d => `<button class="ddbx2-sv ${card.gen.dc === d ? 'on dmg' : ''}" data-ddbx="gdc" data-dc="${d}" title="DC ${d} (click again to clear)">${d}</button>`).join('')}</div>`;
        const rows = targets.map(t => {
          const tot = card.gen.contestResults?.[t.name];
          const skill = card.gen.partLabels?.[t.name];
          const m = hidden ? null : groupMark(card, t.name);
          const mark = m === 'win' ? `<span class="ddbx2-hit"><i class="fas ${IC.hit}"></i></span>` : m === 'lose' ? `<span class="ddbx2-miss"><i class="fas ${IC.miss}"></i></span>` : '';
          const skillLine = `<span class="ddbx2-pskill">${skill ? esc(skill) : '<i class="fas fa-hourglass-half"></i> waiting…'}</span>`;
          const input = `<input class="ddbx2-cinput" type="number" data-ddbx-cinput data-tname="${esc(t.name)}" value="${tot != null ? tot : ''}" placeholder="—">`;
          return `<div class="ddbx2-rrow${m ? ' ' + m : ''}"><img class="ddbx2-ravatar" src="${t.img}"><div class="ddbx2-rmain"><div class="ddbx2-rtop"><span class="ddbx2-tname">${esc(t.name)}</span>${mark}</div><div class="ddbx2-rbot">${skillLine}${input}</div></div></div>`;
        }).join('');
        const inN = targets.filter(t => card.gen.contestResults?.[t.name] != null).length;
        const summary = !hidden ? (o.mode === 'check'
          ? `<div class="ddbx2-gsum">Average <b>${o.avg ?? '—'}</b>${o.dc != null ? ` vs DC ${o.dc} — <b style="color:${o.pass ? 'var(--good)' : 'var(--bad)'}">${o.pass ? 'Success' : 'Failure'}</b>` : ''}</div>`
          : `<div class="ddbx2-gsum">${o.dc != null ? 'Passed' : 'Winner'}: <b>${[...o.winners].map(esc).join(', ') || '—'}</b>${o.dc != null ? ` vs DC ${o.dc}` : ''}</div>`) : '';
        const bar = hidden
          ? `<div class="ddbx2-bar inline"><span class="ddbx2-wait"><i class="fas fa-hourglass-half"></i> ${inN}/${targets.length} rolled</span><button data-ddbx="revealcontest"><i class="fas ${IC.hit}"></i> Reveal</button><button class="ddbx2-cancel" data-ddbx="cancelgroup"><i class="fas ${IC.miss}"></i> Cancel</button></div>`
          : `<div class="ddbx2-resolved"><i class="fas ${IC.hit}"></i> Revealed<button class="ddbx2-undo" data-ddbx="hidecontest" title="Undo — hide again"><i class="fas ${IC.reopen}"></i></button></div>`;
        genSec = `<div class="ddbx2-sec"><div class="ddbx2-lbl"><i class="fas ${IC.d20}"></i> ${mode === 'check' ? 'Party average (round up)' : 'Contest — highest wins'}</div>${modeBtns}${dcRow}${rows}${summary}${bar}</div>`;
      } else {
        const rows = targets.map(t => {
          const tot = card.gen.contestResults?.[t.name];
          const w = contestWin(card, t.name);
          const mark = (w === 'hit' || w === 'miss') ? `<span class="ddbx2-${w === 'hit' ? 'hit' : 'miss'}"><i class="fas ${w === 'hit' ? IC.hit : IC.miss}"></i></span>` : '';
          const input = `<input class="ddbx2-cinput" type="number" data-ddbx-cinput data-tname="${esc(t.name)}" value="${tot != null ? tot : ''}" placeholder="—">`;
          return `<div class="ddbx2-rrow"><img class="ddbx2-ravatar" src="${t.img}"><div class="ddbx2-rmain"><div class="ddbx2-rtop"><span class="ddbx2-tname">${esc(t.name)}</span>${mark}<span class="ddbx2-grp">${input}</span></div></div></div>`;
        }).join('');
        genSec = `<div class="ddbx2-sec"><div class="ddbx2-lbl"><i class="fas ${IC.d20}"></i> ${esc(card.gen.label || 'Roll')} · contested</div><div class="ddbx2-num${gcls}" data-ddbx="editnum" title="Click to edit the roll">${card.gen.total}</div>`
          + `<div class="ddbx2-condsec"><span>vs</span><select class="ddbx2-dsel ddbx2-contestpick" data-ddbx="contestskill">${optsFor(card.gen.contestSkill || '')}</select></div>${rows}<div class="ddbx2-bar inline"><button data-ddbx="rollallcontest"><i class="fas ${IC.d20}"></i> Roll NPCs</button></div></div>`;
      }
    } else {
      // Optional DC: pick one and it resolves success/failure (and shows on the card + cinematic for context).
      const dcRow = `<div class="ddbx2-dcrow">${[5, 10, 15, 20, 25, 30].map(d => `<button class="ddbx2-sv ${card.gen.dc === d ? 'on dmg' : ''}" data-ddbx="checkdc" data-dc="${d}" title="DC ${d}">${d}</button>`).join('')}</div>`;
      const genBar = card.gen.verdict
        ? `<div class="ddbx2-resolved" style="color:${card.gen.verdict === 'success' ? 'var(--good)' : 'var(--bad)'};"><i class="fas ${card.gen.verdict === 'success' ? IC.hit : IC.miss}"></i> ${card.gen.verdict === 'success' ? 'Success' : 'Failure'}${card.gen.dc ? ` vs DC ${card.gen.dc}` : ''}<button class="ddbx2-undo" data-ddbx="regen" title="Undo"><i class="fas ${IC.reopen}"></i></button></div>`
        : `<div class="ddbx2-bar inline"><button data-ddbx="genverdict" data-v="success"><i class="fas ${IC.hit}"></i> Success</button><button data-ddbx="genverdict" data-v="fail"><i class="fas ${IC.miss}"></i> Failure</button></div>`;
      genSec = `<div class="ddbx2-sec"><div class="ddbx2-lbl"><i class="fas ${IC.d20}"></i> ${esc(card.gen.label || 'Roll')}</div><div class="ddbx2-num${gcls}">${card.gen.total}</div>${dcRow}${genBar}${legResBtn(card)}</div>`;
    }
  }
  // The old utility footer (save / condition / reactions) is gone: Apply-all becomes Undo, conditions live in the
  // per-card dropdowns, and saves appear inline when relevant.
  const titleIcon = card.heal ? IC.hp : card.atk ? 'fa-crosshairs' : card.save ? IC.save : card.dmg ? IC.dmg : IC.d20;
  const actTitle = card.gen?.group ? 'Group Check' : card.action;
  const descSec = card.desc ? `<details class="ddbx2-desc"><summary><i class="fas fa-scroll"></i> Description</summary><div class="ddbx2-desc-body">${card.desc}</div></details>` : '';
  return `<div class="ddbx2"><div class="ddbx2-act"><i class="fas ${titleIcon}"></i> ${esc(actTitle)}</div>${atkSec}${saveSec}${dmgSec}${genSec}${descSec}</div>`;
}

/* --------------------------------------------------------------- player card */
// Group Check player card: portraits + the skill each rolled. Values + winners stay hidden until the GM reveals.
function publicGroupCard(pub) {
  const hidden = !!pub.gen.hidden;
  const o = hidden ? null : groupOutcome(pub);
  const accent = 'hsl(265 70% 45% / .28)';
  const chips = (pub.targets || []).map(t => {
    const tot = pub.gen.contestResults?.[t.name];
    const skill = pub.gen.partLabels?.[t.name];
    const m = hidden ? null : groupMark(pub, t.name);
    const win = m === 'win', lose = m === 'lose';
    const val = hidden ? '<span class="ddbx2-pcg-pend">…</span>' : (tot != null ? `<span class="ddbx2-pcg-val">${tot}</span>` : '<span class="ddbx2-pcg-pend">—</span>');
    const crown = win ? `<span class="ddbx2-pcg-crown"><i class="fas fa-crown"></i></span>` : '';
    return `<div class="ddbx2-pcg-p${win ? ' win' : lose ? ' lose' : ''}"><div class="ddbx2-pcg-img" style="background-image:url('${t.img}')">${crown}</div><div class="ddbx2-pcg-n">${esc(t.name)}</div><div class="ddbx2-pcg-s">${skill ? esc(skill) : ''}</div>${val}</div>`;
  }).join('');
  let head;
  if (hidden) head = `<div class="ddbx2-pc-name">Group Check</div><div class="ddbx2-pc-ctx">awaiting the party…</div>`;
  else if (o.mode === 'check') head = `<div class="ddbx2-pc-name">Group Check</div><div class="ddbx2-pc-hero gen">${o.avg ?? '—'}</div><div class="ddbx2-pc-heroL">party average${o.dc != null ? ` vs DC ${o.dc}` : ''}</div>${o.dc != null ? `<div class="ddbx2-pc-ctx ${o.pass ? 'ddbx2-pc-hit' : 'ddbx2-pc-miss'}">${o.pass ? 'Success' : 'Failure'}</div>` : ''}`;
  else head = `<div class="ddbx2-pc-name">Group Contest</div><div class="ddbx2-pc-ctx ddbx2-pc-hit">${o.dc != null ? 'Passed' : 'Winner'}: ${[...o.winners].map(esc).join(', ') || '—'}</div>`;
  return `<div class="ddbx2-pc" style="--accent:${accent}"><div class="ddbx2-pc-wm" style="background-color:hsl(265 60% 55%);-webkit-mask:url('${WM_IMG}') center/62% no-repeat;mask:url('${WM_IMG}') center/62% no-repeat;"></div><div class="ddbx2-pc-body">${head}<div class="ddbx2-pcg">${chips}</div></div></div>`;
}
// Layout C with a phase flip: the d20 to-hit is the hero (blue) until damage lands, then damage becomes the
// hero (orange) and the to-hit drops to small print. Multi-type damage = combined hero total + breakdown.
function publicCard(pub) {
  if (pub.gen?.group) return publicGroupCard(pub);
  const dmgReady = pub.dmg && (!pub.save || pub.revealed);
  const heroMode = dmgReady ? 'dmg' : pub.atk ? 'atk' : pub.gen ? 'gen' : pub.save ? 'save' : null;
  const nat = pub.atk?.nat ?? pub.gen?.nat ?? null;
  const genHue = abilityHue(pub.gen?.ability ?? (heroMode === 'save' ? pub.save?.ability : null));
  const tint = heroMode === 'dmg' ? (pub.heal ? 'var(--good)' : 'var(--coral)') : (genHue != null && !pub.verdict) ? `hsl(${genHue} 70% 60%)` : nat === 20 ? 'var(--good)' : nat === 1 ? 'var(--bad)' : 'var(--info)';
  const accent = heroMode === 'dmg' ? (pub.heal ? 'rgba(95,208,122,.26)' : 'rgba(196,93,49,.30)') : (genHue != null) ? `hsl(${genHue} 70% 45% / .28)` : heroMode === 'save' ? 'rgba(196,93,49,.22)' : 'rgba(60,110,170,.28)';
  let wm;
  if (pub.gen) {
    // Checks use the decorative crest (same as the Group Check card), tinted by the ability hue — not the flat grey d20.
    const ch = genHue != null ? genHue : 265;
    wm = `<div class="ddbx2-pc-wm" style="background-color:hsl(${ch} 60% 55%);-webkit-mask:url('${WM_IMG}') center/62% no-repeat;mask:url('${WM_IMG}') center/62% no-repeat;"></div>`;
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
    const adjL = pub.atk.adjust ? `<div class="ddbx2-pc-bd">${pub.atk.total} ${esc(pub.atk.adjLabel || pub.atk.adjust)} → ${atkEff(pub.atk)}</div>` : '';
    body = `${badge}<div class="ddbx2-pc-hero atk${cls}">${pub.atk.total}</div><div class="ddbx2-pc-heroL">to hit</div>${adjL}`;
  } else if (heroMode === 'gen') {
    const v = pub.verdict; const cls = v ? (v === 'success' ? ' good' : ' bad') : (nat === 20 ? ' crit' : nat === 1 ? ' fumble' : '');
    const style = (!v && !cls && genHue != null) ? ` style="color:hsl(${genHue} 72% 64%)"` : '';
    // Check/save name prominent above the total; verdict + DC for context below.
    const name = esc(pub.gen.label || 'Roll');
    const ctx = v ? `${v === 'success' ? 'Success' : 'Failure'}${pub.gen.dc ? ` vs DC ${pub.gen.dc}` : ''}` : (pub.gen.dc ? `DC ${pub.gen.dc}` : '');
    const ctxCls = v ? (v === 'success' ? 'ddbx2-pc-hit' : 'ddbx2-pc-miss') : '';
    body = `<div class="ddbx2-pc-name">${name}</div><div class="ddbx2-pc-hero gen${cls}"${style}>${pub.gen.total}</div>${ctx ? `<div class="ddbx2-pc-ctx ${ctxCls}">${esc(ctx)}</div>` : ''}`;
  } else if (heroMode === 'save') {
    body = `<div class="ddbx2-pc-gate">DC ${pub.save.dc} ${esc(abilityLabel(pub.save.ability))} save</div>`;
  }
  let tgts = '';
  if (pub.targets?.length) {
    tgts = `<div class="ddbx2-pc-tgts">${pub.targets.map(t => {
      let mark = ''; const k = tkey(t);
      const sr = pub.save?.results?.[k];
      const av = pub.atk?.confirmed ? pub.atk.verdicts?.[k] : null;
      const gShown = pub.gen && !pub.gen.hidden; const gc = gShown ? pub.gen.contestResults?.[t.name] : null; const gw = gShown ? contestWin(pub, t.name) : null;
      if (sr) mark = sr === 'fail' ? `<span class="ddbx2-miss"><i class="fas ${IC.miss}"></i></span>` : `<span class="ddbx2-hit"><i class="fas ${IC.save}"></i></span>`;
      else if (av === 'hit' || av === 'miss') mark = `<span class="ddbx2-${av}"><i class="fas ${av === 'hit' ? IC.hit : IC.miss}"></i></span>`;
      else if (gc != null && gw) mark = `<span class="ddbx2-${gw === 'hit' ? 'hit' : 'miss'}">${gc} <i class="fas ${gw === 'hit' ? IC.hit : IC.miss}"></i></span>`;
      else if (pub.verdict === 'hit' || pub.verdict === 'miss') mark = `<span class="ddbx2-${pub.verdict}"><i class="fas ${pub.verdict === 'hit' ? IC.hit : IC.miss}"></i></span>`;
      // Conditions ACTUALLY applied to this target (auto-suggested + GM-chosen), recorded by Apply-all — shown as
      // little icon chips so players see e.g. "Burning" land, not just the damage.
      const conds = pub.applied ? (pub.appliedDetail?.[k]?.added || []) : [];
      const condTxt = conds.length ? `<span class="ddbx2-pc-conds">${conds.map(c => { const ic = condIcon(c); return `<span class="ddbx2-pc-condchip">${ic ? `<img src="${ic}">` : ''}${esc(condLabel(c))}</span>`; }).join('')}</span>` : '';
      // Player-facing: show a proportional HP bar but NEVER the exact numbers — no HP value/max and no damage-taken
      // amount (those are GM-only). The bar fill still conveys roughly how hurt the target is.
      const det = pub.appliedDetail?.[k];
      const hv = det ? det.hpVal : t.hpVal, hm = det ? det.hpMax : t.hpMax;
      const pct = hm > 0 ? Math.max(0, Math.min(100, Math.round((hv / hm) * 100))) : null;
      const hpc = pct == null ? '' : pct > 50 ? 'var(--good)' : pct > 25 ? 'var(--gold)' : 'var(--bad)';
      const barRow = pct != null ? `<div class="ddbx2-pc-tbar"><span style="width:${pct}%;background:${hpc}"></span></div>` : '';
      return `<div class="ddbx2-pc-trow"><img src="${t.img}"><div class="ddbx2-pc-tmid"><span class="ddbx2-pc-tname">${esc(t.name)}</span>${barRow}${condTxt}</div><div class="ddbx2-pc-tright">${mark}</div></div>`;
    }).join('')}</div>`;
  }
  // Bottom line (after the targets): once damage is the hero, lead with "21 to hit" then the formula results.
  const bits = [];
  if (pub.atk && dmgReady) bits.push(`${pub.atk.total} to hit`);
  if (pub.save && dmgReady) bits.push(`DC ${pub.save.dc} ${esc(abilityLabel(pub.save.ability))} save`);
  if (pub.formula) bits.push(esc(pub.formula));
  const sub = bits.join(' &nbsp;|&nbsp; ');
  // Checks/saves show their name as the prominent hero label, so skip the top title to avoid duplication.
  const title = (heroMode === 'gen') ? '' : `<div class="ddbx2-pc-title">${esc(pub.action)}</div>`;
  const descSec = pub.desc ? `<details class="ddbx2-desc"><summary><i class="fas fa-scroll"></i> Description</summary><div class="ddbx2-desc-body">${pub.desc}</div></details>` : '';
  return `<div class="ddbx2-pc" style="--accent:${accent}">${wm}<div class="ddbx2-pc-body">${title}${body}${tgts}${sub ? `<div class="ddbx2-pc-sub">${sub}</div>` : ''}${descSec}</div></div></div>`;
}

function speakerFor(c) { return c.actorId ? ChatMessage.getSpeaker({ actor: game.actors.get(c.actorId) }) : { alias: c.who }; }
async function postGM(card) { return ChatMessage.create({ speaker: speakerFor(card), whisper: ChatMessage.getWhisperRecipients('GM').map(u => u.id), content: buildCard(card), flags: { [NS]: { card } } }); }
async function postPublic(pub) { return ChatMessage.create({ speaker: speakerFor(pub), content: publicCard(pub) }); }
// Compact GM-whispered chat line for passive/recurring feature outcomes (regeneration, suppression, …) — a
// persistent, glanceable audit trail so these automations aren't just transient toasts the GM can miss. Carries
// only flags[NS] (no flags.dnd5e) so the native-card interceptor leaves it alone.
async function postFeatureLog(actor, icon, text, tone) {
  try {
    if (!game.user?.isGM) return;
    const img = actor?.img || actor?.prototypeToken?.texture?.src || 'icons/svg/aura.svg';
    const c = tone === 'heal' ? '#34d399' : tone === 'bad' ? '#f87171' : '#cbb26a';
    const html = `<div class="ddbx-flog" style="display:flex;align-items:center;gap:8px;padding:3px 2px">`
      + `<img src="${cleanUrl(img)}" width="30" height="30" style="border:none;border-radius:5px;flex:0 0 auto;object-fit:cover" onerror="this.style.display='none'">`
      + `<div style="line-height:1.25"><b style="color:${c}">${esc(icon)} ${esc(actor?.name || '')}</b><br><span style="opacity:.85">${esc(text)}</span></div></div>`;
    return await ChatMessage.create({ speaker: { alias: actor?.name || 'Feature' }, whisper: ChatMessage.getWhisperRecipients('GM').map(u => u.id), content: html, flags: { [NS]: { featureLog: true } } });
  } catch (e) { console.warn('DDB Roll Cards | postFeatureLog', e); }
}
async function pushRec(rec) { const gm = rec.gmId && game.messages.get(rec.gmId); const pub = rec.pubId && game.messages.get(rec.pubId); if (gm) await gm.update({ content: buildCard(rec.gm), flags: { [NS]: { card: rec.gm } } }); if (pub) await pub.update({ content: publicCard(rec.pub) }); }
// Damage parts helpers (a hit can carry several types, e.g. slashing + fire).
function dmgTotal(d) { return d ? (d.total ?? (d.parts || []).reduce((s, p) => s + (p.amount || 0), 0)) : 0; }
function dmgTypeLabel(d) { const ts = (d?.parts || []).map(p => p.type).filter(Boolean); return ts.length ? Array.from(new Set(ts)).join(' + ') : ''; }
function dmgApplyParts(d) { return (d?.parts || []).map(p => ({ value: Math.abs(p.amount || 0), type: p.type || undefined })); }

/* --------------------------------------------------------------- present */
async function present(p) {
  const _descItem = p.actorId ? findItem(game.actors.get(p.actorId), p.action) : null;
  const base = { who: p.who, action: p.action, actorId: p.actorId, saveDC: p.saveDC, saveAbility: p.saveAbility || null, img: p.img, actionConds: p.actionConds || [], duration: p.duration || null, heal: !!p.heal, desc: await enrichDesc(p.desc, _descItem) };
  const key = `${p.actorId || p.who}|${(p.action || '').toLowerCase()}`;
  const pubT = (p.targets || []).map(t => ({ id: t.id, name: t.name, img: t.img }));
  if (p.kind === 'to hit') {
    // Fold our own Foundry-side effects (weapon corrosion) into the to-hit math we present — the DDB roll is untouched.
    const _atkActor = p.actorId ? game.actors.get(p.actorId) : actorByName(p.who);
    const _adj = ourAttackAdjust(_atkActor, p.action);
    const gm = { ...base, targets: p.targets, dice: p.dice, atk: { total: p.total, nat: p.nat, kind: p.advKind || '', adjust: _adj.total, adjLabel: _adj.label } };
    const pub = { ...base, formula: p.formula, targets: pubT, dice: p.dice, atk: { total: p.total, nat: p.nat, adjust: _adj.total, adjLabel: _adj.label } };
    const gmMsg = await postGM(gm); const pubMsg = await postPublic(pub);
    // Unique per-attack-instance id. cardKey() is stable per (actor|weapon), so on-hit features that dedupe on it
    // would only fire ONCE per weapon ever (no stacking corrosion / no repeat retaliation). The gm message id is
    // fresh for every attack roll, so dedupe on it instead.
    gm.iid = gmMsg?.id || `${key}|${Date.now()}`;
    actionCards.set(key, { gmId: gmMsg?.id, pubId: pubMsg?.id, gm, pub, ts: Date.now() });
    dsnRoll(p.dice); announce(gm, 'declare');
    // Auto-approve hits after a beat (lets the declaration + dice play first).
    if (p.targets?.length && game.settings.get(NS, 'autoConfirmHits')) setTimeout(() => { try { confirmHits(gm, gmMsg); } catch (e) {} }, autoDelayMs());
    return;
  }
  if (p.kind === 'damage') {
    const rec = actionCards.get(key);
    const recent = rec && (Date.now() - rec.ts) < 60000;
    const expected = Math.max(1, (p.damageTypes?.length || 1));
    // Case A — fold the first damage into a pending attack card (To Hit already posted, no damage yet).
    if (recent && rec.gm?.atk && !rec.gm.dmg) {
      const part = { amount: p.total, type: p.damageTypes?.[0] || p.dtype || '' };
      const dmg = { parts: [part], total: p.total, typeChoices: p.typeChoices || null };
      rec.gm.dmg = foundry.utils.deepClone(dmg); rec.pub.dmg = foundry.utils.deepClone(dmg); rec.gm.dmgDice = p.dice; rec.pub.dmgDice = p.dice; rec.ts = Date.now();
      dsnRoll(p.dice); await pushRec(rec); scheduleAutoApply(rec.gm); return;
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
    const dmg = { parts: [part], total: p.total, typeChoices: p.typeChoices || null };
    const isSave = (p.saveDC != null) && p.saveAbility;
    const gm = { ...base, targets: p.targets, dmg: foundry.utils.deepClone(dmg), dmgDice: p.dice };
    const pub = { ...base, formula: p.formula, targets: pubT, dmg: foundry.utils.deepClone(dmg), dmgDice: p.dice };
    if (isSave) { gm.save = { dc: p.saveDC, ability: p.saveAbility, onSave: p.saveOnSave, results: {} }; gm.revealed = false; pub.save = { dc: p.saveDC, ability: p.saveAbility, onSave: p.saveOnSave, results: {} }; pub.revealed = false; }
    const gmMsg = await postGM(gm); const pubMsg = await postPublic(pub);
    actionCards.set(key, { gmId: gmMsg?.id, pubId: pubMsg?.id, gm, pub, ts: Date.now() });
    dsnRoll(p.dice); announce(gm, 'declare');
    return;
  }
  // In a group check the initiating roller is one of the participants — pre-fill their own result + the skill they rolled.
  const inGroup = p.group && (p.targets || []).some(t => t.name === p.who);
  const seed = inGroup ? { [p.who]: p.total } : {};
  const skillSeed = inGroup ? { [p.who]: p.genLabel } : {};
  // Group checks default to "check" (the party's average); the GM can flip to "contest" on the card.
  const genBase = { total: p.total, nat: p.nat, label: p.genLabel, ability: p.ability, isSave: !!p.genSave, group: !!p.group, mode: p.group ? 'check' : undefined, hidden: !!p.group };
  const mk = () => ({ ...genBase, contestResults: { ...seed }, partLabels: { ...skillSeed } });
  const gm = { ...base, targets: p.targets, dice: p.dice, ability: p.ability, gen: mk() };
  const pub = { ...base, formula: p.formula, targets: pubT, ability: p.ability, gen: mk() };
  const gmMsg = await postGM(gm); const pubMsg = await postPublic(pub);
  actionCards.set(key, { gmId: gmMsg?.id, pubId: pubMsg?.id, gm, pub, ts: Date.now() });
  // Register the active group check so subsequent participant rolls fold into THIS card (no new cards).
  if (p.group) groupContest = { key, names: new Set((p.targets || []).map(t => t.name)), ts: Date.now() };
  dsnRoll(p.dice); announce(gm, 'declare');
}

// Returns the live record for the active group contest, or null (also clears stale/closed contests).
function groupCardActive() {
  if (!groupContest) return null;
  if (Date.now() - groupContest.ts > 600000) { groupContest = null; return null; }
  const rec = actionCards.get(groupContest.key);
  if (!rec?.gm?.gen?.group) { groupContest = null; return null; }
  return rec;
}
// Route an incoming check roll into the active group check instead of spawning a new card. Returns true if consumed.
// Records the SKILL each participant actually rolled. Never auto-reveals — the GM confirms (so they can edit values first).
async function foldGroupRoll(name, total, dice, skillLabel) {
  const rec = groupCardActive(); if (!rec) return false;
  if (!groupContest.names.has(name)) return false;
  setContestResult(rec.gm, name, total); setPartLabel(rec.gm, name, skillLabel); groupContest.ts = Date.now();
  if (dice) dsnRoll(dice);
  const msg = rec.gmId ? game.messages.get(rec.gmId) : null;
  await syncCards(rec.gm, msg);
  announce(rec.gm, 'declare', { cue: 'groupprogress' }); // a participant's roll landed — soft tick, hold the result until reveal
  return true;
}
async function cancelGroupContest(card, message) {
  const rec = actionCards.get(cardKey(card));
  try { if (message) await message.delete(); } catch (e) {}
  try { if (rec?.pubId) await game.messages.get(rec.pubId)?.delete(); } catch (e) {}
  if (rec) actionCards.delete(cardKey(card));
  if (groupContest && groupContest.key === cardKey(card)) groupContest = null;
  try { hideStinger(); } catch (e) {}
}

// A D&D Beyond initiative roll → drop the roller straight onto the combat tracker (create a combat if needed). GM-side.
async function addInitiative(actor, total) {
  if (!actor || !game.user?.isGM) return;
  let combat = game.combat ?? game.combats?.active ?? null;
  if (!combat) { try { combat = await CONFIG.Combat.documentClass.create({ scene: canvas.scene?.id ?? null }); await combat?.activate?.(); } catch (e) { console.warn('DDB Roll Cards | create combat', e); } }
  if (!combat) return;
  const sceneId = canvas.scene?.id;
  const tok = canvas.tokens?.placeables?.find(t => t.actor?.id === actor.id);
  let cbt = combat.combatants.find(c => (tok && c.tokenId === tok.id) || c.actorId === actor.id);
  if (!cbt) {
    try { const made = await combat.createEmbeddedDocuments('Combatant', [tok ? { tokenId: tok.id, sceneId, actorId: actor.id } : { actorId: actor.id, sceneId }]); cbt = made?.[0]; } catch (e) { console.warn('DDB Roll Cards | add combatant', e); }
  }
  if (cbt) { try { await combat.setInitiative(cbt.id, Number(total)); ui.notifications?.info?.(`DDB: ${actor.name} → initiative ${total}.`); } catch (e) { console.warn('DDB Roll Cards | setInitiative', e); } }
}
async function renderRoll(data) {
  const roll = data.rolls?.[0] || {};
  const rt = (roll.rollType || '').toLowerCase();
  const action = data.action || 'Roll';
  const actor = resolveActor(data);
  // Initiative → combat tracker (no card; the tracker is the output).
  if (game.settings.get(NS, 'initFromDDB') && (rt === 'initiative' || /\binitiative\b/i.test(action))) {
    await addInitiative(actor, Number(roll.result?.total ?? 0)); return;
  }
  const ctx = resolveAction(actor, action);
  const kind = rt === 'to hit' ? 'to hit' : (rt === 'damage' || rt === 'heal' || ctx.isHeal) ? 'damage' : 'other';
  const checkAb = kind === 'other' ? checkAbilityFromName(action) : null;
  const img = checkAb ? abilityIcon(checkAb) : ctx.img;
  const rollerName = actor?.name || data.context?.name || 'D&D Beyond';
  // Custom DDB rolls carry no real action name ("Custom") — label them with the dice notation instead (e.g.
  // "2d12 + 1d6 + 1d100"), which flows through to the card title, the cinematic, and the group-check chip.
  const isCustom = rt === 'custom' || /^custom$/i.test(String(action || ''));
  const genLabel = (isCustom && ddbNotation(roll)) ? ddbNotation(roll) : titleCase(action || rt);
  const isSave = rt === 'save';
  // Cavril: Wayfarer — surface skill checks so the travel HUD can auto-fill a
  // claimed role's roll (matched by actor + skill). Emitted before any early
  // return (concentration / group-fold) so it always fires for a check.
  if (kind === 'other' && !isSave) {
    try {
      Hooks.callAll('ddb-roll-cards.roll', {
        actorId: actor?.id ?? null, who: rollerName, action,
        skillId: (typeof skillFromText === 'function' ? skillFromText(action) : null),
        total: Number(roll.result?.total ?? 0), nat: natFace(roll), rollId: data.rollId ?? null
      });
    } catch (e) { console.warn('DDB Roll Cards | wayfarer hook failed', e); }
  }
  // A player's CON save resolving a pending concentration check → break-on-fail, consume it (no card).
  if (isSave && (checkAb === 'con' || checkAb == null) && await resolveConcentration(rollerName, Number(roll.result?.total ?? 0), ddbDice(roll))) return;
  // A check from a participant of an active group check folds into that card. Saves are the roller's OWN result
  // (e.g. a concentration CON save) — never a contest and never folded, even if a monster is still targeted.
  if (kind === 'other' && !isSave && await foldGroupRoll(rollerName, Number(roll.result?.total ?? 0), ddbDice(roll), genLabel)) return;
  // Auto group check: a CHECK (not a save) rolled while MORE THAN ONE player-owned token is targeted (by anyone).
  let targets = isSave ? [] : snapshotTargets(), group = false;
  if (kind === 'other' && !isSave) {
    const pt = playerTargetedTokens();
    if (pt.length > 1) {
      let toks = pt;
      // Make sure the roller is included even if they didn't target their own token.
      if (actor?.hasPlayerOwner && !pt.some(t => t.actor?.id === actor.id)) { const own = canvas.tokens?.placeables?.find(t => t.actor?.id === actor.id); if (own) toks = [own, ...pt]; }
      targets = snapshotTargets(toks); group = true;
    }
  }
  const saveLabel = (isSave && checkAb) ? `${abilityLabel(checkAb)} Save` : genLabel;
  return present({ who: rollerName, action, actorId: actor?.id || null, saveDC: ctx.saveDC, saveAbility: ctx.saveAbility, saveOnSave: ctx.saveOnSave, actionConds: ctx.actionConds, duration: ctx.duration, heal: ctx.isHeal || rt === 'heal', ability: checkAb, genSave: isSave, group, img, kind, total: Number(roll.result?.total ?? 0), nat: natFace(roll), dtype: ctx.damageType, damageTypes: ctx.damageTypes, typeChoices: ctx.typeChoices, dice: ddbDice(roll), advKind: roll.rollKind || '', targets, formula: ddbFormula(roll), genLabel: saveLabel, desc: ctx.descHtml });
}

function targetsFromFlags(ft) {
  if (!ft?.length) return snapshotTargets();
  return ft.map(t => { let a = null; try { a = fromUuidSync(t.uuid); } catch (e) {} const actor = a?.actor || a; const hp = actor?.system?.attributes?.hp; return { id: a?.id ?? null, name: t.name, img: actor?.img || t.img || 'icons/svg/mystery-man.svg', ac: t.ac ?? actor?.system?.attributes?.ac?.value ?? null, hp: hp ? `${hp.value ?? '—'}/${hp.max ?? '—'}${hp.temp ? '+' + hp.temp : ''}` : '—/—', hpVal: Number(hp?.value) || 0, hpMax: Number(hp?.max) || 0 }; });
}
function renderLocalMessage(message, keepNative) {
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
  // dnd5e monster sheet rolls often omit roll.skill, so fall back to matching the skill name in the flavor.
  const skillId = r.skill || ((rtype === 'skill' || kind === 'other') ? skillFromText(message.flavor || action) : null);
  let ability = r.ability || null;
  if (!ability && skillId) ability = CONFIG.DND5E?.skills?.[skillId]?.ability;
  if (!ability && r.tool) ability = CONFIG.DND5E?.tools?.[r.tool]?.ability || 'int';
  if (!ability && kind === 'other') ability = checkAbilityFromName(action);
  const checkLabel = skillId ? (CONFIG.DND5E?.skills?.[skillId]?.label || action)
    : (rtype === 'save' && ability) ? `${abilityLabel(ability)} Saving Throw`
    : (rtype === 'ability' || rtype === 'check') && ability ? `${abilityLabel(ability)} Check`
    : (rtype === 'skill') ? ((message.flavor || '').split(' - ')[0].trim() || 'Skill Check')
    : titleCase(rtype || action);
  const img = (kind === 'other' && ability) ? abilityIcon(ability) : (ctx.img || item?.img || '');
  // A local check from a group-check participant folds into the active card (with the skill rolled) instead of a new one.
  if (kind === 'other' && groupCardActive() && groupContest?.names.has(who)) { try { if (!keepNative && game.dice3d) game.dice3d.showForRoll(roll, game.user, true); } catch (e) {} foldGroupRoll(who, Number(roll.total ?? 0), null, checkLabel); return; }
  // We normally cancel the native message, so trigger Dice So Nice ourselves for the real local roll (attacks/damage).
  // BUT when "Keep native cards for the GM" is on the native message survives and animates its OWN dice — showing them
  // again here would double the dice in Dice So Nice, so skip it in that case.
  try { if (!keepNative && game.dice3d && (kind === 'to hit' || kind === 'damage')) game.dice3d.showForRoll(roll, game.user, true); } catch (e) {}
  const args = { who, action, actorId: actor?.id || null, saveDC: ctx.saveDC, saveAbility: ctx.saveAbility, saveOnSave: ctx.saveOnSave, actionConds: ctx.actionConds, duration: ctx.duration, heal: ctx.isHeal || rtype === 'heal', ability: (kind === 'other') ? ability : null, genSave: rtype === 'save', img, kind, total: Number(roll.total ?? 0), nat, dtype: ctx.damageType, damageTypes: ctx.damageTypes, typeChoices: ctx.typeChoices, dice: null, advKind: '', targets: targetsFromFlags(f.targets), formula: roll.formula, genLabel: kind === 'other' ? checkLabel : (rtype || action), desc: ctx.descHtml || (item?.system?.description?.value || '') };
  enqueueRoll(() => present(args));
}

/* ----------------------------------------------------------- actions */
async function applyHealing(actor, amount) { const hp = actor.system.attributes.hp; await actor.update({ 'system.attributes.hp.value': Math.min(hp.max ?? Infinity, (hp.value || 0) + Math.abs(amount)) }); }
async function manualDamage(actor, amount) { const hp = foundry.utils.deepClone(actor.system.attributes.hp); let rem = Math.abs(amount), temp = hp.temp || 0; const ab = Math.min(temp, rem); temp -= ab; rem -= ab; await actor.update({ 'system.attributes.hp.temp': temp, 'system.attributes.hp.value': Math.max(0, (hp.value || 0) - rem) }); }
async function applyMult(card, mult, message) {
  const dmg = card?.dmg; if (!dmg) return;
  const list = applyTargetsList(); if (!list.length) { ui.notifications.warn(`DDB: ${applyMode} no token(s).`); return; }
  const heal = !!card.heal; const parts = dmgApplyParts(dmg); const applied = []; const stateRows = [];
  for (const a of list) {
    const hpWas = Number(a.system?.attributes?.hp?.value) || 0;
    const amt = heal ? Math.floor(dmgTotal(dmg) * Math.abs(mult)) : ((targetEstimate(a, dmg.parts, mult)?.dmg) ?? Math.floor(dmgTotal(dmg) * Math.abs(mult)));
    try { if (heal) await applyHealing(a, amt); else if (typeof a.applyDamage === 'function') await a.applyDamage(parts, { multiplier: mult }); else await (mult < 0 ? applyHealing : manualDamage)(a, amt); } catch (e) { console.error(e); }
    applied.push({ id: a.id, amt, mult, heal });
    if (!heal && mult > 0 && amt) noteDmg(a, dmgTypeOf(dmg)); // for Regeneration suppression
    if (!heal && mult > 0 && amt && hpWas > 0 && (Number(a.system?.attributes?.hp?.value) || 0) <= 0) await undeadFortitude(a, amt, dmgTypeOf(dmg), card.atk?.nat === 20);
    const hp = a.system?.attributes?.hp ?? {}; stateRows.push({ actor: a, oldHp: hpWas, newHp: Number(hp.value) || 0, max: Number(hp.max) || 0 });
  }
  const n = Math.floor(dmgTotal(dmg) * Math.abs(mult)); const tl = dmgTypeLabel(dmg);
  const resolved = heal ? `${n} healing` : (mult < 0 ? `${n} healing` : `${n}${mult !== 1 ? ` (×${mult})` : ''}${tl ? ' ' + tl : ' dmg'}`);
  dmg.resolved = resolved; dmg.applied = applied;
  const rec = actionCards.get(cardKey(card));
  if (rec?.gm?.dmg) { rec.gm.dmg.resolved = resolved; rec.gm.dmg.applied = applied; }
  if (message) { try { await message.update({ content: buildCard(card), flags: { [NS]: { card } } }); } catch (e) {} }
  if (mult !== 0) { announce(card, 'impact'); if (mult > 0 && !heal) list.forEach((a, i) => { const ap = applied[i]; if (ap?.amt) maybeConcentration(a, ap.amt); }); } // cinematic + concentration checks
  runAutoStates(stateRows); // bloodied/down/dead per token + one worst-case cinematic
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
  if (v === 'hit') { featureRetaliation(card); featureWeaponCorrosion(card); } // single-target hit → retaliation + weapon corrosion
  if (rec?.pubId) { const pm = game.messages.get(rec.pubId); if (pm && rec.pub) { try { await pm.update({ content: publicCard(rec.pub) }); return; } catch (e) {} } }
  if (v) await postPublic({ who: card.who, action: card.action, actorId: card.actorId, img: card.img, verdict: v, targets: (card.targets || []).map(t => ({ id: t.id, name: t.name, img: t.img })) });
}
async function changeDtype(card, newType, message) {
  if (!card.dmg?.parts?.length) return;
  const set = (d) => { if (d?.parts?.[0]) d.parts[0].type = newType || ''; };
  set(card.dmg);
  const rec = actionCards.get(cardKey(card)); if (rec) { set(rec.gm?.dmg); set(rec.pub?.dmg); }
  if (message) { try { await message.update({ content: buildCard(card), flags: { [NS]: { card } } }); } catch (e) {} }
  if (rec?.pubId) { const pm = game.messages.get(rec.pubId); if (pm && rec.pub) try { await pm.update({ content: publicCard(rec.pub) }); } catch (e) {} }
  if (newType) scheduleAutoApply(rec?.gm || card); // a now-resolved choice can resume paused auto-apply
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
// Reactions that a HIT target can spend to raise its AC for this one attack (re-resolving hit→miss). Shield is the
// spell (+5 AC); Parry is a feature (+N AC vs one melee attack, N parsed from its text). Matched by item name on the target.
const REACTIONS_AC = [{ match: 'shield', label: 'Shield', bonus: 5 }, { match: 'parry', label: 'Parry', bonus: null }];
// Only count items whose activation is actually a REACTION — this excludes a physical "Shield" worn as equipment
// (which would otherwise match by name) while keeping the Shield spell and Parry feature.
function isReactionItem(it) {
  if (it.system?.activation?.type === 'reaction') return true;
  for (const a of Array.from(it.system?.activities ?? [])) if (a.activation?.type === 'reaction') return true;
  return false;
}
function targetReaction(actor) {
  if (!actor) return null;
  for (const r of REACTIONS_AC) {
    const it = (actor.items || []).find(i => (i.name || '').toLowerCase().includes(r.match) && isReactionItem(i));
    if (!it) continue;
    let bonus = r.bonus;
    if (bonus == null) { const m = (it.system?.description?.value || '').toLowerCase().match(/adds?\s+\+?(\d+)\s+to its ac|\+(\d+)\s+to its ac/); bonus = Number(m?.[1] ?? m?.[2]) || 2; }
    return { label: r.label, bonus, item: it.name };
  }
  return null;
}
// The ⚡ reaction control for a hit target's row: a button to spend it, or (once spent) the result + an undo.
function reactionBtn(card, t, k, outcome) {
  if (!card.atk || outcome !== 'hit') return '';
  const done = card.atk.reactions?.[k];
  if (done) return `<span class="ddbx2-react${done.result === 'miss' ? ' miss' : ''}" title="${esc(done.label)} +${done.bonus} AC → ${done.newAC}">⚡ ${esc(done.label)} ${done.result === 'miss' ? '→ miss' : '→ still hits'}<button class="ddbx2-undo" data-ddbx="unreact" data-tkey="${esc(k)}" title="Undo reaction"><i class="fas ${IC.reopen}"></i></button></span>`;
  const r = targetReaction(targetActor(t)); if (!r) return '';
  return `<button class="ddbx2-sv react" data-ddbx="react" data-tkey="${esc(k)}" title="${esc(r.label)} (+${r.bonus} AC) — re-resolve this hit">⚡ ${esc(r.label)}</button>`;
}
// Spend a target's reaction: raise its AC by the reaction bonus and re-resolve THIS attack's hit/miss for it. If it
// flips to a miss, pull back any on-hit rider conditions we'd applied to that target (it was never actually hit).
async function applyReaction(card, k, message) {
  try {
    if (!card.atk) return;
    const t = (card.targets || []).find(x => tkey(x) === k); if (!t) return;
    const r = targetReaction(targetActor(t)); if (!r) return;
    const newAC = (Number(t.ac) || 0) + r.bonus;
    const hits = atkEff(card.atk) >= newAC; const v = hits ? 'hit' : 'miss';
    setAtkVerdict(card, k, v);
    const rec = actionCards.get(cardKey(card));
    const set = (c) => { if (c?.atk) { c.atk.reactions = c.atk.reactions || {}; c.atk.reactions[k] = { label: r.label, bonus: r.bonus, result: v, newAC }; } };
    set(card); if (rec) { set(rec.gm); set(rec.pub); }
    if (!hits && card.atk.riders?.[k]?.length) { // missed after all → undo the rider conditions
      const a = targetActor(t);
      for (const cid of card.atk.riders[k]) { try { if (a?.statuses?.has?.(cid)) await a.toggleStatusEffect?.(cid, { active: false }); } catch (e) {} }
      const clr = (c) => { if (c?.atk?.riders) delete c.atk.riders[k]; }; clr(card); if (rec) { clr(rec.gm); clr(rec.pub); }
    }
    await syncCards(card, message);
    postFeatureLog(targetActor(t), '⚡', `${r.label} (+${r.bonus} AC → ${newAC}) vs ${card.action}: ${hits ? 'still hits' : 'attack MISSES'}.`, hits ? 'bad' : 'heal');
  } catch (e) { console.warn('DDB Roll Cards | applyReaction', e); }
}
async function undoReaction(card, k, message) {
  try {
    const rec = actionCards.get(cardKey(card));
    const clr = (c) => { if (c?.atk?.reactions) delete c.atk.reactions[k]; }; clr(card); if (rec) { clr(rec.gm); clr(rec.pub); }
    const t = (card.targets || []).find(x => tkey(x) === k);
    if (t) setAtkVerdict(card, k, defaultHit(t, atkEff(card.atk)) || 'miss');
    await syncCards(card, message);
  } catch (e) { console.warn('DDB Roll Cards | undoReaction', e); }
}
// Auto-confirm delay (shared by auto-approve hits and auto-apply damage).
function autoDelayMs() { let s = 2; try { const v = Number(game.settings.get(NS, 'autoConfirmDelay')); if (v >= 0) s = v; } catch (e) {} return Math.round(s * 1000); }
// A required GM input is still open (e.g. a Chromatic-Orb damage type not yet picked) — automation must wait for it.
function needsChoice(card) { return !!(card?.dmg?.typeChoices?.length) && !(card.dmg.parts?.[0]?.type); }
// If 'Auto-apply damage' is on and the card is ready (hits confirmed / saves in) AND no choice is pending, Apply-all after the delay.
function scheduleAutoApply(card) {
  try {
    if (!game.settings.get(NS, 'autoConfirmDamage')) return;
    if (!card?.dmg || card.applied) return;
    const ready = card.atk ? card.atk.confirmed : card.save ? Object.keys(card.save.results || {}).length > 0 : true;
    if (!ready || needsChoice(card)) return; // pending damage-type choice pauses auto-apply until the GM picks
    const key = cardKey(card);
    setTimeout(() => { try { const rec = actionCards.get(key); const c = rec?.gm || card; const m = rec?.gmId ? game.messages.get(rec.gmId) : null; if (c?.dmg && !c.applied && !needsChoice(c)) applyAll(c, m); } catch (e) {} }, autoDelayMs());
  } catch (e) {}
}
async function confirmHits(card, message) {
  if (!card.atk) return;
  for (const t of (card.targets || [])) { const k = tkey(t); if (!card.atk.verdicts?.[k]) setAtkVerdict(card, k, defaultHit(t, atkEff(card.atk)) || 'miss'); }
  const set = (c) => { if (c?.atk) c.atk.confirmed = true; };
  set(card); const rec = actionCards.get(cardKey(card)); if (rec) { set(rec.gm); set(rec.pub); }
  await syncCards(card, message);
  announce(card, 'result');
  featureRetaliation(card); // monsters with on-being-hit retaliation strike the attacker back
  featureWeaponCorrosion(card); // Corrosive Form etc. corrode the nonmagical weapon that hit them
  await featureOnHitRiders(card, message); // apply on-hit rider conditions (Grappled/Prone/Poisoned…) — await so state settles before auto-apply
  await syncCards(card, message); // re-sync so the rider audit shows
  scheduleAutoApply(card);
}
async function reopenHits(card, message) {
  await clearOnHitRiders(card); // pull back any rider conditions we applied on the hit
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
// Legendary Resistance: a monster that fails a save may spend one use (N/Day) to succeed instead. This is POST-roll,
// so unlike advantage-granting traits we CAN automate it — a button on the monster's save card flips it to success
// and consumes a use (the feature's native limited-uses if configured, otherwise a per-actor flag parsed from "N/Day").
function legResFeat(actor) { return (actor?.items ? Array.from(actor.items) : []).find(it => /legendary resistance/i.test(it.name || '')); }
function legResLeft(actor) {
  const feat = legResFeat(actor); if (!feat) return { feat: null, left: 0 };
  const u = feat.system?.uses ?? {}; const max = Number(u.max) || 0;
  if (max > 0) return { feat, left: Math.max(0, Number(u.value ?? (max - (Number(u.spent) || 0))) || 0), native: true, spent: Number(u.spent) || 0 };
  const m = `${feat.name} ${feat.system?.description?.value || ''}`.match(/(\d+)\s*(?:\/|per\s+)\s*day|(\d+)\s*times/i);
  const cap = Number(m?.[1] ?? m?.[2]) || 3; let used = 0; try { used = Number(actor.getFlag(NS, 'legResUsed')) || 0; } catch (e) {}
  return { feat, left: Math.max(0, cap - used), native: false, cap, used };
}
async function useLegRes(actor) {
  const st = legResLeft(actor); if (!st.feat || st.left <= 0) return false;
  try {
    if (st.native) await st.feat.update({ 'system.uses.spent': st.spent + 1 });
    else await actor.setFlag(NS, 'legResUsed', (st.used || 0) + 1);
    return true;
  } catch (e) { console.warn('DDB Roll Cards | useLegRes', e); return false; }
}
// The ⚡ button on a monster's (failed) save card — only when the roller has Legendary Resistance with uses left.
function legResBtn(card) {
  try {
    if (!card?.gen?.isSave || card.gen.verdict === 'success') return '';
    const actor = card.actorId ? game.actors.get(card.actorId) : null; if (!actor) return '';
    const st = legResLeft(actor); if (!st.feat || st.left <= 0) return '';
    return `<div class="ddbx2-bar inline"><button class="ddbx-legres" data-ddbx="legres" title="Spend Legendary Resistance to turn this save into a success"><i class="fas fa-shield-halved"></i> Legendary Resistance (${st.left} left)</button></div>`;
  } catch (e) { return ''; }
}
async function useLegendaryResistance(card, message) {
  try {
    const actor = card.actorId ? game.actors.get(card.actorId) : null; if (!actor) return;
    if (!(await useLegRes(actor))) return;
    await setGenVerdict(card, 'success', message);
    postFeatureLog(actor, '🛡️', `Legendary Resistance — ${card.gen?.label || 'the save'} succeeds (${legResLeft(actor).left} left).`, 'heal');
  } catch (e) { console.warn('DDB Roll Cards | useLegendaryResistance', e); }
}
async function setGenVerdict(card, v, message) {
  const set = (c) => { if (c?.gen) { if (v) c.gen.verdict = v; else { delete c.gen.verdict; delete c.gen.dc; } } };
  set(card); const rec = actionCards.get(cardKey(card));
  if (rec) { set(rec.gm); set(rec.pub); if (rec.pub) { if (v) rec.pub.verdict = v; else delete rec.pub.verdict; } }
  await syncCards(card, message);
  if (v) announce(card, 'result');
}
// Pick a DC for a check: resolves success/failure vs the total and reveals the DC on the card + cinematic.
async function setCheckDC(card, dc, message) {
  const v = (card.gen?.total ?? 0) >= dc ? 'success' : 'fail';
  const set = (c) => { if (c?.gen) { c.gen.dc = dc; c.gen.verdict = v; } };
  set(card); const rec = actionCards.get(cardKey(card));
  if (rec) { set(rec.gm); set(rec.pub); if (rec.pub) rec.pub.verdict = v; }
  await syncCards(card, message);
  announce(card, 'result');
}
function actorByName(name) { return canvas.tokens?.placeables?.find(t => t.actor?.name === name)?.actor || game.actors.getName(name) || null; }
// Unique per-target key (token id when we have it, name as fallback) so duplicate-named tokens don't collide in the
// per-target maps. targetActor resolves the EXACT token's actor by id (not "first token with that name").
function tkey(t) { return String((t && t.id != null && t.id !== '') ? t.id : (t?.name ?? '')); }
function targetActor(t) {
  if (t?.id) { const tok = canvas.tokens?.placeables?.find(x => x.id === t.id); if (tok?.actor) return tok.actor; }
  return actorByName(t?.name);
}
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
async function rollOneSave(nameOrActor, ab) {
  // Accept either a name (legacy callers: concentration, undead fortitude) or a resolved
  // actor object (target loops, so duplicate-named tokens roll their OWN save bonus).
  const actor = (nameOrActor && typeof nameOrActor === 'object') ? nameOrActor : actorByName(nameOrActor); if (!actor) return null;
  try {
    const res = actor.rollSavingThrow ? await actor.rollSavingThrow({ ability: ab }, { configure: false }, { create: false }) : await actor.rollAbilitySave?.(ab, { fastForward: true, chatMessage: false });
    const roll = Array.isArray(res) ? res[0] : res;
    try { if (game.dice3d && roll) game.dice3d.showForRoll(roll, game.user, true); } catch (e) {}
    return roll?.total ?? roll?.rolls?.[0]?.total ?? null;
  } catch (e) { console.error('DDB Roll Cards | rollOneSave', e); return null; }
}
// Roll the matched Foundry item's damage and fold it straight into this attack card (for NPCs / manual rolls now
// that the native ATTACK/DAMAGE card is hidden). We build the Roll ourselves from the activity's damage parts —
// dnd5e's activity.rollDamage() wants a real UI click event and throws when called headless.
// Roll ONE damage/heal formula. Damage crits go through dnd5e's native DamageRoll so the SYSTEM owns the crit math —
// dice doubling, the "Maximize Critical Dice" + "Multiply Modifiers" settings, and any activity crit-bonus damage —
// instead of a naive regex dice-double. Falls back to a plain doubled Roll if DamageRoll is unavailable or errors.
async function rollDamageFormula(formula, rollData, crit, critCfg) {
  const get5e = (k) => { try { return game.settings.get('dnd5e', k); } catch (e) { return undefined; } };
  const DamageRoll = foundry.utils.getProperty(CONFIG, 'Dice.DamageRoll');
  if (DamageRoll) {
    try {
      const allow = crit && critCfg?.allow !== false; // an activity can mark a damage part as not critable
      // dnd5e 5.x DamageRoll API: crit is triggered by `options.isCritical`, and `options.critical`
      // must be a CriticalDamageConfiguration OBJECT (multiplyNumeric / powerfulCritical / bonusDamage).
      // The pre-5.x flat boolean shape ({ critical: true }) makes configureDamage's
      // mergeObject(critical, this.options.critical) throw "not Objects!" — even for non-crits.
      const critical = {};
      if (allow) {
        const mn = get5e('criticalDamageModifiers'); if (mn != null) critical.multiplyNumeric = mn;
        const pc = get5e('criticalDamageMaxDice'); if (pc != null) critical.powerfulCritical = pc;
        if (critCfg?.bonus) critical.bonusDamage = String(critCfg.bonus);
      }
      const roll = new DamageRoll(formula, rollData, { isCritical: !!allow, critical });
      await roll.evaluate();
      return roll;
    } catch (e) { console.warn('DDB Roll Cards | DamageRoll', formula, e); }
  }
  try {
    const f = crit ? formula.replace(/(\d+)d(\d+)/gi, (m, n, d) => `${2 * Number(n)}d${d}`) : formula;
    const roll = new Roll(f, rollData); await roll.evaluate(); return roll;
  } catch (e) { console.warn('DDB Roll Cards | damage formula', formula, e); return null; }
}
/* ------------------------------------------------------ monster feature automation (Phase B, growing) */
// On-being-hit retaliation features: when a melee attacker HITS a creature that has one of these, the creature
// deals its feature damage back to the attacker. Matched by feature-item name (extensible from the SRD catalog).
// NOTE: Corrosive Form is NOT here — it doesn't deal damage, it corrodes the weapon (see featureWeaponCorrosion).
const FEATURE_RETALIATE = ['heated body'];
const _retaliated = new Set(); // dedupe per card+target so a re-confirm doesn't double-hit
// Roll a feature item's own activity damage (the real numbers live in the activity, not the description text).
async function rollFeatureDamage(item) {
  try {
    const dmgAct = Array.from(item.system?.activities ?? []).find(a => a.damage?.parts?.length);
    const parts = dmgAct?.damage?.parts ?? []; if (!parts.length) return null;
    const rollData = dmgAct.getRollData?.() ?? item.getRollData?.() ?? {};
    let total = 0, type = '';
    for (const p of parts) {
      let f = (typeof p.formula === 'string' && p.formula.trim()) ? p.formula : '';
      if (!f) { const n = p.number, d = p.denomination; f = (n && d) ? `${n}d${d}` : ''; if (p.bonus) f = f ? `${f} + ${p.bonus}` : String(p.bonus); }
      if (!f) continue;
      const roll = await rollDamageFormula(f, rollData, false, null); if (!roll) continue;
      total += Math.max(0, Math.round(roll.total));
      if (!type) type = p.types?.size ? Array.from(p.types)[0] : (p.type || '');
    }
    return total ? { total, type } : null;
  } catch (e) { return null; }
}
async function featureRetaliation(card) {
  try {
    if (!card?.atk || !game.settings.get(NS, 'featureAutomation')) return;
    const attacker = card.actorId ? game.actors.get(card.actorId) : actorByName(card.who); if (!attacker) return;
    const ctx = resolveAction(attacker, card.action);
    const ranged = /rwak|rsak|ranged/i.test(ctx?.actionType || ''); // these features are melee-only
    if (_retaliated.size > 600) _retaliated.clear();
    for (const t of (card.targets || [])) {
      const tactor = targetActor(t); if (!tactor) continue;
      const feat = (tactor.items || []).find(it => FEATURE_RETALIATE.some(p => (it.name || '').toLowerCase().includes(p)));
      if (!feat) continue;
      // This target HAS a retaliation feature — from here on, LOG why we don't strike back so a failed
      // test points at the exact cause (ranged attack / not a hit / feature has no rollable damage activity).
      const v = card.atk.verdicts?.[tkey(t)] ?? card.atk.verdict;
      if (ranged) { console.log(`DDB Roll Cards | retaliation: ${tactor.name}/${feat.name} skipped — "${card.action}" resolved as ranged (${ctx?.actionType || '?'}); these features only fire vs melee.`); continue; }
      if (v !== 'hit') { console.log(`DDB Roll Cards | retaliation: ${tactor.name}/${feat.name} skipped — attack verdict is "${v}", not a hit.`); continue; }
      const key = `${card.iid || cardKey(card)}|${tkey(t)}`; if (_retaliated.has(key)) continue;
      const dmg = await rollFeatureDamage(feat);
      if (!dmg) { console.warn(`DDB Roll Cards | retaliation: ${tactor.name}/${feat.name} has no rollable damage — the feature item needs a Damage activity (a text-only "[[/damage average]]" with no activity can't be rolled).`); continue; }
      _retaliated.add(key);
      const hpWas = Number(attacker.system?.attributes?.hp?.value) || 0;
      try { if (typeof attacker.applyDamage === 'function') await attacker.applyDamage([{ value: dmg.total, type: dmg.type }]); else await manualDamage(attacker, dmg.total); } catch (e) {}
      noteDmg(attacker, dmg.type);
      recurringStinger(attacker, { type: dmg.type }, dmg.total); // reuse the impact cinematic, on the attacker
      const hp = attacker.system?.attributes?.hp ?? {};
      runAutoStates([{ actor: attacker, oldHp: hpWas, newHp: Number(hp.value) || 0, max: Number(hp.max) || 0 }]);
      postFeatureLog(tactor, '↩️', `${feat.name} → ${attacker.name} takes ${dmg.total}${dmg.type ? ' ' + dmg.type : ''} damage.`, 'bad');
    }
  } catch (e) { console.warn('DDB Roll Cards | featureRetaliation', e); }
}
// Weapon-corrosion features (Corrosive Form): hitting the creature with a NONMAGICAL melee WEAPON corrodes it —
// a cumulative −1 penalty to that weapon's attack rolls, destroyed at −5. NOT damage to the attacker. We apply a
// single stacking ActiveEffect to the weapon item (dnd5e redirects a `system.attack.bonus` effect on a weapon to
// all its attack activities), so the penalty shows on the weapon and applies to any roll made FROM Foundry.
// Corrosive Form (oozes/puddings) + Rust Monster's Corrode/Rust Metal all corrode the weapon that hit them.
// (We treat nonmagical as the proxy for "metal" — dnd5e doesn't track weapon material reliably.)
const FEATURE_WEAPON_CORRODE = ['corrosive form', 'corrode metal', 'rust metal'];
const CORRODE_MAX = 5; // penalty at which the weapon is destroyed
function isMagicalWeapon(item) {
  try {
    const s = item?.system || {}; const props = s.properties;
    const hasMgc = props?.has ? props.has('mgc') : (Array.isArray(props) ? props.includes('mgc') : false);
    return !!(hasMgc || (Number(s.magicalBonus) || 0) > 0);
  } catch (e) { return false; }
}
async function featureWeaponCorrosion(card) {
  try {
    if (!card?.atk || !game.settings.get(NS, 'featureAutomation')) return;
    const attacker = card.actorId ? game.actors.get(card.actorId) : actorByName(card.who); if (!attacker) return;
    const ctx = resolveAction(attacker, card.action);
    if (/rwak|rsak|ranged/i.test(ctx?.actionType || '')) return; // melee contact only
    const weapon = findItem(attacker, card.action);
    for (const t of (card.targets || [])) {
      const tactor = targetActor(t); if (!tactor) continue;
      const feat = (tactor.items || []).find(it => FEATURE_WEAPON_CORRODE.some(p => (it.name || '').toLowerCase().includes(p)));
      if (!feat) continue;
      // This target corrodes weapons — LOG why we don't, so a failed test points at the cause.
      const v = card.atk.verdicts?.[tkey(t)] ?? card.atk.verdict;
      if (v !== 'hit') { console.log(`DDB Roll Cards | corrosion: ${tactor.name}/${feat.name} skipped — attack verdict is "${v}", not a hit.`); continue; }
      if (!weapon || weapon.type !== 'weapon') { console.log(`DDB Roll Cards | corrosion: ${tactor.name}/${feat.name} skipped — "${card.action}" isn't a weapon item (natural/unarmed/spell attacks don't corrode).`); continue; }
      if (isMagicalWeapon(weapon)) { console.log(`DDB Roll Cards | corrosion: ${weapon.name} is magical — immune to corrosion.`); continue; }
      const key = `${card.iid || cardKey(card)}|${tkey(t)}|corrode`; if (_retaliated.has(key)) continue; _retaliated.add(key);
      await applyWeaponCorrosion(weapon, attacker, feat, tactor);
    }
  } catch (e) { console.warn('DDB Roll Cards | featureWeaponCorrosion', e); }
}
// Apply/stack the corrosion penalty on a weapon item: ONE flagged ActiveEffect whose attack-bonus override grows by
// −1 each hit, capped at −5 (= destroyed). We don't auto-delete the player's weapon — we flag + loudly log it.
async function applyWeaponCorrosion(weapon, attacker, feat, ooze) {
  try {
    const FK = 'weaponCorrosion';
    const existing = (weapon.effects?.contents || weapon.effects || []).find(e => e.getFlag?.(NS, FK));
    let stacks = ((existing?.getFlag?.(NS, FK)?.stacks) || 0) + 1;
    const destroyed = stacks >= CORRODE_MAX; if (stacks > CORRODE_MAX) stacks = CORRODE_MAX;
    const value = String(-stacks);
    const name = `Corroded (${value} attack${destroyed ? ', destroyed' : ''})`;
    // dnd5e 5.x keeps a weapon's attack bonus on its ATTACK ACTIVITY, so target that path directly (an item's own
    // transfer:false effects are applied to the item by dnd5e's Item5e.applyActiveEffects). OVERRIDE → clean "-N".
    const aid = Array.from(weapon.system?.activities ?? []).find(a => a.type === 'attack')?.id;
    const key = aid ? `system.activities.${aid}.attack.bonus` : 'system.attack.bonus';
    const changes = [{ key, mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value }];
    if (existing) await existing.update({ name, changes, transfer: false, [`flags.${NS}.${FK}`]: { stacks } });
    else await weapon.createEmbeddedDocuments('ActiveEffect', [{ name, img: 'icons/svg/degen.svg', changes, transfer: false, disabled: false, flags: { [NS]: { [FK]: { stacks } } } }]);
    postFeatureLog(ooze, '🧪', `${feat.name} corrodes ${attacker.name}'s ${weapon.name} → ${value} to attack rolls${destroyed ? ' — WEAPON DESTROYED (−5 reached)!' : '.'}`, 'bad');
  } catch (e) { console.warn('DDB Roll Cards | applyWeaponCorrosion', e); }
}
// On-hit condition riders: when an attack HITS, apply its rider condition(s) to the target — Grab→Grappled,
// Paralyzing Touch→Paralyzed, Boulder→Prone, Bite→(CON save or) Poisoned, etc. Conditions come from itemConditions
// (the item's own effect statuses + the SRD lexicon) stored as card.actionConds. When the attack ALSO carries a save
// (card.saveDC), the rider is save-gated: NPC targets roll the save here (apply on a fail); PC targets are deferred to
// their own D&D Beyond save (the card still shows the suggested condition for the GM). We OWN the condition here so
// applyAll won't double-apply it (it checks card.atk.ridersHandled) — and we track what we added for clean undo.
async function featureOnHitRiders(card, message) {
  try {
    if (!card?.atk || !game.settings.get(NS, 'featureAutomation')) return;
    const conds = card.actionConds || []; if (!conds.length) return;
    if (card.atk.ridersHandled) return; // already processed this hit-confirmation (don't re-roll saves / re-apply)
    card.atk.ridersHandled = true; // tell applyAll/reopen the conditions are ours now
    const riders = card.atk.riders = card.atk.riders || {};
    const saveGated = card.saveDC != null && !!card.saveAbility;
    const applied = [];
    for (const t of (card.targets || [])) {
      const k = tkey(t);
      const v = card.atk.verdicts?.[k] ?? defaultHit(t, atkEff(card.atk)); if (v !== 'hit') continue;
      const actor = targetActor(t); if (!actor) continue;
      if (riders[k]?.length) continue; // already applied for this attack instance
      if (saveGated) {
        if (actor.hasPlayerOwner) continue; // player rolls their save on D&D Beyond; GM applies via the card after
        const total = await rollOneSave(actor, card.saveAbility);
        if (typeof total === 'number' && total >= card.saveDC) { postFeatureLog(actor, '🛡️', `Saved vs ${card.action} (${total} ≥ DC ${card.saveDC}) — no ${conds.map(condLabel).join('/')}.`, 'heal'); continue; }
      }
      const added = [];
      for (const cid of conds) { if (!actor.statuses?.has?.(cid)) { try { await actor.toggleStatusEffect?.(cid, { active: true }); added.push(cid); await setEffectDuration(actor, cid, card.duration); } catch (e) {} } }
      if (added.length) { riders[k] = added; applied.push(`${t.name}: ${added.map(condLabel).join(', ')}`); }
    }
    if (applied.length) {
      const rec = actionCards.get(cardKey(card)); const sync = (c) => { if (c?.atk) { c.atk.ridersHandled = true; c.atk.riders = riders; } };
      sync(card); if (rec) { sync(rec.gm); sync(rec.pub); }
      const owner = card.actorId ? game.actors.get(card.actorId) : actorByName(card.who);
      postFeatureLog(owner, '⚔️', `${card.action} on hit → ${applied.join(' · ')}.`, 'bad');
    }
  } catch (e) { console.warn('DDB Roll Cards | featureOnHitRiders', e); }
}
// Remove any on-hit rider conditions we applied for this card (used when hits are re-opened / damage undone).
async function clearOnHitRiders(card) {
  try {
    const riders = card?.atk?.riders; if (!riders) return;
    for (const [k, cids] of Object.entries(riders)) {
      const actor = targetActor({ id: k, name: '' }); if (!actor) continue;
      for (const cid of (cids || [])) { try { if (actor.statuses?.has?.(cid)) await actor.toggleStatusEffect?.(cid, { active: false }); } catch (e) {} }
    }
    const rec = actionCards.get(cardKey(card)); const clr = (c) => { if (c?.atk) { c.atk.riders = {}; c.atk.ridersHandled = false; } };
    clr(card); if (rec) { clr(rec.gm); clr(rec.pub); }
  } catch (e) { console.warn('DDB Roll Cards | clearOnHitRiders', e); }
}
/* ------------------------------------------------------ Multiattack: decode a monster's Multiattack action into its
   own sub-attacks ("two claws and a bite") and post a one-click card so the GM rolls each through the normal pipeline
   (each fired attack still becomes a full card with riders/retaliation/etc.). We DON'T auto-fire same-named attacks in
   a burst — they'd collide on the actorId|action card key — so it's one click per attack, but the decode is done for you. */
const NUMWORD = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
function wordNum(s) { if (s == null) return null; s = String(s).toLowerCase().trim(); if (/^\d+$/.test(s)) return Number(s); return NUMWORD[s] ?? null; }
function attackItemsOf(actor) { return (actor?.items ? Array.from(actor.items) : []).filter(it => Array.from(it.system?.activities ?? []).some(a => a.type === 'attack')); }
function parseMultiattack(multiItem, actor) {
  const raw = (multiItem?.system?.description?.value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').toLowerCase();
  if (!raw) return [];
  const atks = attackItemsOf(actor); const out = [];
  for (const it of atks) {
    const nm = (it.name || '').toLowerCase().trim(); if (!nm) continue;
    const variants = [nm + 'es', nm + 's', nm.replace(/y$/, 'ies'), nm]; // prefer the plural (longer) match
    for (const v of variants) {
      const idx = raw.indexOf(v); if (idx === -1) continue;
      const pre = raw.slice(Math.max(0, idx - 30), idx); // the count word sits just before the attack name
      const nums = [...pre.matchAll(/\b(\d+|an?|one|two|three|four|five|six|seven|eight|nine|ten)\b/g)];
      const n = wordNum(nums.length ? nums[nums.length - 1][1] : null) || 1;
      out.push({ itemId: it.id, name: it.name, count: Math.max(1, n) }); break;
    }
  }
  if (!out.length && atks.length) { // "makes N attacks" with no named weapon → use the sole attack item
    const m = raw.match(/makes\s+(\d+|one|two|three|four|five|six)\s+(?:melee\s+|ranged\s+)?attacks?/);
    const n = wordNum(m?.[1]); if (n) out.push({ itemId: atks[0].id, name: atks[0].name, count: n });
  }
  return out;
}
// Fire one sub-attack through dnd5e's own roll (fast-forwarded) so it flows into our normal attack-card pipeline.
async function fireSubAttack(aid, mid) {
  try {
    const actor = game.actors.get(aid); const item = actor?.items?.get(mid); if (!item) return;
    const act = Array.from(item.system?.activities ?? []).find(a => a.type === 'attack');
    if (act?.rollAttack) await act.rollAttack({}, { configure: false }, { create: true });
    else if (item.use) await item.use({}, { configure: false });
  } catch (e) { console.warn('DDB Roll Cards | fireSubAttack', e); }
}
async function postMultiattackCard(actor, multiItem, parsed) {
  try {
    const flat = []; for (const p of parsed) for (let i = 0; i < p.count; i++) flat.push(p);
    const btns = flat.map(p => `<button class="ddbx-multibtn" data-ddbx="multiatk" data-aid="${esc(actor.id)}" data-mid="${esc(p.itemId)}"><i class="fas ${IC.d20}"></i> ${esc(p.name)}</button>`).join('');
    const summary = parsed.map(p => `${p.count}× ${esc(p.name)}`).join(' + ');
    const img = actor.img || 'icons/svg/sword.svg';
    const html = `<div class="ddbx-multi"><div class="ddbx-multi-h"><img src="${cleanUrl(img)}" width="28" height="28" style="border-radius:5px" onerror="this.style.display='none'"><b>⚔️ Multiattack — ${esc(actor.name)}</b></div><div class="ddbx-multi-sub">${summary} · click each to roll</div><div class="ddbx-multi-row">${btns}</div></div>`;
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper: ChatMessage.getWhisperRecipients('GM').map(u => u.id), content: html, flags: { [NS]: { multi: { aid: actor.id } } } });
  } catch (e) { console.warn('DDB Roll Cards | postMultiattackCard', e); }
}
// Tokens whose nearest edge is within `feet` of the origin token — uses real grid positions, accounts for size.
function tokensWithin(originToken, feet) {
  const out = []; const gs = canvas.grid?.size || 100, gd = canvas.grid?.distance || 5; const o = originToken.center;
  for (const t of (canvas.tokens?.placeables || [])) {
    if (t.id === originToken.id || !t.actor) continue;
    const dx = t.center.x - o.x, dy = t.center.y - o.y;
    const edge = (Math.max(t.w || gs, t.h || gs) / gs * gd) / 2; // count big tokens by their nearest edge
    if (Math.hypot(dx, dy) / gs * gd - edge <= feet) out.push(t);
  }
  return out;
}
// Pull save DC / ability / half-on-save / emanation radius from a feature's save activity (fallback to its text).
function featureSaveSpec(feat) {
  const acts = Array.from(feat.system?.activities ?? []);
  const sa = acts.find(a => a.type === 'save' && a.save) || acts.find(a => a.save);
  const desc = (feat.system?.description?.value || '').toLowerCase();
  const dc = Number(sa?.save?.dc?.value ?? sa?.save?.dc ?? desc.match(/dc\s+(\d+)/)?.[1] ?? 0) || null;
  const ability = firstOf(sa?.save?.ability) || (desc.match(/(strength|dexterity|constitution|intelligence|wisdom|charisma)\s+sav/)?.[1]?.slice(0, 3)) || 'dex';
  const onSave = (sa?.damage?.onSave === 'half' || /half (as much )?damage|half the damage/.test(desc)) ? 'half' : 'none';
  const radius = Number(sa?.target?.template?.size ?? feat.system?.target?.template?.size ?? desc.match(/(\d+)[\s-]*(?:foot|feet|ft)/)?.[1] ?? 10) || 10;
  return { dc, ability, onSave, radius };
}
// Build + post a feature's AoE as a normal save/damage/condition card (GM resolves: Roll all saves → Apply, with
// full resistance/auto-states/cinematics). Conditions land on a FAILED save via defaultConds(actionConds).
async function postFeatureCard(owner, feat, targets, dmg, save, conds) {
  const base = { who: owner.name, action: feat.name, actorId: owner.id, img: owner.img || '', actionConds: conds || [] };
  const gm = { ...base, targets, dmg: dmg ? foundry.utils.deepClone(dmg) : undefined, save, revealed: !(save && dmg && dmg.total) };
  const pub = { ...base, targets: targets.map(t => ({ id: t.id, name: t.name, img: t.img })), dmg: dmg ? foundry.utils.deepClone(dmg) : undefined, save: save ? { ...save } : undefined, revealed: !(save && dmg && dmg.total) };
  const gmMsg = await postGM(gm); const pubMsg = await postPublic(pub);
  actionCards.set(cardKey(gm), { gmId: gmMsg?.id, pubId: pubMsg?.id, gm, pub, ts: Date.now() });
  announce(gm, 'declare');
}
// On-death AoE (Death Burst / Death Throes): explode for a save-for-half blast, auto-targeted to who's in range.
const FEATURE_DEATHBURST = ['death burst', 'death throes'];
async function featureDeathBurst(actor) {
  try {
    if (!actor || !game.user?.isGM || !game.settings.get(NS, 'featureAutomation')) return;
    const feat = (actor.items || []).find(it => FEATURE_DEATHBURST.some(p => (it.name || '').toLowerCase().includes(p)));
    if (!feat) return;
    const tok = canvas.tokens?.placeables?.find(t => t.actor?.id === actor.id);
    if (!tok) { console.log(`DDB Roll Cards | death burst: ${actor.name} has ${feat.name} but no token on the canvas — can't place the blast.`); return; }
    const { dc, ability, onSave, radius } = featureSaveSpec(feat);
    const d = await rollFeatureDamage(feat);
    if (!d || !d.total) { console.warn(`DDB Roll Cards | death burst: ${actor.name}/${feat.name} has no rollable damage — the feature item needs a Damage activity.`); return; }
    const within = tokensWithin(tok, radius);
    if (!within.length) { ui.notifications?.info?.(`${actor.name}: ${feat.name} — no creatures within ${radius} ft.`); return; }
    await postFeatureCard(actor, feat, snapshotTargets(within), { parts: [{ amount: d.total, type: d.type }], total: d.total }, dc ? { dc, ability, onSave, results: {} } : undefined, []);
    ui.notifications?.info?.(`${actor.name}: ${feat.name}! ${within.length} creature(s) in ${radius} ft — resolve the burst card.`);
  } catch (e) { console.warn('DDB Roll Cards | death burst', e); }
}
// Auras / emanations resolved at the OWNER's turn (an approximation of "each creature within X / that starts its
// turn within X"): post one save card vs everyone in range — damage (save-for-half) and/or a save-or-condition.
const FEATURE_AURA = ['fire aura', 'heat aura', 'frost aura', 'cold aura', 'poison aura', 'fear aura', 'stench', 'fetid cloud'];
async function featureAuras(owner) {
  try {
    if (!owner || !game.user?.isGM || !game.settings.get(NS, 'featureAutomation')) return;
    const tok = canvas.tokens?.placeables?.find(t => t.actor?.id === owner.id); if (!tok) return;
    for (const feat of (owner.items || [])) {
      const n = (feat.name || '').toLowerCase();
      if (!FEATURE_AURA.some(p => n.includes(p))) continue;
      const { dc, ability, onSave, radius } = featureSaveSpec(feat);
      const within = tokensWithin(tok, radius); if (!within.length) continue;
      const conds = itemConditions(feat, (feat.system?.description?.value || '').toLowerCase());
      const hasDmg = Array.from(feat.system?.activities ?? []).some(a => a.damage?.parts?.length);
      let dmg;
      if (hasDmg) { const d = await rollFeatureDamage(feat); if (d?.total) dmg = { parts: [{ amount: d.total, type: d.type }], total: d.total }; }
      if (!dmg && (conds.length || dc)) dmg = { parts: [{ amount: 0, type: '' }], total: 0 }; // 0-dmg shell so the save/condition panel renders
      if (!dmg) { console.log(`DDB Roll Cards | aura: ${owner.name}/${feat.name} produced no card — no damage activity, no save DC, and no condition detected in its text.`); continue; }
      const save = dc ? { dc, ability, onSave, results: {} } : undefined;
      await postFeatureCard(owner, feat, snapshotTargets(within), dmg, save, conds);
      ui.notifications?.info?.(`${owner.name}: ${feat.name} — ${within.length} creature(s) in ${radius} ft.`);
    }
  } catch (e) { console.warn('DDB Roll Cards | auras', e); }
}
async function rollItemDamage(card) {
  const actor = card.actorId ? game.actors.get(card.actorId) : null;
  const item = actor ? findItem(actor, card.action) : null;
  if (!item) { ui.notifications.warn(`DDB: couldn't find an item named "${esc(card.action)}" on ${actor?.name || 'the actor'} to roll damage.`); return; }
  try {
    const acts = Array.from(item.system?.activities ?? []);
    const dmgAct = acts.find(a => a.damage?.parts?.length);
    const healAct = acts.find(a => a.healing);
    const isHeal = !dmgAct && !!healAct;
    const parts = dmgAct?.damage?.parts ?? (healAct?.healing ? [healAct.healing] : []);
    if (!parts.length) { ui.notifications.warn(`DDB: "${esc(item.name)}" has no damage to roll.`); return; }
    const crit = card.atk?.nat === 20;
    const src = dmgAct || healAct || item;
    const rollData = src.getRollData?.() ?? item.getRollData?.() ?? actor?.getRollData?.() ?? {};
    const out = []; let total = 0;
    for (const p of parts) {
      let formula = '';
      try { if (typeof p.formula === 'string' && p.formula.trim()) formula = p.formula; } catch (e) {}
      if (!formula) {
        if (p.custom?.enabled && p.custom?.formula) formula = p.custom.formula;
        else { const n = p.number, d = p.denomination; formula = (n && d) ? `${n}d${d}` : ''; if (p.bonus) formula = formula ? `${formula} + ${p.bonus}` : String(p.bonus); }
      }
      if (!formula) continue;
      // Crit only applies to damage (a nat-20 attack), never healing; the system's DamageRoll handles the doubling.
      const roll = await rollDamageFormula(formula, rollData, crit && !isHeal, dmgAct?.damage?.critical);
      if (!roll) continue;
      try { if (game.dice3d) game.dice3d.showForRoll(roll, game.user, true); } catch (e) {}
      const type = p.types?.size ? Array.from(p.types)[0] : (p.type || '');
      out.push({ amount: Math.max(0, Math.round(roll.total)), type }); total += roll.total;
    }
    if (!out.length) { ui.notifications.warn(`DDB: couldn't build a damage roll for "${esc(item.name)}".`); return; }
    const dmg = { parts: out, total: Math.max(0, Math.round(total)) };
    const set = (c) => { if (c) { c.dmg = foundry.utils.deepClone(dmg); if (isHeal) c.heal = true; } };
    set(card); const rec = actionCards.get(cardKey(card)); if (rec) { set(rec.gm); set(rec.pub); }
    await syncCards(card, rec?.gmId ? game.messages.get(rec.gmId) : null);
  } catch (e) { console.error('DDB Roll Cards | rollItemDamage', e); ui.notifications.warn('DDB: could not roll item damage (see console).'); }
}
async function rollAllSaves(card, message) {
  const ab = card.save?.ability; if (!ab) { ui.notifications.warn('DDB: no save ability resolved.'); return; }
  for (const t of (card.targets || [])) { const total = await rollOneSave(targetActor(t) || t.name, ab); if (typeof total === 'number' && card.save?.dc != null) applyResult(card, tkey(t), total >= card.save.dc ? 'save' : 'fail'); }
  await syncCards(card, message);
  announce(card, 'result');
  scheduleAutoApply(card);
}
// Contested check: a target rolls a chosen skill/ability; returns the total (and animates via Dice So Nice).
async function contestRoll(actor, sel) {
  if (!actor || !sel) return null;
  const i = sel.indexOf(':'); const kind = sel.slice(0, i), key = sel.slice(i + 1);
  try {
    let res;
    if (kind === 'skill') res = actor.rollSkill ? await actor.rollSkill({ skill: key }, { configure: false }, { create: false }) : null;
    else res = actor.rollAbilityCheck ? await actor.rollAbilityCheck({ ability: key }, { configure: false }, { create: false }) : (actor.rollAbilityTest ? await actor.rollAbilityTest(key, { chatMessage: false, fastForward: true }) : null);
    const roll = Array.isArray(res) ? res[0] : res;
    try { if (game.dice3d && roll) game.dice3d.showForRoll(roll, game.user, true); } catch (e) {}
    return roll?.total ?? roll?.rolls?.[0]?.total ?? null;
  } catch (e) { console.error('DDB Roll Cards | contestRoll', e); return null; }
}
function setContestResult(card, name, total) {
  const set = (c) => { if (c?.gen) { c.gen.contestResults = c.gen.contestResults || {}; c.gen.contestResults[name] = total; } };
  set(card); const rec = actionCards.get(cardKey(card)); if (rec) { set(rec.gm); set(rec.pub); }
}
// The skill/ability each group participant actually rolled (shown under their portrait).
function setPartLabel(card, name, label) {
  if (!label) return; const set = (c) => { if (c?.gen) { c.gen.partLabels = c.gen.partLabels || {}; c.gen.partLabels[name] = label; } };
  set(card); const rec = actionCards.get(cardKey(card)); if (rec) { set(rec.gm); set(rec.pub); }
}
async function setContestSkill(card, sel, message) {
  const set = (c) => { if (c?.gen) c.gen.contestSkill = sel; };
  set(card); const rec = actionCards.get(cardKey(card)); if (rec) { set(rec.gm); set(rec.pub); }
  if (message) { try { await message.update({ content: buildCard(card), flags: { [NS]: { card } } }); } catch (e) {} }
}
// Toggle a group check between "check" (party average) and "contest" (winners/losers).
async function setGroupMode(card, mode, message) {
  const set = (c) => { if (c?.gen) c.gen.mode = mode; };
  set(card); const rec = actionCards.get(cardKey(card)); if (rec) { set(rec.gm); set(rec.pub); }
  await syncCards(card, message);
  announce(card, card.gen?.hidden ? 'declare' : 'result', { cue: 'silent' }); // config tweak — refresh visuals only
}
// Toggle the DC on a group check WITHOUT revealing: clicking the active DC again clears it (no separate undo needed).
async function setGroupDC(card, dc, message) {
  const next = (dc != null && dc === (card.gen?.dc ?? null)) ? null : dc;
  const set = (c) => { if (c?.gen) { if (next == null) delete c.gen.dc; else c.gen.dc = next; } };
  set(card); const rec = actionCards.get(cardKey(card)); if (rec) { set(rec.gm); set(rec.pub); }
  await syncCards(card, message);
  announce(card, card.gen?.hidden ? 'declare' : 'result', { cue: 'silent' }); // config tweak — refresh visuals only
}
function allContestIn(card) { return (card.targets || []).every(t => card.gen?.contestResults?.[t.name] != null); }
// Resolve a group check: average (round up) for "check" mode, winners for "contest" mode (DC if set, else top score).
function groupOutcome(card) {
  const g = card.gen || {}; const cr = g.contestResults || {};
  const names = (card.targets || []).map(t => t.name);
  const vals = names.map(n => cr[n]).filter(v => v != null);
  const dc = (g.dc != null) ? g.dc : null;
  if ((g.mode || 'check') === 'check') {
    const avg = vals.length ? Math.ceil(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    const pass = (dc != null && avg != null) ? avg >= dc : null;
    return { mode: 'check', dc, avg, pass };
  }
  const max = vals.length ? Math.max(...vals) : null;
  const winners = new Set();
  for (const n of names) { const v = cr[n]; if (v == null) continue; if (dc != null ? v >= dc : v === max) winners.add(n); }
  return { mode: 'contest', dc, max, winners };
}
// Per-participant mark for a revealed group check: 'win' | 'lose' | null.
function groupMark(card, name) {
  const o = groupOutcome(card); const v = card.gen?.contestResults?.[name]; if (v == null) return null;
  if (o.mode === 'check') return (o.dc != null) ? (v >= o.dc ? 'win' : 'lose') : null;
  return o.winners.has(name) ? 'win' : 'lose';
}
// NPC contest (non-group): roll each NPC target with the GM-chosen skill; player-owned tokens roll their own.
async function rollAllContest(card, message) {
  const sel = card.gen?.contestSkill; if (!sel) { ui.notifications.warn('DDB: pick what the targets roll.'); return; }
  for (const t of (card.targets || [])) {
    if (t.name === card.who) continue;
    const actor = actorByName(t.name); if (!actor || actor.hasPlayerOwner) continue;
    const total = await contestRoll(actor, sel); if (typeof total === 'number') setContestResult(card, t.name, total);
  }
  await syncCards(card, message);
  announce(card, 'result');
}
async function setContestManual(card, name, val, message) {
  setContestResult(card, name, Number.isFinite(val) ? val : null);
  await syncCards(card, message);
  // Never auto-reveal — the GM confirms. Just refresh the on-screen cinematic (progress while hidden, result once revealed).
  if (card.gen?.group) announce(card, card.gen.hidden ? 'declare' : 'result', card.gen.hidden ? { cue: 'groupprogress' } : {});
}
async function revealContest(card, message) {
  const set = (c) => { if (c?.gen) c.gen.hidden = false; }; set(card); const rec = actionCards.get(cardKey(card)); if (rec) { set(rec.gm); set(rec.pub); }
  await syncCards(card, message); announce(card, 'result');
}
async function hideContest(card, message) {
  const set = (c) => { if (c?.gen) c.gen.hidden = true; }; set(card); const rec = actionCards.get(cardKey(card)); if (rec) { set(rec.gm); set(rec.pub); }
  await syncCards(card, message);
}
// Manually set/override a roll's total (real dice, or correcting a received DDB roll).
async function editGenTotal(card, val, message) {
  if (!card.gen || !Number.isFinite(val)) return;
  const set = (c) => { if (c?.gen) c.gen.total = val; }; set(card); const rec = actionCards.get(cardKey(card)); if (rec) { set(rec.gm); set(rec.pub); }
  await syncCards(card, message);
}
// Per-target damage portion + conditions live in card.tgt[name] = { mult, conditions:[] }. GM-only (no public push).
function ensureTgt(c, name) { c.tgt = c.tgt || {}; c.tgt[name] = c.tgt[name] || {}; return c.tgt[name]; }
async function setTargetMult(card, name, mult, message) {
  const set = (c) => { if (c) ensureTgt(c, name).mult = mult; };
  set(card); const rec = actionCards.get(cardKey(card)); if (rec) { set(rec.gm); set(rec.pub); }
  if (message) { try { await message.update({ content: buildCard(card), flags: { [NS]: { card } } }); } catch (e) {} }
}
// The card-level condition choice (which condition + when), applied to the matching group on Apply all.
async function setCondId(card, cid, message) {
  const set = (c) => { if (c) c.condId = cid || ''; };
  set(card); const rec = actionCards.get(cardKey(card)); if (rec) { set(rec.gm); set(rec.pub); }
  if (message) { try { await message.update({ content: buildCard(card), flags: { [NS]: { card } } }); } catch (e) {} }
}
async function setCondWhen(card, when, message) {
  const set = (c) => { if (c) c.condWhen = when || 'all'; };
  set(card); const rec = actionCards.get(cardKey(card)); if (rec) { set(rec.gm); set(rec.pub); }
  if (message) { try { await message.update({ content: buildCard(card), flags: { [NS]: { card } } }); } catch (e) {} }
}
/* --------------------------------------------------------- concentration */
const pendingConc = new Map(); // player actor name -> { dc, ts } awaiting their D&D Beyond CON save
// Find concentration effect(s) on an actor from ANY source — dnd5e's own tracker, an item-granted effect, or any
// effect named/flagged "concentrating" (so module-, player-, or hand-applied concentration all resolve the same way).
function concEffects(actor) {
  if (!actor) return [];
  try { const e = actor.concentration?.effects; if (e && (e.size || e.length)) return Array.from(e); } catch (x) {}
  try {
    const all = actor.appliedEffects ?? actor.effects ?? [];
    const arr = all.filter ? all : Array.from(all);
    const list = arr.filter(x => x?.statuses?.has?.('concentrating') || /concentrat/i.test(x?.name || x?.label || ''));
    if (list.length) return list;
  } catch (x) {}
  return [];
}
async function breakConcentration(actor) {
  for (const e of concEffects(actor)) { try { if (typeof actor.endConcentration === 'function') await actor.endConcentration(e); else await e.delete(); } catch (x) { try { await e.delete(); } catch (y) {} } }
}
function concActor(conc) { return actorByName(conc.name) || (conc.actorId ? game.actors.get(conc.actorId) : null); }
const concWait = (ms) => new Promise(r => setTimeout(r, Math.max(0, ms || 0)));
// Post-dice beat before the reveal — HALF the step delay (Dice So Nice already includes its own settle/linger time,
// so a full delay on top drags). The pre-roll delay (damage → dice) stays full so the damage cinematic can breathe.
const concBeat = () => concWait(autoDelayMs() / 2);
// Evaluate the creature's CON save WITHOUT showing dice or posting a card — we drive Dice So Nice + the reveal
// ourselves so the beat lands: dice roll, pause, then reveal/resolve. Returns { roll, total }.
async function rollConcRoll(actor) {
  try {
    const res = actor.rollSavingThrow ? await actor.rollSavingThrow({ ability: 'con' }, { configure: false }, { create: false }) : await actor.rollAbilitySave?.('con', { fastForward: true, chatMessage: false });
    const roll = Array.isArray(res) ? res[0] : res;
    return { roll, total: roll?.total ?? roll?.rolls?.[0]?.total ?? null };
  } catch (e) { console.error('DDB Roll Cards | rollConcRoll', e); return { roll: null, total: null }; }
}
// Play (and broadcast) the maintain/break cinematic — a result stinger tinted by the outcome, with its own sound cue.
function concStinger(conc) {
  try {
    if (!game.user?.isGM) return;
    const held = !!conc.held;
    const payload = { phase: 'result', word: held ? 'Concentration Held' : 'Concentration Broken', tone: held ? 'success' : 'failure', dc: conc.dc, actorImg: conc.img || '', who: conc.name, cue: held ? 'conchold' : 'concbreak' };
    playStinger(payload);
    try { game.socket?.emit(`module.${NS}`, { t: 'stinger', payload }); } catch (e) {}
  } catch (e) { console.warn('DDB Roll Cards | concStinger', e); }
}
// Make the actor's effect state match conc.held: when it drops to broken we stash the effect data (so it can be
// restored) and end concentration; when it goes back to held we re-create the stashed effect. Idempotent.
async function concReconcile(actor, conc) {
  if (!actor) return;
  if (!conc.held && !conc.broken) {
    const effs = concEffects(actor);
    if (effs.length) { conc.stash = effs.map(e => e.toObject()); await breakConcentration(actor); }
    conc.broken = true;
  } else if (conc.held && conc.broken) {
    if (conc.stash?.length && !concEffects(actor).length) { try { await actor.createEmbeddedDocuments('ActiveEffect', conc.stash); } catch (e) { console.warn('DDB Roll Cards | restore conc', e); } }
    conc.broken = false;
  }
}
// Our own concentration card: DC + the rolled total (click to edit) + MAINTAINED/BROKEN + re-roll / break-toggle.
function buildConcCard(c) {
  const held = !!c.held;
  const tone = held ? 'var(--good)' : 'var(--bad)';
  const badge = held ? 'MAINTAINED' : 'BROKEN';
  const bic = held ? IC.hit : IC.miss;
  const pill = `<span class="ddbx2-pill">${c.source === 'player' ? 'player roll' : 'auto'}</span>`;
  const toggle = held
    ? `<button data-ddbx="conc-toggle"><i class="fas ${IC.miss}"></i> Break</button>`
    : `<button data-ddbx="conc-toggle"><i class="fas ${IC.reopen}"></i> Restore</button>`;
  return `<div class="ddbx2"><div class="ddbx2-act"><i class="fas ${IC.save}"></i> ${esc(c.name)} — Concentration ${pill}</div>`
    + `<div class="ddbx2-sec"><div class="ddbx2-lbl"><i class="fas ${IC.save}"></i> DC ${c.dc} Constitution Save</div>`
    + `<div class="ddbx2-num" data-ddbx="conc-edit" title="Click to enter your own total" style="cursor:pointer;">${c.total}</div>`
    + `<div class="ddbx2-resolved" style="color:${tone};"><i class="fas ${bic}"></i> ${badge}</div>`
    + `<div class="ddbx2-bar inline"><button data-ddbx="conc-reroll"><i class="fas ${IC.d20}"></i> Re-roll</button>${toggle}</div></div></div>`;
}
async function saveConcCard(conc, message) { try { await message.update({ content: buildConcCard(conc), flags: { [NS]: { conc } } }); } catch (e) {} }
async function postConcCard(conc) { try { return await ChatMessage.create({ speaker: { alias: conc.name }, whisper: ChatMessage.getWhisperRecipients('GM').map(u => u.id), content: buildConcCard(conc), flags: { [NS]: { conc } } }); } catch (e) { console.warn('DDB Roll Cards | postConcCard', e); } }
// Build + post the concentration card, breaking concentration immediately if the save already failed.
async function createConcCard(actor, dc, total, source) {
  const img = actor.img || actor.prototypeToken?.texture?.src || '';
  const conc = { actorId: actor.id, name: actor.name, img, dc, total: Number(total) || 0, held: (Number(total) || 0) >= dc, broken: false, source };
  await concReconcile(actor, conc);
  await postConcCard(conc);
  concStinger(conc);
}
// Re-roll / edit recompute held vs DC, reconcile the effect, re-render, and replay the outcome cinematic.
async function concSetTotal(conc, total, message) {
  const actor = concActor(conc); conc.total = Number(total) || 0; conc.held = conc.total >= conc.dc;
  await concReconcile(actor, conc); await saveConcCard(conc, message); concStinger(conc);
}
async function onConcAction(action, conc, message) {
  try {
    if (!game.user?.isGM) return;
    const actor = concActor(conc);
    if (action === 'conc-reroll') {
      const { roll, total } = await rollConcRoll(actor);
      if (game.dice3d && roll) { try { await game.dice3d.showForRoll(roll, game.user, true); } catch (e) {} }
      if (total != null) { await concBeat(); await concSetTotal(conc, total, message); }
    } else if (action === 'conc-toggle') { conc.held = !conc.held; await concReconcile(actor, conc); await saveConcCard(conc, message); } // manual override — no cinematic
  } catch (e) { console.warn('DDB Roll Cards | conc action', e); }
}
// Damage applied to a concentrating creature → it's the one we just hit, so no selecting. NPCs auto-roll the CON
// save (after the universal step delay so it doesn't fire on top of the damage); players get a pending check
// resolved when their D&D Beyond CON save lands. DC = max(10, ½ damage). Either way it posts a concentration card.
async function maybeConcentration(actor, dealt) {
  try {
    if (!actor || !(dealt > 0) || !game.settings.get(NS, 'concentration')) return;
    if (!concEffects(actor).length) return;
    const dc = Math.max(10, Math.floor(dealt / 2));
    if (actor.hasPlayerOwner) {
      pendingConc.set(actor.name, { dc, ts: Date.now() });
      ui.notifications?.info?.(`${actor.name}: concentration — DC ${dc} CON save (awaiting their D&D Beyond roll).`);
    } else {
      // Beat: damage → step delay → roll the dice (Dice So Nice) → wait for them to land → step delay → reveal + resolve.
      setTimeout(async () => {
        try {
          const { roll, total } = await rollConcRoll(actor);
          if (game.dice3d && roll) { try { await game.dice3d.showForRoll(roll, game.user, true); } catch (e) {} }
          await concBeat();
          await createConcCard(actor, dc, total ?? 0, 'npc');
        } catch (e) { console.warn('DDB Roll Cards | conc', e); }
      }, autoDelayMs());
    }
  } catch (e) { console.warn('DDB Roll Cards | concentration', e); }
}
// A player's incoming CON save → show their dice, pause, then reveal + resolve the card (break on fail). Returns true if consumed.
async function resolveConcentration(name, total, dice) {
  if (!pendingConc.has(name)) return false;
  const { dc } = pendingConc.get(name); pendingConc.delete(name);
  const actor = actorByName(name);
  if (!actor) return true;
  const roll = dice ? forcedRoll(dice) : null;
  if (game.dice3d && roll) { try { await game.dice3d.showForRoll(roll, game.user, true); } catch (e) {} }
  await concBeat();
  await createConcCard(actor, dc, Number(total) || 0, 'player');
  return true;
}
/* ----------------------------------------------------------- auto-states */
// Apply/clear a system status effect idempotently — only touches it when the current state differs and only if the
// system actually defines that status, so it never duplicates or fights dnd5e's own automation (e.g. Bloodied).
async function ensureStatus(actor, id, active, overlay) {
  try {
    if (!actor?.toggleStatusEffect || !(CONFIG.statusEffects || []).some(e => e.id === id)) return;
    if (!!actor.statuses?.has?.(id) === !!active) return;
    await actor.toggleStatusEffect(id, { active: !!active, overlay: !!overlay });
  } catch (e) { console.warn('DDB Roll Cards | status', e); }
}
// Stamp a just-applied status's effect with the action's duration so dnd5e counts it down and our turn hook removes
// it when it expires. Flags the effect as ours. No-op for instantaneous actions (dur null) or if the setting is off.
async function setEffectDuration(actor, statusId, dur) {
  try {
    if (!dur || (!dur.rounds && !dur.seconds) || !game.settings.get(NS, 'conditionDurations')) return;
    const eff = (actor.effects || []).find(e => e.statuses?.has?.(statusId) && !e.duration?.rounds && !e.duration?.seconds);
    if (!eff) return;
    const upd = { [`flags.${NS}.autoExpire`]: true };
    if (dur.rounds) { upd['duration.rounds'] = dur.rounds; if (game.combat) { upd['duration.startRound'] = game.combat.round || 0; upd['duration.startTurn'] = game.combat.turn || 0; } }
    if (dur.seconds) { upd['duration.seconds'] = dur.seconds; upd['duration.startTime'] = game.time?.worldTime ?? 0; }
    await eff.update(upd);
  } catch (e) { console.warn('DDB Roll Cards | setEffectDuration', e); }
}
// Mark/unmark the actor's combatant defeated (tracker + token skull) via the native combat document.
async function markDefeated(actor, defeated) {
  try {
    const combat = game.combat ?? game.combats?.active; if (!combat) return;
    const tok = canvas.tokens?.placeables?.find(t => t.actor?.id === actor.id);
    const c = combat.combatants.find(cb => (tok && cb.tokenId === tok.id) || cb.actorId === actor.id);
    if (c && c.defeated !== defeated) await c.update({ defeated });
  } catch (e) {}
}
// Reconcile HP-threshold states using the SYSTEM's own status effects + defeated mark. Returns the transition this
// hit caused ('slain' | 'down' | 'bloodied') for the cinematic, or null. Status changes are idempotent and fire in
// the background; dnd5e already auto-applies Bloodied at ½ HP, so ensureStatus there is just a no-op safety net.
function autoStateApply(actor, oldHp, newHp, max) {
  try {
    if (!actor || !game.settings.get(NS, 'autoStates')) return null;
    const isPC = actor.type === 'character';
    const wasDown = oldHp <= 0, isDown = newHp <= 0;
    const oldPct = max > 0 ? oldHp / max : 0, newPct = max > 0 ? newHp / max : 0;
    const wasBlood = oldPct > 0 && oldPct <= 0.5, isBlood = newPct > 0 && newPct <= 0.5;
    let kind = null;
    if (isDown && !wasDown) { kind = isPC ? 'down' : 'slain'; if (kind === 'slain') featureDeathBurst(actor); } // explode-on-death
    else if (!isDown && isBlood && !wasBlood) kind = 'bloodied';
    if (isDown) {
      ensureStatus(actor, 'bloodied', false);
      if (isPC) ensureStatus(actor, 'unconscious', true);
      else { ensureStatus(actor, 'dead', true, true); markDefeated(actor, true); }
    } else {
      ensureStatus(actor, 'dead', false); ensureStatus(actor, 'unconscious', false); markDefeated(actor, false);
      ensureStatus(actor, 'bloodied', isBlood);
    }
    return kind;
  } catch (e) { console.warn('DDB Roll Cards | autoState', e); return null; }
}
const STATE_FX = { bloodied: { word: 'Bloodied', color: '#d65a3a', cue: 'bloodied' }, down: { word: 'Down', color: '#8fa9d6', cue: 'down' }, slain: { word: 'Slain', color: '#b3402e', cue: 'slain' } };
// Result-style cinematic for a state transition, tinted by the state, with the creature portrait + its own cue.
function stateStinger(actor, kind) {
  try {
    if (!game.user?.isGM) return;
    const fx = STATE_FX[kind]; if (!fx || !actor) return;
    const img = actor.img || actor.prototypeToken?.texture?.src || '';
    const payload = { phase: 'result', word: fx.word, color: fx.color, actorImg: img, who: actor.name, cue: fx.cue };
    playStinger(payload);
    try { game.socket?.emit(`module.${NS}`, { t: 'stinger', payload }); } catch (e) {}
  } catch (e) { console.warn('DDB Roll Cards | stateStinger', e); }
}
// Across a damage application, apply states to every target but play ONE cinematic for the most severe transition
// (slain > down > bloodied), sequenced after the impact cinematic so they don't pile on top of each other.
function runAutoStates(rows) {
  const sev = { bloodied: 1, down: 2, slain: 3 };
  let worst = null, worstActor = null;
  for (const r of rows) { const k = autoStateApply(r.actor, r.oldHp, r.newHp, r.max); if (k && (!worst || sev[k] > sev[worst])) { worst = k; worstActor = r.actor; } }
  if (worst && worstActor) setTimeout(() => { try { stateStinger(worstActor, worst); } catch (e) {} }, autoDelayMs());
}
// Damage types a creature has taken since its last turn (GM-local) — used by Regeneration's fire/acid suppression.
const _dmgTypes = new Map();
function noteDmg(actor, type) { try { if (!actor || !type) return; const id = actor.id; if (!_dmgTypes.has(id)) _dmgTypes.set(id, new Set()); _dmgTypes.get(id).add(String(type).toLowerCase()); } catch (e) {} }
function dmgTypeOf(dmg) { return (dmg?.parts || []).map(p => p.type).filter(Boolean)[0] || ''; }
// Regeneration at the start of a creature's turn: heal the amount in its "Regeneration" feature, UNLESS it took one
// of the feature's suppressing damage types (e.g. fire/acid) since its last turn. Heals a monster only — safe.
async function featureRegeneration(actor) {
  try {
    if (!game.settings.get(NS, 'featureAutomation')) return;
    const feat = (actor.items || []).find(it => /regeneration/i.test(it.name || ''));
    if (!feat) return;
    const desc = (feat.system?.description?.value || '').toLowerCase();
    const amt = Number(desc.match(/regains?\s+(\d+)\s+hit points/)?.[1] || 0);
    if (!amt) return;
    const hp = actor.system?.attributes?.hp ?? {};
    if ((hp.value || 0) <= 0 || (hp.value || 0) >= (hp.max || 0)) return; // no regen while at 0 (dying) or already full
    const suppress = ['fire', 'acid', 'radiant', 'necrotic', 'cold', 'lightning', 'force', 'psychic'].filter(t => desc.includes(t));
    const took = _dmgTypes.get(actor.id);
    if (took && suppress.some(t => took.has(t))) {
      const why = suppress.filter(t => took.has(t)).join('/');
      postFeatureLog(actor, '🚫', `Regeneration suppressed — took ${why} damage (would have healed ${amt}).`, 'bad');
      return;
    }
    await applyHealing(actor, amt);
    recurringStingerHeal(actor, amt);
    postFeatureLog(actor, '✚', `Regeneration — healed ${amt} HP.`, 'heal');
  } catch (e) { console.warn('DDB Roll Cards | regeneration', e); }
}
// Recurring condition damage at the start of a creature's turn — data-driven from COND_LEX[id].recurring (Burning =
// 1d4 fire). Rolls (with Dice So Nice), applies resistance-aware, plays the impact cinematic, and re-checks states.
async function recurringTick(actor) {
  try {
    if (!actor) return;
    await featureRegeneration(actor); // start-of-turn heal (uses damage taken during the round)
    await featureAuras(actor);        // resolve this creature's auras vs everyone in range (own setting gate inside)
    _dmgTypes.delete(actor.id);       // new turn — reset the "took since last turn" tracker (burning below counts for next turn)
    if (!game.settings.get(NS, 'recurringConditions')) return;
    for (const [id, entry] of Object.entries(COND_LEX)) {
      const rec = entry.recurring;
      if (!rec || rec.when !== 'turnStart' || !actor.statuses?.has?.(id)) continue;
      let total = 0, roll = null;
      try { roll = new Roll(String(rec.formula || '0')); await roll.evaluate(); total = Math.max(0, Math.round(roll.total)); } catch (e) {}
      if (game.dice3d && roll) { try { await game.dice3d.showForRoll(roll, game.user, true); } catch (e) {} }
      await concBeat(); // brief pause after the dice, like concentration
      const hpWas = Number(actor.system?.attributes?.hp?.value) || 0;
      try { if (typeof actor.applyDamage === 'function') await actor.applyDamage([{ value: total, type: rec.type }]); else await manualDamage(actor, total); } catch (e) { try { await manualDamage(actor, total); } catch (x) {} }
      noteDmg(actor, rec.type);
      const hp = actor.system?.attributes?.hp ?? {};
      recurringStinger(actor, rec, total);
      runAutoStates([{ actor, oldHp: hpWas, newHp: Number(hp.value) || 0, max: Number(hp.max) || 0 }]); // a tick can bloody/down/kill
    }
  } catch (e) { console.warn('DDB Roll Cards | recurringTick', e); }
}
// Reuse the impact cinematic (zoom-on-token + themed FX + number) for a recurring tick, broadcast to all clients.
function recurringStinger(actor, rec, total) {
  try {
    if (!game.user?.isGM) return;
    const img = actor.img || actor.prototypeToken?.texture?.src || '';
    const payload = { phase: 'impact', total, dtype: rec.type, srcLabel: rec.label || '', heal: false, actorImg: img, who: actor.name, img, applyIds: [actor.id], cue: 'dmg.' + dmgKey(rec.type) };
    playStinger(payload);
    try { game.socket?.emit(`module.${NS}`, { t: 'stinger', payload }); } catch (e) {}
  } catch (e) {}
}
// Green "+N" heal impact cinematic on a creature (regeneration / absorption), broadcast to all clients.
function recurringStingerHeal(actor, amt) {
  try {
    if (!game.user?.isGM || !actor || !amt) return;
    const img = actor.img || actor.prototypeToken?.texture?.src || '';
    const payload = { phase: 'impact', total: amt, heal: true, dtype: '', actorImg: img, who: actor.name, img, applyIds: [actor.id], cue: 'heal' };
    playStinger(payload);
    try { game.socket?.emit(`module.${NS}`, { t: 'stinger', payload }); } catch (e) {}
  } catch (e) {}
}
// Absorption: a creature with a "<type> Absorption" feature item (Fire Absorption, Lightning Absorption, …).
function absorbsType(actor, type) {
  if (!actor || !type) return false;
  const t = String(type).toLowerCase();
  // /absor[bp]/ matches BOTH "absorb" and "absorPtion" — the feature is named "Fire Absorption", and the word
  // "absorption" has no 'b', so the old /absorb/ never matched and Absorption silently never fired.
  return (actor.items || []).some(it => { const n = (it.name || '').toLowerCase(); return /absor[bp]/.test(n) && n.includes(t); });
}
// Damage fraction from the outcome alone (no resistance) — what an absorbing creature heals by.
function outcomeMult(outcome, onSave, isAtk) {
  if (isAtk) return outcome === 'hit' ? 1 : 0;
  if (outcome === 'save') return onSave === 'half' ? 0.5 : 0;
  return 1; // fail / unknown → full
}
// Undead Fortitude: a killing blow on a creature with this feature triggers a CON save (DC 5 + damage taken) unless
// the damage was radiant or a critical hit; on a success it clings to 1 HP instead of dropping to 0. Returns true if it survived.
async function undeadFortitude(actor, dealt, dtype, isCrit) {
  try {
    if (!actor || !game.user?.isGM || !game.settings.get(NS, 'featureAutomation')) return false;
    if (!(actor.items || []).some(it => /undead fortitude/i.test(it.name || ''))) return false;
    if (isCrit || /radiant/i.test(dtype || '')) { ui.notifications?.info?.(`${actor.name}: Undead Fortitude doesn't apply (${isCrit ? 'critical hit' : 'radiant'}).`); return false; }
    const dc = 5 + Math.max(0, Math.round(dealt));
    const total = await rollOneSave(actor.name, 'con');
    const ok = typeof total === 'number' && total >= dc;
    if (ok) await actor.update({ 'system.attributes.hp.value': 1 });
    const payload = { phase: 'result', word: 'Undead Fortitude', tone: ok ? 'success' : 'failure', dc, actorImg: actor.img || '', who: actor.name, cue: ok ? 'success' : 'failure' };
    playStinger(payload); try { game.socket?.emit(`module.${NS}`, { t: 'stinger', payload }); } catch (e) {}
    ui.notifications?.info?.(`${actor.name}: Undead Fortitude — CON ${total ?? '—'} vs DC ${dc}: ${ok ? 'clings to 1 HP!' : 'dies.'}`);
    return ok;
  } catch (e) { console.warn('DDB Roll Cards | undead fortitude', e); return false; }
}
// Unified apply: per-target damage/healing (portion × parts) + conditions, then confirm/reveal in one shot.
// Records exactly what was done per target so the undo can reverse it precisely.
async function applyAll(card, message) {
  const dmg = card?.dmg; if (!dmg) return;
  const targets = card.targets || []; if (!targets.length) { ui.notifications.warn('DDB: no targets to apply to.'); return; }
  const isAtk = !!card.atk, heal = !!card.heal; const parts = dmgApplyParts(dmg); const audit = []; const detail = {};
  const absorbedRows = [];
  for (const t of targets) {
    const k = tkey(t); const actor = targetActor(t); if (!actor) continue;
    const hpWas = Number(actor.system?.attributes?.hp?.value) || 0;
    const outcome = isAtk ? (card.atk.verdicts?.[k] ?? defaultHit(t, atkEff(card.atk))) : card.save?.results?.[k];
    const gmMult = card.tgt?.[k]?.mult;
    const cardType = dmgTypeOf(dmg);
    // Absorption: a creature with "<type> Absorption" takes no damage of that type and instead HEALS by what it
    // would have taken (ignoring resistance/immunity it also carries — absorb beats resist). Honors a GM portion override.
    const absorbing = !heal && game.settings.get(NS, 'featureAutomation') && absorbsType(actor, cardType);
    let mult, dealt, rowHeal = heal, absorbed = false;
    if (absorbing) {
      absorbed = true; rowHeal = true;
      mult = (gmMult != null) ? Math.abs(gmMult) : outcomeMult(outcome, card.save?.onSave, isAtk);
      dealt = Math.floor(dmgTotal(dmg) * mult);
      if (dealt) { try { await applyHealing(actor, dealt); } catch (e) { console.error(e); } absorbedRows.push({ actor, amt: dealt, type: cardType }); }
    } else {
      mult = (gmMult != null) ? gmMult : defaultPortion(outcome, card.save?.onSave, actor, dmg.parts);
      // Portion already includes resistance, so apply total×portion directly (no second resistance pass).
      dealt = Math.floor(dmgTotal(dmg) * Math.abs(mult));
      if (mult !== 0) { try { await (heal ? applyHealing : manualDamage)(actor, dealt); } catch (e) { console.error(e); } }
      if (!heal && mult > 0 && dealt) noteDmg(actor, cardType); // for Regeneration suppression
    }
    // Undead Fortitude: a killing blow may leave the creature clinging to 1 HP (CON save) — checked before states.
    if (!absorbed && !heal && dealt > 0 && hpWas > 0 && (Number(actor.system?.attributes?.hp?.value) || 0) <= 0) {
      await undeadFortitude(actor, dealt, cardType, isAtk && card.atk?.nat === 20);
    }
    // If on-hit riders already owned this attack's conditions (save-aware, applied at hit-confirm), don't re-apply
    // the default actionConds here — that would re-add a condition the target SAVED against. GM per-target/condId picks still ride.
    const conds = [...(card.tgt?.[k]?.conditions ?? ((isAtk && card.atk?.ridersHandled) ? [] : defaultConds(outcome, card)))];
    // The dropdown-chosen condition rides along, applied to its matching group (on hit/miss/all).
    if (card.condId) {
      const grp = isAtk ? (outcome === 'hit' ? 'dmg' : 'safe') : (outcome === 'fail' ? 'dmg' : 'safe');
      const when = card.condWhen || 'all';
      if ((when === 'all' || when === grp) && !conds.includes(card.condId)) conds.push(card.condId);
    }
    const added = [];
    for (const cid of conds) { const has = actor.statuses?.has?.(cid); if (!has) { try { await actor.toggleStatusEffect?.(cid, { active: true }); added.push(cid); await setEffectDuration(actor, cid, card.duration); } catch (e) { console.error(e); } } }
    const ahp = actor.system?.attributes?.hp ?? {};
    detail[k] = { name: t.name, mult, dealt, heal: rowHeal, absorbed, added, hpWas, hpVal: Number(ahp.value) || 0, hpMax: Number(ahp.max) || 0 };
    audit.push(`${t.name} ${rowHeal ? '+' : ''}${dealt}${absorbed ? ' (absorbed)' : ''}${conds.length ? ' [' + conds.map(condLabel).join(', ') + ']' : ''}`);
  }
  for (const r of absorbedRows) recurringStingerHeal(r.actor, r.amt); // green "+N" on each creature that absorbed
  const txt = `Applied — ${audit.join(', ')}`;
  const set = (c) => { if (c) { c.applied = true; c.audit = txt; c.revealed = true; c.appliedDetail = detail; if (c.atk) c.atk.confirmed = true; } };
  set(card); const rec = actionCards.get(cardKey(card)); if (rec) { set(rec.gm); set(rec.pub); }
  await syncCards(card, message);
  announce(card, 'impact');
  // Concentration: any damaged creature that's concentrating must check (it's the one we just hit — no selecting).
  for (const t of targets) { const d = detail[tkey(t)]; if (d && d.dealt && !d.heal) maybeConcentration(targetActor(t), d.dealt); }
  // Auto-states: bloodied/down/dead per target (system status effects + defeated), one cinematic for the worst.
  runAutoStates(targets.map(t => { const d = detail[tkey(t)]; const a = targetActor(t); return (d && a) ? { actor: a, oldHp: d.hpWas, newHp: d.hpVal, max: d.hpMax } : null; }).filter(Boolean));
  // The card itself now shows the "Applied — …" audit inline, so no separate GM whisper (it just cluttered chat).
}
// Undo = reverse exactly what applyAll did: heal back the damage (or remove the healing) and drop only the
// conditions we actually added (leave ones the target already had).
async function reopenAll(card, message) {
  const detail = card.appliedDetail || {};
  for (const [k, det] of Object.entries(detail)) {
    const actor = targetActor({ id: k, name: det.name }); if (!actor) continue;
    try { await (det.heal ? manualDamage : applyHealing)(actor, det.dealt); } catch (e) { console.error(e); }
    for (const cid of (det.added || [])) { try { await actor.toggleStatusEffect?.(cid, { active: false }); } catch (e) { console.error(e); } }
    // Reverse any auto-states the damage triggered (no cinematic on undo): reconcile from the damaged HP back to now.
    if (det.hpWas != null) autoStateApply(actor, det.hpVal, Number(actor.system?.attributes?.hp?.value) || 0, det.hpMax);
  }
  await clearOnHitRiders(card); // on-hit rider conditions are owned separately from applyAll's added[] — drop them too
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
function onAction(action, card, message, ds) {
  if (!game.user?.isGM) { ui.notifications.warn('DDB: only the GM can apply card actions.'); return; }
  switch (action) {
    case 'mult': return applyMult(card, Number(ds.mult), message);
    case 'reopen': return reopenDamage(card, message);
    case 'verdict': return setVerdict(card, ds.v, message);
    case 'reverdict': return setVerdict(card, null, message);
    case 'markhit': return markHit(card, ds.tkey, ds.v, message);
    case 'react': return applyReaction(card, ds.tkey, message);
    case 'unreact': return undoReaction(card, ds.tkey, message);
    case 'confirmhits': return confirmHits(card, message);
    case 'reopenhits': return reopenHits(card, message);
    case 'genverdict': return setGenVerdict(card, ds.v, message);
    case 'legres': return useLegendaryResistance(card, message);
    case 'regen': return setGenVerdict(card, null, message);
    case 'checkdc': return setCheckDC(card, Number(ds.dc), message);
    case 'rollallcontest': return rollAllContest(card, message);
    case 'revealcontest': return revealContest(card, message);
    case 'hidecontest': return hideContest(card, message);
    case 'cancelgroup': return cancelGroupContest(card, message);
    case 'gmode': return setGroupMode(card, ds.mode, message);
    case 'gdc': return setGroupDC(card, Number(ds.dc), message);
    case 'mark': return markSave(card, ds.tkey, ds.v, message);
    case 'rolldamage': return rollItemDamage(card);
    case 'rollallsaves': return rollAllSaves(card, message);
    case 'tmult': return setTargetMult(card, ds.tkey, Number(ds.mult), message);
    case 'applyall': return applyAll(card, message);
    case 'reopenall': return reopenAll(card, message);
    case 'reveal': return revealDamage(card, message);
  }
}

/* ------------------------------------------------------------- socket tap */
function onRaw(ev) {
  let msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
  // Debug: surface EVERY game-log event type (not just dice) so we can see what DDB sends for non-roll actions.
  try { if (game.settings.get(NS, 'debug') && typeof msg?.eventType === 'string' && !msg.eventType.startsWith('dice/roll')) console.log('[ddbx ddb-event]', msg.eventType, msg); } catch (e) {}
  if (typeof msg?.eventType !== 'string' || !msg.eventType.startsWith('dice/roll')) return;
  const data = msg.data || msg; const rollId = data.rollId || msg.id;
  try { if (game.settings.get(NS, 'debug')) console.log('[ddbx ddb-roll]', { eventType: msg.eventType, action: data.action, rollType: data.rolls?.[0]?.rollType, rollKind: data.rolls?.[0]?.rollKind, total: data.rolls?.[0]?.result?.total, data }); } catch (e) {}
  if (!rollId || seen.has(rollId)) return; seen.set(rollId, Date.now());
  if (!data.rolls?.length) return;
  enqueueRoll(() => renderRoll(data));
}
// Small GM-only chip showing the live D&D Beyond link status (green=connected, amber=connecting, red=down). Click to reconnect.
let _connEl = null;
function setDdbStatus(state, detail) {
  try {
    if (!game.user?.isGM) return;
    if (!_connEl) {
      _connEl = document.createElement('div'); _connEl.className = 'ddbx-conn';
      _connEl.innerHTML = `<span class="dot"></span><span class="lbl">DDB</span>`;
      _connEl.addEventListener('click', () => { try { setDdbStatus('connecting', 'Reconnecting…'); reconnect(); } catch (e) {} });
      (document.getElementById('interface') || document.body).appendChild(_connEl);
    }
    _connEl.classList.remove('ok', 'warn', 'down');
    _connEl.classList.add(state === 'connected' ? 'ok' : state === 'connecting' ? 'warn' : 'down');
    _connEl.querySelector('.lbl').textContent = state === 'connected' ? 'DDB' : state === 'connecting' ? 'DDB…' : 'DDB ✕';
    _connEl.title = detail || (state === 'connected' ? 'D&D Beyond link active — click to reconnect' : state === 'connecting' ? 'Connecting to D&D Beyond…' : 'D&D Beyond link down — click to reconnect');
  } catch (e) {}
}
function attachTap() { const ws = game.DDBSync?.websocketManager?.websocket?.ws; if (ws) setDdbStatus('connected', 'Riding ddb-sync socket'); if (ws && !ws.__ddbxTapped) { ws.__ddbxTapped = true; ws.addEventListener('message', onRaw); console.log('DDB Roll Cards | tapped ddb-sync socket'); } }
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
    this.closed = false; setDdbStatus('connecting');
    this.token = await this.mintToken();
    if (!this.token) { ui.notifications.warn('DDB Roll Cards: could not authenticate with D&D Beyond (check cobalt cookie / proxy URL).'); setDdbStatus('down', 'Authentication failed — check the cobalt cookie / proxy URL.'); return; }
    const url = `wss://game-log-api-live.dndbeyond.com/v1?gameId=${this.cfg.campaignId}&userId=${this.cfg.userId}&stt=${this.token}`;
    try { this.ws = new WebSocket(url); } catch (e) { console.error('DDB Roll Cards | ws create failed', e); this.scheduleReconnect(); return; }
    this.ws.onopen = () => { this.attempts = 0; this.send({ type: 'authenticate', data: { token: this.token, campaignId: this.cfg.campaignId } }); console.log('DDB Roll Cards | own DDB socket connected'); };
    this.ws.onmessage = (e) => this.onMsg(e);
    this.ws.onerror = (e) => console.error('DDB Roll Cards | ws error', e);
    this.ws.onclose = (e) => { if (!this.closed && e.code !== 1000) this.scheduleReconnect(); };
  }
  onMsg(e) {
    let m; try { m = JSON.parse(e.data); } catch (x) { return; }
    if (m?.eventType === 'authenticated') { setDdbStatus('connected', 'D&D Beyond link active (standalone) — click to reconnect'); this.send({ type: 'subscribe', data: { event: 'character.update', campaignId: this.cfg.campaignId } }); return; }
    onRaw(e); // dice rolls → our renderer (ignores everything non-dice)
  }
  send(d) { if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(typeof d === 'string' ? d : JSON.stringify(d)); }
  scheduleReconnect() { if (this.attempts >= this.max) { console.error('DDB Roll Cards | max reconnect attempts'); setDdbStatus('down', 'D&D Beyond link lost — click to retry.'); return; } this.attempts++; setDdbStatus('connecting', `Reconnecting to D&D Beyond (attempt ${this.attempts})…`); setTimeout(() => { if (!this.closed) this.connect(); }, this.delay * this.attempts); }
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
// Per-client sound assignment: one row per event with a default, a file browser, a preview, and reset.
class SoundApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = { id: 'ddbx-sounds', tag: 'div', window: { title: 'DDB Roll Cards — Sound Effects', icon: 'fas fa-volume-high' }, position: { width: 660, height: 'auto' } };
  _cfg() { try { return game.settings.get(NS, 'soundConfig') || {}; } catch (e) { return {}; } }
  async _renderHTML() {
    const cfg = this._cfg();
    const rows = SOUND_EVENTS.map(([cue, label]) => {
      const val = (cue in cfg) ? cfg[cue] : (DEFAULT_SOUNDS[cue] || '');
      return `<tr data-cue="${esc(cue)}">
        <td style="white-space:nowrap;padding:3px 8px 3px 0;font-size:12px">${esc(label)}</td>
        <td style="width:100%"><input class="s-url" value="${esc(val)}" style="width:100%;font-size:11px"></td>
        <td><a class="s-browse" title="Browse files"><i class="fas fa-folder-open"></i></a></td>
        <td><a class="s-play" title="Preview"><i class="fas fa-play"></i></a></td>
        <td><a class="s-reset" title="Reset to default"><i class="fas fa-rotate-left"></i></a></td></tr>`;
    }).join('');
    return `<div style="padding:8px 10px">
      <p style="font-size:11px;opacity:.7;margin:0 0 8px">Every event has a default from the bundled library. Browse to choose your own, ▶ to preview, ↺ to reset one. Leave a field empty to silence that event. Saved per-user.</p>
      <table style="width:100%;border-collapse:collapse"><tbody class="s-body">${rows}</tbody></table>
      <div style="display:flex;align-items:center;gap:6px;margin-top:10px">
        <button type="button" class="s-resetall"><i class="fas fa-rotate-left"></i> Reset all</button>
        <span style="flex:1"></span>
        <button type="button" class="s-cancel">Cancel</button>
        <button type="button" class="s-save"><i class="fas fa-check"></i> Save</button></div></div>`;
  }
  async _replaceHTML(result, content) { content.innerHTML = result; this._wire(content); }
  _wire(root) {
    const FP = foundry.applications?.apps?.FilePicker?.implementation || FilePicker;
    root.querySelectorAll('.s-browse').forEach(a => a.addEventListener('click', e => {
      const inp = e.currentTarget.closest('tr').querySelector('.s-url');
      try { new FP({ type: 'audio', current: inp.value || '', callback: p => { inp.value = p; } }).render(true); }
      catch (err) { ui.notifications.warn('Could not open the file picker.'); }
    }));
    root.querySelectorAll('.s-play').forEach(a => a.addEventListener('click', e => { const v = e.currentTarget.closest('tr').querySelector('.s-url').value.trim(); if (v) playCueSound(v); }));
    root.querySelectorAll('.s-reset').forEach(a => a.addEventListener('click', e => { const tr = e.currentTarget.closest('tr'); tr.querySelector('.s-url').value = DEFAULT_SOUNDS[tr.dataset.cue] || ''; }));
    root.querySelector('.s-resetall')?.addEventListener('click', () => root.querySelectorAll('tr[data-cue]').forEach(tr => tr.querySelector('.s-url').value = DEFAULT_SOUNDS[tr.dataset.cue] || ''));
    root.querySelector('.s-cancel')?.addEventListener('click', () => this.close());
    root.querySelector('.s-save')?.addEventListener('click', async () => {
      // Store only deviations from the default, so future default changes still flow through.
      const out = {};
      root.querySelectorAll('tr[data-cue]').forEach(tr => { const cue = tr.dataset.cue, v = tr.querySelector('.s-url').value.trim(); if (v !== (DEFAULT_SOUNDS[cue] || '')) out[cue] = v; });
      await game.settings.set(NS, 'soundConfig', out); ui.notifications.info('DDB Roll Cards: sound settings saved.'); this.close();
    });
  }
}
function editSounds() { new SoundApp().render(true); }

/* ---------------------------------------------------- cinematic phase stingers */
// Average-color → hue, so each action's stinger themes itself off its own art (consistent saturation).
function rgbToHue(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return null; let h; if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; return ((Math.round(h * 60)) + 360) % 360; }
// Hue of the most saturated (vivid) pixel in the art — more representative than an average.
function imgHue(src) { return new Promise(res => { if (!src) return res(null); const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => { try { const S = 24; const cv = document.createElement('canvas'); cv.width = cv.height = S; const x = cv.getContext('2d'); x.drawImage(img, 0, 0, S, S); const d = x.getImageData(0, 0, S, S).data; let bestSat = -1, bestHue = null; for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 60) continue; const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, dl = mx - mn; if (l < 0.12 || l > 0.92) continue; const s = dl === 0 ? 0 : dl / (1 - Math.abs(2 * l - 1)); if (s > bestSat) { bestSat = s; bestHue = rgbToHue(d[i], d[i + 1], d[i + 2]); } } res(bestHue); } catch (e) { res(null); } }; img.onerror = () => res(null); img.src = src; }); }
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
const TONE_HUE = { hit: 140, success: 140, miss: 0, failure: 0, crit: 45, critmiss: 352 };

/* ----------------------------------------------------------- sound cues */
// Defaults point at the user's Forge sound library (public URLs everyone can play). Each is overridable per-client
// in settings. sb() builds an encoded URL from a path relative to the Sounds root.
const SND_BASE = 'https://assets.forge-vtt.com/66aa49fcd530ac71a9d05346/My%20Stuff/Sounds/';
function sb(rel) { return SND_BASE + rel.split('/').map(encodeURIComponent).join('/'); }
const DEFAULT_SOUNDS = {
  declare: sb('Situational One-Shots/Cinematic_Whoosh/Trailer Boom_1.mp3'),
  hit: sb('Situational One-Shots/Cinematic_Epic Impact/Trailer Braam 1_1.mp3'),
  miss: sb('Situational One-Shots/Action_Miss Slash/Sword Swish 1_1.mp3'),
  success: sb('Situational One-Shots/Action_Heal/Big Heal 1_1.mp3'),
  failure: sb('SymphBadVictoryAcc MA011105.wav'),
  crit: sb('Situational One-Shots/Cinematic_Epic Impact/Trailer Braam 1_1.mp3'),
  critmiss: sb('Situational One-Shots/Cinematic_Horror/Horror Accent 1_1.mp3'),
  heal: sb('Situational One-Shots/Action_Heal/Big Heal 1_1.mp3'),
  groupdeclare: sb('Situational One-Shots/Cinematic_Suspense/Eerie Swell_1.mp3'),
  groupprogress: sb('Situational One-Shots/Trade_Typewriter/Typewriter - Bell_1.mp3'),
  groupreveal: sb('Situational One-Shots/Crowd Reaction/Crowd_Short Applause/Short Applause 1_1.mp3'),
  conchold: sb('Situational One-Shots/Action_Spell_General/Magic Whoosh 3_1.mp3'),
  concbreak: sb('Situational One-Shots/Cinematic_Horror/Horror Accent 1_1.mp3'),
  bloodied: sb('Situational One-Shots/Action_Heavy Slash/Sword Big Attack 1_1.mp3'),
  down: sb('Situational One-Shots/Action_Bomb/Bomb 3_1.mp3'),
  slain: sb('Situational One-Shots/Cinematic_Horror/Horror Accent 1_1.mp3'),
  'dmg.slashing': sb('Situational One-Shots/Action_Heavy Slash/Sword Big Attack 1_1.mp3'),
  'dmg.piercing': sb('Situational One-Shots/Action_Knife Swish/Knife Swish 1_1.mp3'),
  'dmg.bludgeoning': sb('Situational One-Shots/Action_Melee Hit/Strong Punch 1_1.mp3'),
  'dmg.fire': sb('Situational One-Shots/Action_Spell_Fire/Fire Impact 1_1.mp3'),
  'dmg.cold': sb('Situational One-Shots/Action_Spell_Ice/Ice Impact 1_1.mp3'),
  'dmg.lightning': sb('Situational One-Shots/Action_Spell_Lightning/Electric Impact 1_1.mp3'),
  'dmg.thunder': sb('Situational One-Shots/Action_Bomb/Bomb 3_1.mp3'),
  'dmg.acid': sb('Situational One-Shots/Trade_Alchemy/Craft Potion 3_1.mp3'),
  'dmg.poison': sb('Situational One-Shots/Action_Drown/Drown 3_1.mp3'),
  'dmg.necrotic': sb('Situational One-Shots/Action_Spell_General/Magic Whoosh 5_1.mp3'),
  'dmg.radiant': sb('Situational One-Shots/Action_Spell_Radiant/Divine Spell 1_1.mp3'),
  'dmg.psychic': sb('Situational One-Shots/Action_Spell_General/Magic Whoosh 3_1.mp3'),
  'dmg.force': sb('Situational One-Shots/Action_Spell_Earthen/Earth Spell 4_1.mp3'),
  'dmg.default': sb('Situational One-Shots/Action_Melee Hit/Strong Punch 4_1.mp3'),
};
// Event list for the settings form (cue, friendly label).
const SOUND_EVENTS = [
  ['declare', 'Roll declared'], ['hit', 'Attack hit'], ['miss', 'Attack miss'],
  ['success', 'Check / save success'], ['failure', 'Check / save failure'],
  ['crit', 'Critical success'], ['critmiss', 'Critical failure'], ['heal', 'Healing applied'],
  ['groupdeclare', 'Group check begins'], ['groupprogress', 'Group check — a roll lands'], ['groupreveal', 'Group check revealed'],
  ['conchold', 'Concentration held'], ['concbreak', 'Concentration broken'],
  ['bloodied', 'Bloodied (≤½ HP)'], ['down', 'Player downed'], ['slain', 'Enemy slain'],
  ['dmg.slashing', 'Damage · slashing'], ['dmg.piercing', 'Damage · piercing'], ['dmg.bludgeoning', 'Damage · bludgeoning'],
  ['dmg.fire', 'Damage · fire'], ['dmg.cold', 'Damage · cold'], ['dmg.lightning', 'Damage · lightning'], ['dmg.thunder', 'Damage · thunder'],
  ['dmg.acid', 'Damage · acid'], ['dmg.poison', 'Damage · poison'], ['dmg.necrotic', 'Damage · necrotic'],
  ['dmg.radiant', 'Damage · radiant'], ['dmg.psychic', 'Damage · psychic'], ['dmg.force', 'Damage · force'], ['dmg.default', 'Damage · other / physical'],
];
function dmgKey(t) { t = (t || '').toLowerCase(); return ['slashing', 'piercing', 'bludgeoning', 'fire', 'cold', 'lightning', 'thunder', 'acid', 'poison', 'necrotic', 'radiant', 'psychic', 'force'].includes(t) ? t : 'default'; }
// Resolve a cue to a URL: per-client override (incl. '' = muted) else the bundled default; damage types fall back to dmg.default.
function soundFor(cue) {
  if (!cue) return '';
  let cfg = {}; try { cfg = game.settings.get(NS, 'soundConfig') || {}; } catch (e) {}
  let url = (cue in cfg) ? cfg[cue] : DEFAULT_SOUNDS[cue];
  if (url == null && cue.startsWith('dmg.')) url = ('dmg.default' in cfg) ? cfg['dmg.default'] : DEFAULT_SOUNDS['dmg.default'];
  return url || '';
}
function playCueSound(url) {
  try {
    if (!url) return;
    let vol = 0.5; try { const v = Number(game.settings.get(NS, 'soundVolume')); if (v >= 0) vol = v; } catch (e) {}
    const AH = foundry.audio?.AudioHelper || globalThis.AudioHelper;
    AH?.play?.({ src: url, volume: vol, autoplay: true, loop: false }, false);
  } catch (e) { console.warn('DDB Roll Cards | sound', e); }
}
// Damage-type → theme hue + full-screen effect.
function damageHue(t) { t = (t || '').toLowerCase(); if (/fire/.test(t)) return 22; if (/cold/.test(t)) return 195; if (/light/.test(t)) return 55; if (/acid/.test(t)) return 95; if (/poison/.test(t)) return 110; if (/necro/.test(t)) return 280; if (/radiant/.test(t)) return 48; if (/psychic/.test(t)) return 300; if (/force/.test(t)) return 265; if (/thunder/.test(t)) return 275; return 0; }
function damageFx(t) { t = (t || '').toLowerCase();
  if (/slash/.test(t)) return '<div class="ddbx-fx fx-slash"><span></span><span></span><span></span></div>';
  if (/pierc/.test(t)) return '<div class="ddbx-fx fx-pierce">' + Array.from({ length: 10 }).map((_, i) => `<span style="transform:translate(-50%,-50%) rotate(${i * 36}deg)"></span>`).join('') + '</div>';
  if (/bludgeon|force|thunder/.test(t)) return '<div class="ddbx-fx fx-burst"><span></span><span></span></div>';
  if (/fire/.test(t)) return '<div class="ddbx-fx fx-fire"></div>';
  if (/cold/.test(t)) return '<div class="ddbx-fx fx-cold"></div>';
  if (/light/.test(t)) return '<div class="ddbx-fx fx-shock"></div>';
  if (/acid|poison/.test(t)) return '<div class="ddbx-fx fx-ooze"></div>';
  if (/heal/.test(t)) return '<div class="ddbx-fx fx-heal"></div>';
  return '<div class="ddbx-fx fx-impact"></div>';
}
// One participant in a group check (equal portraits, the skill they rolled, winner highlighted on reveal).
function groupChip(t) {
  const cls = t.win === true ? ' win' : t.win === false ? ' lose' : '';
  const crown = t.win === true ? `<span class="ddbx-crown"><i class="fas fa-crown"></i></span>` : '';
  const val = (t.total != null) ? `<span class="ddbx-gval">${t.total}</span>` : `<span class="ddbx-gval pend">…</span>`;
  const skill = t.skill ? `<span class="ddbx-gskill">${esc(t.skill)}</span>` : `<span class="ddbx-gskill pend"><i class="fas fa-hourglass-half"></i></span>`;
  return `<div class="ddbx-gp${cls}"><div class="ddbx-gp-img" style="background-image:url('${cleanUrl(t.img) || 'icons/svg/mystery-man.svg'}')">${crown}</div><div class="ddbx-gp-n">${esc(t.name)}</div>${skill}${val}</div>`;
}
let _declareEl = null, _declareTimer = null;
// Tear down any lingering cinematic (e.g. a cancelled group contest) on every client.
function clearStingerLocal() { try { _stQ = []; _stBusy = false; clearTimeout(_declareTimer); document.querySelectorAll('.ddbx-sting').forEach(el => el.remove()); _declareEl = null; liftDice(false); } catch (e) {} }
function hideStinger() { clearStingerLocal(); try { game.socket?.emit(`module.${NS}`, { t: 'clearsting' }); } catch (e) {} }
// Zoom + pan the canvas to frame the damaged target(s) during the impact cinematic, then drift back.
let _preImpactView = null, _restoreTimer = null;
function panToImpactByActors(actorIds) {
  try {
    if (!canvas?.ready || !(actorIds || []).length) return;
    const ids = new Set(actorIds);
    const toks = (canvas.tokens?.placeables || []).filter(t => t.actor && ids.has(t.actor.id));
    if (!toks.length) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const t of toks) { const c = t.center, r = Math.max(t.w, t.h) * 0.5; minX = Math.min(minX, c.x - r); maxX = Math.max(maxX, c.x + r); minY = Math.min(minY, c.y - r); maxY = Math.max(maxY, c.y + r); }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const bw = Math.max(1, maxX - minX), bh = Math.max(1, maxY - minY);
    const pad = 2.6; // leave breathing room so all targets stay comfortably in frame
    const scale = Math.max(0.25, Math.min(1.7, Math.min(window.innerWidth / (bw * pad), window.innerHeight / (bh * pad))));
    if (!_preImpactView) _preImpactView = { x: canvas.stage.pivot.x, y: canvas.stage.pivot.y, scale: canvas.stage.scale.x };
    canvas.animatePan({ x: cx, y: cy, scale, duration: 480 });
    clearTimeout(_restoreTimer);
    _restoreTimer = setTimeout(() => { try { if (_preImpactView) { canvas.animatePan({ ..._preImpactView, duration: 620 }); _preImpactView = null; } } catch (e) {} }, 2900);
  } catch (e) {}
}
// Briefly shake the game board for a damage impact (CSS transform burst on Foundry's canvas container).
let _shakeTimer = null;
function shakeScreen(level) {
  try {
    const el = document.getElementById('board') || document.getElementById('interface') || document.getElementById('canvas') || document.querySelector('#board, canvas#board');
    if (!el) return;
    const cls = `ddbx-shake-${level || 'med'}`;
    el.classList.remove('ddbx-shake-soft', 'ddbx-shake-med', 'ddbx-shake-hard');
    // Force reflow so re-adding the same class restarts the animation on rapid repeat hits.
    void el.offsetWidth; el.classList.add(cls);
    clearTimeout(_shakeTimer); _shakeTimer = setTimeout(() => el.classList.remove(cls), 700);
  } catch (e) {}
}
// Lift the Dice So Nice canvas above the cinematic so the 3D dice render on top of it.
function liftDice(on) {
  try {
    const c = document.getElementById('dice-box-canvas') || document.querySelector('canvas#dice-box-canvas, .dice-box-canvas');
    if (c) c.style.zIndex = on ? '100000' : '';
  } catch (e) {}
}
function markColor(m) { return (m === 'hit' || m === 'save') ? 'var(--good)' : (m === 'miss' || m === 'fail') ? 'var(--bad)' : ''; }
function markIcon(m) { return m === 'save' ? IC.save : (m === 'hit') ? IC.hit : (m === 'miss' || m === 'fail') ? IC.miss : ''; }
function targetChip(t, size, idx, n, layout) {
  const col = markColor(t.mark);
  // Targets are flex items in a centred row (.ddbx-tgrp) — no per-chip positioning, so the row always centres on
  // the same axis as the caster. A single target sits dead-centre; multiples fan out symmetrically.
  const win = (t.mark === 'hit' || t.mark === 'save'), lose = (t.mark === 'miss' || t.mark === 'fail');
  const cls = win ? ' win' : lose ? ' lose' : '';
  const mk = t.mark ? `<span class="ddbx-tg-m" style="color:${col}"><i class="fas ${markIcon(t.mark)}"></i></span>` : '';
  return `<div class="ddbx-tg${cls}" style="flex:0 0 auto;width:${size}px;height:${size}px;background-image:url('${cleanUrl(t.img) || 'icons/svg/mystery-man.svg'}');">${mk}<span class="ddbx-tg-n">${esc(t.name)}</span></div>`;
}
// Cinematics are SERIALIZED through a queue so a new one (e.g. the damage zoom from an early auto-apply) can never
// render on top of one already on screen. Declares are backdrop (the next result clears them), so they only briefly
// hold the queue; results/impacts hold it for their full on-screen life. With visuals off, no delay (sounds flow).
let _stQ = [], _stBusy = false;
function playStinger(p) { try { if (!p) return; _stQ.push(p); pumpStingers(); } catch (e) {} }
function pumpStingers() {
  if (_stBusy || !_stQ.length) return;
  const p = _stQ.shift(); _stBusy = true;
  try { renderStinger(p); } catch (e) { console.warn('DDB Roll Cards | stinger', e); }
  let visuals = true; try { visuals = game.settings.get(NS, 'stingers'); } catch (e) {}
  const occ = !visuals ? 0 : (p.phase === 'result' ? 7000 : p.phase === 'impact' ? 3400 : 1200);
  setTimeout(() => { _stBusy = false; pumpStingers(); }, occ + 300);
}
async function renderStinger(p) {
  try {
    if (!document.body) return;
    // Sound cue rides the same broadcast but has its own per-client toggle, so audio can play even with visuals off.
    if (p.cue) { try { if (game.settings.get(NS, 'sounds')) playCueSound(soundFor(p.cue)); } catch (e) {} }
    if (!game.settings.get(NS, 'stingers')) return;
    const layout = 'orbit';
    const crit = p.tone === 'crit' || p.tone === 'critmiss';
    // Declaration lingers (12s) until the result fires; result holds ~7s; the damage impact gets room to breathe.
    const dur = (p.phase === 'declare') ? 12000 : (p.phase === 'impact') ? 3400 : 7000;
    // A result OR a refreshed declaration (group progress tick) clears the lingering declaration first.
    if ((p.phase === 'result' || p.phase === 'declare') && _declareEl) { clearTimeout(_declareTimer); _declareEl.remove(); _declareEl = null; }
    // The RESULT is coloured by its OUTCOME (green hit/success, red miss/fail, gold crit, deep red crit-fail) —
    // that reads more clearly than the caster's theme colour, which only drives the declaration.
    let H = (p.phase === 'result' && TONE_HUE[p.tone] != null) ? TONE_HUE[p.tone] : hexToHue(p.color);
    if (p.phase === 'impact') H = p.heal ? 140 : (damageHue(p.dtype) ?? H ?? 0);
    if (H == null) { if (p.phase === 'result') H = TONE_HUE[p.tone] ?? 45; else H = (p.hue != null) ? p.hue : (await imgHue(p.img)); }
    if (H == null) H = p.heal ? 140 : 265;
    const colorBg = !!p.color && !(p.phase === 'result' && TONE_HUE[p.tone] != null); // result tone overrides the flat colour field
    // Group declaration persists until the GM reveals/cancels; criticals get their own win/fail flair.
    const persist = (p.phase === 'declare' && p.group);
    const critCls = p.tone === 'crit' ? ' crit critwin' : p.tone === 'critmiss' ? ' crit critfail' : '';
    const wrap = document.createElement('div'); wrap.className = `ddbx-sting lay-${layout} ph-${p.phase}${critCls}${colorBg ? ' colorbg' : ''}${persist ? ' persist' : ''}`;
    wrap.style.setProperty('--c1', `hsl(${H} 78% 62%)`); wrap.style.setProperty('--c2', `hsl(${H} 80% 26%)`); wrap.style.setProperty('--dur', dur + 'ms');
    let particles = ''; const N = p.phase === 'result' ? 44 : 30; for (let i = 0; i < N; i++) { const x = (Math.random() * 100).toFixed(1); const dl = (Math.random() * 1.8).toFixed(2); const du = (1.6 + Math.random() * 1.9).toFixed(2); const sz = (2 + Math.random() * 5).toFixed(1); const sway = Math.round(Math.random() * 50 - 25); const spark = i % 4 === 0 ? ' spark' : ''; particles += `<span class="ddbx-pt${spark}" style="left:${x}%;--sway:${sway}px;width:${sz}px;height:${sz}px;animation-delay:${dl}s;animation-duration:${du}s;"></span>`; }
    const tint = (p.tintArt && p.artHue != null);
    const bgFilter = tint ? `filter:blur(64px) ${recolor(p.artHue, 0.55)};` : "";
    const frame = `<div class="ddbx-radial"></div>`;
    // Layout A: the action artwork (weapon/spell) rides the caster portrait as a crest badge — only for real
    // action art (attacks/spells), never the check d20/crest placeholder.
    const actionBadge = (p.img && !p.crest) ? `<span class="ddbx-actbadge" style="background-image:url('${cleanUrl(p.img)}')"></span>` : '';
    const caster = p.actorImg ? `<div class="ddbx-casterwrap"><span class="ddbx-casterport"><span class="ddbx-caster" style="background-image:url('${cleanUrl(p.actorImg)}')"></span>${actionBadge}</span>${p.who ? `<span class="ddbx-cname">${esc(p.who)}</span>` : ''}</div>` : '';
    // Orbit: the caster portrait is the hero, so no emblem — just the glowing line for checks.
    const glow = p.tintArt ? '<div class="ddbx-glow"></div>' : '';
    const rsub = p.action ? `${esc(p.action)}${p.dc ? ` &middot; DC ${p.dc}` : ''}` : (p.dc ? `DC ${p.dc}` : '');
    const center = (p.phase === 'result')
      ? `<div class="ddbx-center"><div class="ddbx-burst"></div><div class="ddbx-result">${esc(p.word || '')}</div>${rsub ? `<div class="ddbx-rsub">${rsub}</div>` : ''}</div>`
      : `<div class="ddbx-center"><div class="ddbx-title">${esc(p.action || '')}</div>${glow}${p.total != null ? `<div class="ddbx-total">${p.total}</div>` : ''}${p.dc ? `<div class="ddbx-dc">DC ${p.dc}</div>` : ''}</div>`;
    const tg = p.targets || []; const tsize = 140; // ~1/3 smaller than the caster
    const targets = tg.length ? `<div class="ddbx-tgrp">${tg.slice(0, 8).map((t, i) => targetChip(t, tsize, i, Math.min(tg.length, 8), layout)).join('')}</div>` : '';
    const showBg = p.img && !colorBg;
    const bgEl = showBg ? `<div class="ddbx-bg" style="background-image:url('${cleanUrl(p.img)}');${bgFilter}"></div>` : '';
    // Checks get the decorative crest (tinted by the ability hue) as an ambient backdrop instead of the flat grey d20.
    const crestBg = p.crest ? `<div class="ddbx-crestbg" style="background-color:hsl(${H} 64% 58%);-webkit-mask:url('${WM_IMG}') center/50% no-repeat;mask:url('${WM_IMG}') center/50% no-repeat;"></div>` : '';
    const tex = '<div class="ddbx-tex"></div>';
    if (p.phase === 'impact') {
      // Full-screen damage/heal hit: themed FX + edge flash + screen shake, with a big circular action emblem,
      // a bold readable number and the type label stacked in the centre.
      const dmgType = p.heal ? 'healing' : p.dtype;
      const num = p.total != null ? `<div class="ddbx-result dmgnum">${p.total}</div>` : '';
      // When the damage comes from a source condition (e.g. Burning), show just that word ("BURN") — the
      // damage type is obvious from context, so we drop the redundant "fire damage" suffix.
      const labTxt = p.heal ? 'healing' : (p.srcLabel ? esc(p.srcLabel) : `${esc(p.dtype || '')} damage`);
      const lab = `<div class="ddbx-rsub">${labTxt}</div>`;
      wrap.classList.add('impactwrap');
      const art = p.img ? `<div class="ddbx-strike" style="background-image:url('${cleanUrl(p.img)}')"></div>` : '';
      // Art sits near the TOP and the number/label near the BOTTOM so the very centre stays clear for the
      // zoomed-in target token between them.
      wrap.innerHTML = `<div class="ddbx-vig hit"></div>${tex}<div class="ddbx-flash"></div>${damageFx(dmgType)}<div class="ddbx-impact-art">${art}</div><div class="ddbx-impact-readout">${num}${lab}</div>`;
      try { shakeScreen(p.heal ? 'soft' : ((p.total ?? 0) >= 25 ? 'hard' : 'med')); } catch (e) {}
      try { panToImpactByActors(p.applyIds); } catch (e) {}
    } else if (p.group) {
      // Group Check: every participant shown once as an equal; no central caster. Declare = live progress; result = reveal.
      const parts = (p.targets || []).slice(0, 12).map(t => groupChip(t)).join('');
      const isCheck = (p.mode || 'check') === 'check';
      let head;
      if (!p.reveal) head = `<div class="ddbx-title">Group Check</div><div class="ddbx-rsub">${isCheck ? 'party average' : 'contest'}${p.dc != null ? ` &middot; DC ${p.dc}` : ''}</div>`;
      else if (isCheck) head = `<div class="ddbx-title">Group Check</div><div class="ddbx-result">${esc(p.word || '—')}</div><div class="ddbx-rsub">party average${p.dc != null ? ` &middot; ${p.pass ? 'Success' : 'Failure'} vs DC ${p.dc}` : ''}</div>`;
      else head = `<div class="ddbx-result">${p.dc != null ? 'PASSED' : 'WINNER'}</div><div class="ddbx-rsub">${esc(p.word || '—')}</div>`;
      wrap.innerHTML = `${p.crest ? crestBg : bgEl}<div class="ddbx-vig"></div>${tex}<div class="ddbx-pts">${particles}</div><div class="ddbx-center gc-head">${head}</div><div class="ddbx-gparts${p.reveal ? ' revealing' : ''}">${parts}</div>`;
    } else {
      // Criticals get an extra full-screen colour flash (gold for a crit success, deep red for a crit failure).
      const critFx = (p.phase === 'result' && crit) ? '<div class="ddbx-critflash"></div>' : '';
      wrap.innerHTML = `${p.crest ? crestBg : bgEl}<div class="ddbx-vig"></div>${tex}${critFx}${frame}<div class="ddbx-pts">${particles}</div><div class="ddbx-stage">${caster}${center}${targets}</div>`;
    }
    // Render the cinematic just ABOVE the canvas but BELOW the UI: insert it right after #board (its own parent),
    // so the map is covered dramatically while chat/toolbar/hotbar stay on top and interactive. No sidebar measuring.
    const board = document.getElementById('board');
    if (board?.parentElement) board.parentElement.insertBefore(wrap, board.nextSibling);
    else document.body.appendChild(wrap);
    // #board's parent can be a transformed/contained block, so `position:fixed; inset:0` doesn't reach the true
    // viewport edges — leaving content off-centre. Force the wrap to exactly fill the viewport and correct any
    // offset its containing block introduced, so a single target sits dead-centre.
    try {
      wrap.style.right = ''; wrap.style.bottom = '';
      wrap.style.left = '0px'; wrap.style.top = '0px'; wrap.style.width = '100vw'; wrap.style.height = '100vh';
      const r = wrap.getBoundingClientRect();
      if (Math.abs(r.left) > 0.5) wrap.style.left = (-r.left) + 'px';
      if (Math.abs(r.top) > 0.5) wrap.style.top = (-r.top) + 'px';
    } catch (e) {}
    liftDice(true);
    const done = () => { wrap.remove(); if (_declareEl === wrap) _declareEl = null; if (!document.querySelector('.ddbx-sting')) liftDice(false); };
    // A group contest declaration stays up until all rolls land (reveal) or the GM cancels — no auto-dismiss.
    if (p.phase === 'declare') { _declareEl = wrap; if (!p.group) _declareTimer = setTimeout(done, dur); }
    else setTimeout(done, dur);
  } catch (e) { console.warn('DDB Roll Cards | stinger', e); }
}
// GM builds the terse phase payload and broadcasts it to every client. Always runs (so sound cues fire even when
// the visual stinger is disabled); the visual itself is gated inside playStinger.
function announce(card, phase, opts = {}) {
  try {
    if (!game.user?.isGM) return;
    const isCheck = !!card.gen;
    const actor = card.actorId ? game.actors.get(card.actorId) : null;
    const hue = abilityHue(card.ability || card.save?.ability);
    const group = !!card.gen?.group;
    const base = { phase, action: isCheck ? (card.gen.label || card.action) : card.action, img: card.img || '', actorImg: actor?.img || '', who: card.who || actor?.name || '', hue, tintArt: isCheck && hue != null, artHue: hue, color: actorThemeColor(actor), dc: card.gen?.dc ?? card.save?.dc ?? null, group, crest: isCheck };
    let payload;
    if (phase === 'impact') {
      // applyMult records actor ids on dmg.applied; applyAll doesn't — fall back to resolving the card's targets.
      let applyIds = (card.dmg?.applied || []).map(a => a.id).filter(Boolean);
      if (!applyIds.length) applyIds = (card.targets || []).map(t => targetActor(t)?.id).filter(Boolean);
      payload = { ...base, total: dmgTotal(card.dmg), dtype: (card.dmg?.parts || []).map(p => p.type).filter(Boolean)[0] || dmgTypeLabel(card.dmg), heal: !!card.heal, applyIds };
    } else if (group) {
      // Group Check — both phases use the same equal-portrait layout; declare shows progress, result reveals.
      const cr = card.gen.contestResults || {};
      const reveal = (phase === 'result');
      const targets = (card.targets || []).map(t => {
        const m = reveal ? groupMark(card, t.name) : null;
        return { name: t.name, img: t.img, skill: card.gen.partLabels?.[t.name] || '', total: cr[t.name] ?? null, win: m === 'win' ? true : m === 'lose' ? false : undefined };
      });
      const o = reveal ? groupOutcome(card) : null;
      let word = '', tone = 'hit';
      if (reveal) {
        if (o.mode === 'check') { word = o.avg != null ? String(o.avg) : '—'; tone = (o.pass == null) ? 'hit' : (o.pass ? 'success' : 'failure'); }
        else { const w = [...o.winners]; word = w.length ? w.join(', ') : '—'; tone = 'hit'; }
      }
      payload = { ...base, action: 'Group Check', mode: card.gen.mode || 'check', reveal, word, tone, avg: o?.avg ?? null, pass: o?.pass ?? null, dc: card.gen.dc ?? null, targets };
    } else if (phase === 'declare') {
      payload = { ...base, total: (card.atk?.total ?? card.gen?.total ?? null), targets: (card.targets || []).map(t => ({ id: t.id, name: t.name, img: t.img })) };
    } else { // result — one outcome word + per-target marks
      const nat = card.atk?.nat ?? card.gen?.nat;
      let word = '', tone = 'hit';
      if (card.atk) {
        if (nat === 20) { word = 'Critical Hit'; tone = 'crit'; } else if (nat === 1) { word = 'Critical Miss'; tone = 'critmiss'; }
        else { const v = Object.values(card.atk.verdicts || {}); const allHit = v.length && v.every(x => x === 'hit'), allMiss = v.length && v.every(x => x === 'miss'); word = allHit ? 'Hit' : allMiss ? 'Miss' : 'Hit & Miss'; tone = allMiss ? 'miss' : 'hit'; }
      } else if (isCheck && card.gen.contestResults && Object.keys(card.gen.contestResults).length) {
        const tot = card.gen.total ?? 0; const rs = Object.values(card.gen.contestResults); const won = rs.filter(v => tot >= v).length;
        word = won === 0 ? 'Failed' : `${won}/${rs.length} Won`; tone = won >= rs.length - won ? 'hit' : 'miss';
      } else if (isCheck) {
        if (nat === 20) { word = 'Critical Success'; tone = 'crit'; } else if (nat === 1) { word = 'Critical Failure'; tone = 'critmiss'; }
        else { word = card.gen.verdict === 'success' ? 'Success' : 'Failure'; tone = card.gen.verdict === 'success' ? 'success' : 'failure'; }
      } else if (card.save) {
        const r = Object.values(card.save.results || {}); const f = r.filter(x => x === 'fail').length, s = r.filter(x => x === 'save').length;
        word = `${f} Failed · ${s} Saved`; tone = f >= s ? 'hit' : 'miss';
      }
      const cr = card.gen?.contestResults; const ctot = card.gen?.total ?? 0;
      const targets = (card.targets || []).map(t => ({ id: t.id, name: t.name, img: t.img, mark: card.atk ? (card.atk.verdicts?.[tkey(t)] ?? defaultHit(t, atkEff(card.atk))) : card.save ? card.save.results?.[tkey(t)] : (cr && cr[t.name] != null) ? (ctot >= cr[t.name] ? 'hit' : 'miss') : null }));
      payload = { ...base, word, tone, targets };
    }
    // The group RESULT cue reflects the GROUP'S outcome, not individuals: an Average check passes/fails by the
    // average vs the DC (individual passes don't count); a Contest counts individual winners (success if any beat
    // the DC, else failure). No DC → a neutral reveal.
    let groupCue = 'groupreveal';
    if (group && phase === 'result') {
      const o = groupOutcome(card);
      if (o.dc == null) groupCue = 'groupreveal';
      else if (o.mode === 'check') groupCue = o.pass ? 'success' : 'failure';
      else groupCue = (o.winners && o.winners.size > 0) ? 'success' : 'failure';
    }
    // Pick the sound cue (caller override wins; else derive from phase / outcome / damage type).
    payload.cue = opts.cue || (phase === 'impact' ? (card.heal ? 'heal' : 'dmg.' + dmgKey(payload.dtype))
      : phase === 'declare' ? (group ? 'groupdeclare' : 'declare')
        : group ? groupCue : (payload.tone || 'hit'));
    playStinger(payload);
    try { game.socket?.emit(`module.${NS}`, { t: 'stinger', payload }); } catch (e) {}
  } catch (e) { console.warn('DDB Roll Cards | announce', e); }
}

/* --------------------------------------------------------------- bootstrap */
Hooks.once('init', () => {
  // --- Standalone connection (no ddb-sync needed). Values auto-migrate from ddb-sync if it's installed. ---
  game.settings.register(NS, 'enabled', { name: 'Connect to D&D Beyond', hint: 'When ddb-sync is NOT installed, DDB Roll Cards opens its own connection to the D&D Beyond game log.', scope: 'world', config: true, type: Boolean, default: true });
  // CLIENT scope (not world): the cobalt cookie is a D&D Beyond credential and only the GM's client uses it. World-
  // scoped settings are synced to — and readable by — every player; client scope keeps it in the GM's browser only.
  game.settings.register(NS, 'cobaltCookie', { name: 'CobaltSession cookie', hint: 'Your dndbeyond.com CobaltSession cookie value (DevTools → Application → Cookies). Stored only in this browser (not shared with players); re-enter it per device you GM from.', scope: 'client', config: true, type: String, default: '' });
  game.settings.register(NS, 'proxyUrl', { name: 'Proxy URL', hint: 'ddb-proxy base URL, e.g. https://your-proxy.onrender.com (no trailing slash).', scope: 'world', config: true, type: String, default: '' });
  game.settings.register(NS, 'campaignId', { name: 'Campaign (game) ID', hint: 'D&D Beyond campaign/game ID.', scope: 'world', config: true, type: String, default: '' });
  game.settings.register(NS, 'userId', { name: 'D&D Beyond user ID', hint: 'Your D&D Beyond user ID.', scope: 'world', config: true, type: String, default: '' });
  game.settings.register(NS, 'characterMapping', { scope: 'world', config: false, type: Object, default: {} });
  game.settings.register(NS, 'takeover', { name: 'Take over DDB rendering (when ddb-sync is installed)', hint: "Suppresses ddb-sync's own native roll cards and its item.use() attack prompt (the advantage/disadvantage dialog). Ignored once ddb-sync is removed.", scope: 'world', config: true, type: Boolean, default: true });
  game.settings.register(NS, 'stingers', { name: 'Cinematic phase announcements', hint: 'Full-screen animated stingers for each phase (declaration, hit/save results), themed off the action art. Shown to all players.', scope: 'world', config: true, type: Boolean, default: true });
  game.settings.register(NS, 'autoConfirmHits', { name: 'Auto-approve attack hits', hint: 'Automatically confirm attack hit/miss (from the target ACs) without clicking Confirm hits.', scope: 'world', config: true, type: Boolean, default: false });
  game.settings.register(NS, 'autoConfirmDamage', { name: 'Auto-apply damage', hint: 'Automatically Apply-all (damage/healing + conditions, after resistances) once an attack\'s hits are confirmed or a save\'s results are in.', scope: 'world', config: true, type: Boolean, default: false });
  game.settings.register(NS, 'autoConfirmDelay', { name: 'Automation step delay (seconds)', hint: 'Universal pacing for every automated step — auto-approve hits, auto-apply damage, and the concentration save — so each beat plays after the declaration and dice rather than all at once. Lower = faster automation.', scope: 'world', config: true, type: Number, range: { min: 0, max: 10, step: 0.5 }, default: 2 });
  game.settings.register(NS, 'suppressNative', { name: 'Hide native dnd5e cards', hint: "Suppress Foundry's own item/usage cards (the ATTACK/DAMAGE-button card) for everyone — this module posts its own. Turn off if you want the native cards too.", scope: 'world', config: true, type: Boolean, default: true });
  game.settings.register(NS, 'nativeForGM', { name: 'Keep native cards for the GM', hint: 'When YOU roll or use an item from within Foundry (not D&D Beyond), keep the native dnd5e card but whisper it to the GM only — so you can drive its buttons / nuanced workflow. Players still see this module’s cards and cinematics. You’ll see both the native card and this module’s card. Tip: turn Auto-apply damage OFF in this mode so you don’t double-apply.', scope: 'world', config: true, type: Boolean, default: false });
  game.settings.register(NS, 'initFromDDB', { name: 'Initiative from D&D Beyond', hint: 'When a player rolls Initiative on D&D Beyond, add/update them in the combat tracker automatically (creating a combat if none is active).', scope: 'world', config: true, type: Boolean, default: true });
  game.settings.register(NS, 'concentration', { name: 'Concentration checks', hint: "When damage is applied to a concentrating creature, auto-roll its Constitution save (NPCs) or await the caster's D&D Beyond CON save (players) at DC max(10, ½ damage), and break concentration on a failure.", scope: 'world', config: true, type: Boolean, default: true });
  game.settings.register(NS, 'autoStates', { name: 'Auto-states & cinematics', hint: 'When you apply damage/healing, apply the system status effects for HP thresholds — Bloodied at ≤½ HP, Unconscious for a downed player, Dead + defeated for a downed NPC — and play a cinematic on each transition. Uses dnd5e’s own statuses (idempotent), so it complements rather than duplicates the system.', scope: 'world', config: true, type: Boolean, default: true });
  game.settings.register(NS, 'conditionDurations', { name: 'Condition durations', hint: 'When a timed action applies a condition, stamp the action’s duration on the effect and auto-remove it when it expires (checked as turns pass). Instantaneous effects (e.g. knocking prone) are left until removed manually.', scope: 'world', config: true, type: Boolean, default: true });
  game.settings.register(NS, 'recurringConditions', { name: 'Recurring condition damage', hint: 'Roll start-of-turn condition effects automatically — e.g. Burning deals 1d4 fire at the start of a burning creature’s turn (resistance-aware) with a cinematic.', scope: 'world', config: true, type: Boolean, default: true });
  game.settings.register(NS, 'featureAutomation', { name: 'Monster feature automation', hint: 'Automate select monster traits. Currently: on-being-hit retaliation — when a melee attack hits a creature with a feature like Corrosive Form or Heated Body, that feature’s damage is dealt back to the attacker (resistance-aware) with a cinematic. More features added over time.', scope: 'world', config: true, type: Boolean, default: true });
  game.settings.register(NS, 'debug', { name: 'Debug: log all incoming chat messages', hint: 'Logs every chat message (type, flags, flavor) to the console so we can identify and suppress stray native cards.', scope: 'client', config: true, type: Boolean, default: false });
  game.settings.register(NS, 'sounds', { name: 'Sound effects', hint: 'Play sound cues for declarations, hits/misses, criticals, damage by type, healing, and group checks. Per-client; configure files below.', scope: 'client', config: true, type: Boolean, default: true });
  game.settings.register(NS, 'soundVolume', { name: 'Sound effect volume', hint: '0 (silent) to 1 (full).', scope: 'client', config: true, type: Number, range: { min: 0, max: 1, step: 0.05 }, default: 0.5 });
  game.settings.register(NS, 'soundConfig', { scope: 'client', config: false, type: Object, default: {} });
  class DdbxSoundMenu extends foundry.applications.api.ApplicationV2 { async render() { editSounds(); return this; } }
  game.settings.registerMenu(NS, 'soundMenu', { name: 'Sound Effects', label: 'Configure Sound Effects', hint: 'Assign a file to each event (sensible defaults provided). Browse your assets and preview each.', icon: 'fas fa-volume-high', type: DdbxSoundMenu, restricted: false });
  try {
    class DdbxMappingMenu extends foundry.applications.api.ApplicationV2 { async render() { editMapping(); return this; } }
    game.settings.registerMenu(NS, 'mappingMenu', { name: 'Character Mapping', label: 'Edit Character Mapping', hint: 'Map D&D Beyond characters to Foundry actors (only needed when names differ).', icon: 'fas fa-people-arrows', type: DdbxMappingMenu, restricted: true });
  } catch (e) { console.warn('DDB Roll Cards | mapping menu register failed (use DDBRollCards.editMapping())', e); }
});
/* ------------------------------------------------------ self-test harness (DDBRollCards.selfTest())
   Creates throwaway "[ddbx-test]" tokens on the current scene, drives every automation directly (no DDB feed,
   no UI clicking), logs structured [SELFTEST] lines, then deletes everything it made. Paste the console output back.
   GM-only. Each scenario is isolated so one failure can't abort the rest, and cleanup always runs. */
async function selfTest() {
  if (!game.user?.isGM) { console.warn('[SELFTEST] GM only.'); return; }
  const scene = canvas.scene; if (!scene) { console.warn('[SELFTEST] No active scene — open one first.'); return; }
  const L = (...a) => console.log('%c[SELFTEST]', 'color:#e0c060;font-weight:bold', ...a);
  const ok = (b) => b ? '✅' : '❌';
  const featOn = (() => { try { return game.settings.get(NS, 'featureAutomation'); } catch (e) { return false; } })();
  const recurOn = (() => { try { return game.settings.get(NS, 'recurringConditions'); } catch (e) { return false; } })();
  const created = { actors: [], tokens: [], msgs: [] };
  const msgHook = Hooks.on('createChatMessage', (m) => created.msgs.push(m.id));
  const gs = canvas.grid?.size || 100;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const rid = () => foundry.utils.randomID();
  const dmgAct = (n, d, type) => { const id = rid(); return { [id]: { _id: id, type: 'damage', damage: { parts: [{ number: n, denomination: d, bonus: '', types: [type], custom: { enabled: false } }] } } }; };
  const saveAct = (n, d, type, dc, ability) => { const id = rid(); return { [id]: { _id: id, type: 'save', save: { ability: [ability], dc: { calculation: '', formula: String(dc) } }, damage: { onSave: 'half', parts: [{ number: n, denomination: d, bonus: '', types: [type], custom: { enabled: false } }] }, target: { template: { size: 10, type: 'radius' } } } }; };
  const atkAct = () => { const id = rid(); return { [id]: { _id: id, type: 'attack', attack: { type: { value: 'melee', classification: 'weapon' } }, damage: { parts: [{ number: 1, denomination: 4, bonus: '', types: ['piercing'], custom: { enabled: false } }] } } }; };
  const feat = (name, desc, activities) => ({ name, type: 'feat', system: { description: { value: desc || '' }, activities: activities || {} } });
  const reactionFeat = (name, desc) => { const id = rid(); return { name, type: 'feat', system: { description: { value: desc }, activation: { type: 'reaction' }, activities: { [id]: { _id: id, type: 'utility', activation: { type: 'reaction' } } } } }; };
  const weapon = (name, magical) => ({ name, type: 'weapon', system: { type: { value: 'simpleM' }, properties: magical ? ['mgc'] : [], activities: atkAct() } });
  const npc = (name, hp, ac, items) => ({ name, type: 'npc', system: { attributes: { hp: { value: hp, max: hp }, ac: { flat: ac, calc: 'flat' } } }, items: items || [] });
  const snap1 = (tok) => { const a = tok.actor, s = a?.system ?? {}, hp = s.attributes?.hp ?? {}; return { id: tok.id, name: a?.name, img: a?.img, ac: s.attributes?.ac?.value ?? 10, hpVal: Number(hp.value) || 0, hpMax: Number(hp.max) || 0 }; };
  const mockCard = (attacker, action, tok, o = {}) => ({ atk: { total: o.total ?? 25, nat: o.nat ?? 0, verdicts: { [tok.id]: 'hit' } }, targets: [snap1(tok)], actorId: attacker?.id || null, who: attacker?.name, action, actionConds: o.actionConds || [], saveDC: o.saveDC ?? null, saveAbility: o.saveAbility ?? null, iid: rid() });
  let col = 0;
  const place = async (data, pos) => {
    const actor = await Actor.create({ ...data, name: `[ddbx-test] ${data.name}` }); created.actors.push(actor.id);
    const x = pos?.x ?? (1000 + (col++ * gs * 3)), y = pos?.y ?? 1000;
    const td = await actor.getTokenDocument({ x, y, disposition: 0 });
    const [doc] = await scene.createEmbeddedDocuments('Token', [td.toObject()]); created.tokens.push(doc.id);
    return { actor, token: canvas.tokens.get(doc.id) };
  };
  const run = async (label, fn) => { try { await fn(); } catch (e) { L(label, 'THREW ❌', e?.message || e); } };
  const hp = (a) => a?.system?.attributes?.hp?.value;
  try {
    L('================ DDB Roll Cards self-test ================');
    L('feature settings — featureAutomation:', ok(featOn), '| recurringConditions:', ok(recurOn));
    L("statuses defined? burning:", ok((CONFIG.statusEffects || []).some(e => e.id === 'burning')), '| grappled:', ok((CONFIG.statusEffects || []).some(e => e.id === 'grappled')), '| poisoned:', ok((CONFIG.statusEffects || []).some(e => e.id === 'poisoned')), '| prone:', ok((CONFIG.statusEffects || []).some(e => e.id === 'prone')));

    const fighter = await place(npc('Fighter', 60, 16, [weapon('Test Dagger', false), weapon('Test Magic Sword', true)]));
    L('0) melee detection — resolveAction("Test Dagger").actionType =', JSON.stringify(resolveAction(fighter.actor, 'Test Dagger')?.actionType), '(empty string means the ranged-guard can never trigger — flag for fix)');

    await run('1) WEAPON CORROSION', async () => {
      const ooze = await place(npc('Ooze', 30, 12, [feat('Corrosive Form', 'A creature that hits the ooze with a melee attack takes acid damage.')]));
      await featureWeaponCorrosion(mockCard(fighter.actor, 'Test Dagger', ooze.token));
      let e = (findItem(fighter.actor, 'Test Dagger').effects?.contents || []).find(x => x.getFlag(NS, 'weaponCorrosion'));
      L('1) hit #1 →', e ? `"${e.name}" stacks=${e.getFlag(NS, 'weaponCorrosion')?.stacks}` : 'no effect ❌');
      await featureWeaponCorrosion(mockCard(fighter.actor, 'Test Dagger', ooze.token));
      e = (findItem(fighter.actor, 'Test Dagger').effects?.contents || []).find(x => x.getFlag(NS, 'weaponCorrosion'));
      L('1) hit #2 → stacks=', e?.getFlag(NS, 'weaponCorrosion')?.stacks, ok(e?.getFlag(NS, 'weaponCorrosion')?.stacks === 2), '(should be 2)');
      await featureWeaponCorrosion(mockCard(fighter.actor, 'Test Magic Sword', ooze.token));
      const me = (findItem(fighter.actor, 'Test Magic Sword').effects?.contents || []).find(x => x.getFlag(NS, 'weaponCorrosion'));
      L('1) magic weapon immune →', ok(!me), '(should have no corrosion effect)');
    });

    await run('2) RETALIATION (Heated Body)', async () => {
      const beast = await place(npc('Heated Beast', 50, 14, [feat('Heated Body', 'A creature that touches it takes 2d6 fire damage.', dmgAct(2, 6, 'fire'))]));
      const before = hp(fighter.actor);
      await featureRetaliation(mockCard(fighter.actor, 'Test Dagger', beast.token));
      L('2) attacker HP', before, '→', hp(fighter.actor), ok(hp(fighter.actor) < before), '(should drop ~2-12 fire)');
    });

    await run('3) REGENERATION', async () => {
      const troll = await place(npc('Troll', 84, 15, [feat('Regeneration', 'The troll regains 10 hit points at the start of its turn. If it takes acid or fire damage this trait does not function at the start of its next turn.')]));
      await manualDamage(troll.actor, 30); const b1 = hp(troll.actor);
      await featureRegeneration(troll.actor);
      L('3a) no fire taken: HP', b1, '→', hp(troll.actor), ok(hp(troll.actor) === b1 + 10), '(expect +10)');
      noteDmg(troll.actor, 'fire'); const b2 = hp(troll.actor);
      await featureRegeneration(troll.actor);
      L('3b) fire taken: HP', b2, '→', hp(troll.actor), ok(hp(troll.actor) === b2), '(expect NO heal — suppressed; watch for the suppressed feature-log)');
    });

    await run('4) BURNING tick', async () => {
      const burner = await place(npc('Burner', 30, 12, []));
      await burner.actor.toggleStatusEffect('burning', { active: true });
      const has = burner.actor.statuses?.has?.('burning');
      const b = hp(burner.actor); await recurringTick(burner.actor); await sleep(50);
      L('4) burning status set?', ok(has), '| HP', b, '→', hp(burner.actor), ok(has && hp(burner.actor) < b), '(expect -1..4 fire if status exists; cinematic should say BURN)');
    });

    await run('5) UNDEAD FORTITUDE', async () => {
      const zombie = await place(npc('Zombie', 22, 8, [feat('Undead Fortitude', 'If damage reduces the zombie to 0 HP it makes a CON save (DC 5 + damage) unless radiant or a crit.')]));
      await zombie.actor.update({ 'system.attributes.hp.value': 0 });
      const survived = await undeadFortitude(zombie.actor, 1, 'slashing', false); // dealt 1 → DC 6, usually survives → shows the "clings to 1 HP" path
      L('5) non-radiant killing blow (DC6) → survived?', survived, '| HP now', hp(zombie.actor), '(expect 1 HP on a CON ≥ 6)');
      await zombie.actor.update({ 'system.attributes.hp.value': 0 });
      const r2 = await undeadFortitude(zombie.actor, 8, 'radiant', false);
      L('5) radiant blow →', ok(!r2), '(radiant should always bypass — dies)');
    });

    await run('6) DEATH BURST', async () => {
      const bomber = await place(npc('Bomber', 1, 12, [feat('Death Burst', 'When it dies it explodes. Each creature within 10 feet makes a DC 13 Dexterity saving throw, taking 3d6 fire damage on a failure or half as much on a success.', saveAct(3, 6, 'fire', 13, 'dex'))]), { x: 2000, y: 2000 });
      await place(npc('Bystander', 30, 13, []), { x: 2000 + gs, y: 2000 });
      await featureDeathBurst(bomber.actor); await sleep(50);
      L('6) Death Burst fired — expect a burst card in chat + a "creatures in N ft" line above. (If "no rollable damage" appeared, the test activity shape is off.)');
    });

    await run('7) AURAS', async () => {
      const auraGuy = await place(npc('Aura Guy', 40, 14, [feat('Fire Aura', 'At the start of each of its turns, each creature within 10 feet takes 1d10 fire damage. DC 13.', saveAct(1, 10, 'fire', 13, 'dex'))]), { x: 3000, y: 3000 });
      await place(npc('Nearby', 30, 13, []), { x: 3000 + gs, y: 3000 });
      await featureAuras(auraGuy.actor); await sleep(50);
      L('7) Fire Aura fired — expect an aura save card in chat. (Watch for the new "aura produced no card" diagnostic if not.)');
    });

    await run('8) ABSORPTION (detection)', async () => {
      const phoenix = await place(npc('Phoenix', 50, 14, [feat('Fire Absorption', 'Whenever it would take fire damage it regains that many hit points instead.')]));
      const a = phoenix.token.actor; // unlinked token → use the token's (synthetic) actor, as real play does
      L('8) absorbsType(fire) =', ok(absorbsType(a, 'fire')), '| absorbsType(cold) =', ok(!absorbsType(a, 'cold')), '(full heal-instead path needs a live damage card; detection shown here)');
    });

    await run('9) ON-HIT RIDERS', async () => {
      const grabber = await place(npc('Grabber', 30, 13, [weapon('Test Claw', false)]));
      const prey = await place(npc('Prey', 40, 25, []));
      const pa = prey.token.actor; // riders apply to the TOKEN's actor (targetActor), not the base — check that one
      await featureOnHitRiders(mockCard(grabber.actor, 'Test Claw', prey.token, { actionConds: ['grappled'] }));
      L('9a) no-save rider → prey grappled?', ok(pa.statuses?.has?.('grappled')), '(expect yes)');
      await pa.toggleStatusEffect('grappled', { active: false });
      await featureOnHitRiders(mockCard(grabber.actor, 'Test Claw', prey.token, { actionConds: ['poisoned'], saveDC: 50, saveAbility: 'con' }));
      L('9b) save-gated DC50 (NPC auto-fails) → prey poisoned?', ok(pa.statuses?.has?.('poisoned')), '(expect yes — fails the impossible DC)');
    });

    await run('10) REACTIONS (Parry)', async () => {
      const parrier = await place(npc('Parrier', 30, 14, [reactionFeat('Parry', 'The parrier adds 3 to its AC against one melee attack roll that would hit it.')]));
      const rc = mockCard(fighter.actor, 'Test Dagger', parrier.token, { total: 15 }); // AC14: 15 hits; +3 → 17 > 15 = miss
      const det = targetReaction(parrier.actor);
      L('10) targetReaction detected?', det ? `${det.label} +${det.bonus}` : 'none ❌', '(reaction-gated so a worn shield wouldn\'t match)');
      await applyReaction(rc, parrier.token.id);
      L('10) Parry vs 15 (AC14→17) → verdict =', rc.atk.verdicts[parrier.token.id], ok(rc.atk.verdicts[parrier.token.id] === 'miss'), '(expect miss)');
    });

    await run('11) MULTIATTACK decode', async () => {
      const dragon = await place(npc('Dragon', 100, 18, [weapon('Bite', false), weapon('Claw', false), feat('Multiattack', 'The dragon makes three attacks: one with its Bite and two with its Claws.')]));
      const a = dragon.token.actor;
      const p = parseMultiattack(findItem(a, 'Multiattack'), a);
      const bite = p.find(x => /bite/i.test(x.name))?.count, claw = p.find(x => /claw/i.test(x.name))?.count;
      L('11a) "one Bite + two Claws" →', p.map(x => `${x.name}×${x.count}`).join(', '), ok(bite === 1 && claw === 2), '(expect Bite×1, Claw×2)');
      const z = await place(npc('Brute', 60, 14, [weapon('Slam', false), feat('Multiattack', 'The brute makes two Slam attacks.')]));
      const za = z.token.actor;
      const zp = parseMultiattack(findItem(za, 'Multiattack'), za);
      L('11b) "two Slam attacks" →', zp.map(x => `${x.name}×${x.count}`).join(', '), ok(zp.find(x => /slam/i.test(x.name))?.count === 2), '(expect Slam×2)');
    });

    await run('12) LEGENDARY RESISTANCE', async () => {
      const boss = await place(npc('Boss', 200, 18, [feat('Legendary Resistance', 'If the boss fails a saving throw, it can choose to succeed instead. 3/Day.')]));
      const a = boss.token.actor;
      const st = legResLeft(a);
      L('12) detect →', st.feat ? `${st.left} left` : 'none ❌', ok(st.left === 3), '(expect 3 from "3/Day")');
      const used = await useLegRes(a);
      L('12) after spending one →', ok(used && legResLeft(a).left === 2), `(expect 2 left, got ${legResLeft(a).left})`);
    });

    await sleep(150);
  } catch (e) { L('HARNESS ERROR ❌', e?.message || e); }
  finally {
    Hooks.off('createChatMessage', msgHook);
    L('---- cleanup ----');
    try { const ids = created.msgs.filter(id => game.messages.has(id)); if (ids.length) await ChatMessage.deleteDocuments(ids); } catch (e) {}
    try { const ids = created.tokens.filter(id => scene.tokens.has(id)); if (ids.length) await scene.deleteEmbeddedDocuments('Token', ids); } catch (e) {}
    try { const ids = created.actors.filter(id => game.actors.has(id)); if (ids.length) await Actor.deleteDocuments(ids); } catch (e) {}
    L('cleaned up', created.actors.length, 'actors /', created.tokens.length, 'tokens /', created.msgs.length, 'messages.');
    L('================ end — copy everything above ================');
  }
}
Hooks.once('ready', () => {
  // Styles + the stinger socket listener run for EVERY client (players see public cards and cinematic stingers).
  injectStyles();
  // Remote clients play the overlay only; the GM's Dice So Nice roll already synchronizes its dice to them.
  // Sanitize socket-received stinger payloads — any client can emit one, and it reaches innerHTML.
  try { game.socket?.on(`module.${NS}`, (m) => { if (m?.t === 'stinger') playStinger(sanitizeStinger(m.payload)); else if (m?.t === 'clearsting') clearStingerLocal(); }); } catch (e) {}
  if (!game.user.isGM) return;
  window.DDBRollCards = { reconnect, startOwnSocket, editMapping, selfTest };
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
  // On each turn change (one GM only, to avoid races): expire our timed conditions, then run start-of-turn recurring
  // condition damage (e.g. Burning) for the creature whose turn is beginning.
  Hooks.on('updateCombat', (combat, changed) => {
    try {
      if (!game.user?.isGM || (game.users?.activeGM && game.users.activeGM !== game.user)) return;
      if (!('turn' in (changed || {})) && !('round' in (changed || {}))) return;
      if (game.settings.get(NS, 'conditionDurations')) {
        for (const cbt of (combat.combatants || [])) {
          const actor = cbt.actor; if (!actor) continue;
          for (const eff of [...(actor.effects || [])]) {
            try { if (eff.getFlag?.(NS, 'autoExpire')) { const rem = eff.duration?.remaining; if (typeof rem === 'number' && rem <= 0) eff.delete(); } } catch (e) {}
          }
        }
      }
      recurringTick(combat.combatant?.actor); // start-of-turn ticks for the new current combatant (gated inside)
    } catch (e) {}
  });
  // A concentration save rolled IN FOUNDRY (native sheet/enricher) fires this hook even though we suppress the
  // native card — feed its total into the same reconcile path as a D&D Beyond CON save so our interactive
  // concentration card resolves either way. No-op if there's no pending check for that actor (idempotent).
  Hooks.on('dnd5e.rollConcentration', (rolls, data) => {
    try {
      const actor = data?.subject || data?.actor;
      const total = Array.isArray(rolls) ? rolls[0]?.total : rolls?.total;
      if (actor?.name && typeof total === 'number') resolveConcentration(actor.name, total, null);
    } catch (e) {}
  });
  // Replace/suppress Foundry's native dnd5e cards — this module posts its own.
  Hooks.on('preCreateChatMessage', (message) => {
    try {
      const f = message.flags?.dnd5e; if (!f) return;
      if (game.user.isGM && game.settings.get(NS, 'debug')) {
        const f0 = message.flags || {};
        console.log('[ddbx debug] preCreate', { dnd5eType: f0.dnd5e?.messageType, rollType: f0.dnd5e?.roll?.type, flavor: message.flavor, rolls: message.rolls?.length, flagKeys: Object.keys(f0), dnd5e: f0.dnd5e });
      }
      // Multiattack: replace the plain "Multiattack" usage card with a decoded one-click-per-attack card. Parse is
      // synchronous so we can still cancel the native card; the decode post is fire-and-forget. Falls through to the
      // native card if we can't decode it (no named attacks matched).
      if (game.user.isGM && !message.rolls?.length && game.settings.get(NS, 'featureAutomation')) {
        try {
          const mit = f.item?.uuid ? fromUuidSync(f.item.uuid) : null;
          if (mit && /multiattack/i.test(mit.name || '')) {
            const mactor = mit.actor || (message.speaker?.actor ? game.actors.get(message.speaker.actor) : null);
            const parsed = mactor ? parseMultiattack(mit, mactor) : [];
            if (parsed.length) { postMultiattackCard(mactor, mit, parsed); return false; }
            console.log(`DDB Roll Cards | multiattack: couldn't decode "${mit.name}" on ${mactor?.name} (no named attacks matched its text) — showing the native card.`);
          }
        } catch (e) {}
      }
      // Our concentration engine is the single handler — drop dnd5e's own native concentration prompt/roll
      // (it auto-posts one whenever a concentrating creature's HP drops) so they never duplicate. The card text
      // lives in content, not flavor, so check both (content only on non-roll prompt cards to stay safe).
      if (game.settings.get(NS, 'concentration') && (f.roll?.type === 'concentration' || /concentration/i.test(f.messageType || '') || /concentrat/i.test(message.flavor || '') || (!message.rolls?.length && /concentrat/i.test(message.content || '')))) return false;
      const isNativeRoll = f.messageType === 'roll' && !!message.rolls?.length;
      // "Keep native cards for the GM": instead of deleting the native card, whisper it to the GM so they can drive
      // nuanced native workflows in Foundry (item buttons, etc.) while players still get this module's cards + cinematics.
      const keepForGM = game.user.isGM && game.settings.get(NS, 'nativeForGM');
      const whisperGM = () => { try { message.updateSource({ whisper: ChatMessage.getWhisperRecipients('GM').map(u => u.id), blind: false }); } catch (e) {} };
      // GM monster rolls posted natively → render our card too. Keep the native one (GM-only) or cancel it.
      if (game.user.isGM && isNativeRoll) { renderLocalMessage(message, keepForGM); if (keepForGM) { whisperGM(); return; } return false; }
      // EVERY other native dnd5e card (item/usage/no-dice display — the ATTACK/DAMAGE-button card, which may have no
      // messageType at all). GM keeps it (whispered) when the setting is on; otherwise suppress per 'Hide native cards'.
      if (!isNativeRoll) { if (keepForGM) { whisperGM(); return; } if (game.settings.get(NS, 'suppressNative')) return false; }
    } catch (e) { console.error('DDB Roll Cards | intercept error', e); }
  });
  Hooks.on('renderChatMessageHTML', (message, el) => {
    // Concentration card (its own flag + actions) — wire and bail before the battle-card handling.
    let conc; try { conc = message.getFlag(NS, 'conc'); } catch (e) {}
    if (conc) {
      const root0 = (el instanceof HTMLElement) ? el : el?.[0]; if (!root0) return;
      root0.querySelectorAll('[data-ddbx^="conc-"]').forEach(b => b.addEventListener('click', ev => {
        ev.preventDefault();
        if (b.dataset.ddbx === 'conc-edit') {
          if (!game.user.isGM) return;
          const inp = document.createElement('input'); inp.type = 'number'; inp.value = conc.total ?? ''; inp.className = 'ddbx2-dsel'; inp.style.width = '90px';
          b.replaceWith(inp); inp.focus(); inp.select();
          inp.addEventListener('change', () => concSetTotal(conc, parseInt(inp.value, 10), message));
          return;
        }
        onConcAction(b.dataset.ddbx, conc, message);
      }));
      return;
    }
    // Multiattack decode card — each button fires one sub-attack through the normal pipeline.
    let multi; try { multi = message.getFlag(NS, 'multi'); } catch (e) {}
    if (multi) {
      const root1 = (el instanceof HTMLElement) ? el : el?.[0]; if (!root1) return;
      root1.querySelectorAll('[data-ddbx="multiatk"]').forEach(b => b.addEventListener('click', ev => {
        ev.preventDefault(); if (!game.user.isGM) return;
        b.classList.add('done'); fireSubAttack(b.dataset.aid, b.dataset.mid);
      }));
      return;
    }
    let card; try { card = message.getFlag(NS, 'card'); } catch (e) { return; } if (!card) return;
    const root = (el instanceof HTMLElement) ? el : el?.[0]; if (!root) return;
    root.querySelectorAll('[data-ddbx]').forEach(b => b.addEventListener('click', e => {
      e.preventDefault();
      if (b.dataset.ddbx === 'mode') { applyMode = b.dataset.mode; root.querySelectorAll('[data-ddbx="mode"]').forEach(x => x.classList.toggle('active', x.dataset.mode === applyMode)); return; }
      onAction(b.dataset.ddbx, card, message, b.dataset);
    }));
    // Condition dropdowns (which condition + when) — stored on the card, applied by Apply all.
    root.querySelectorAll('select.ddbx2-condpick').forEach(sel => sel.addEventListener('change', () => setCondId(card, sel.value, message)));
    root.querySelectorAll('select.ddbx2-condwhen').forEach(sel => sel.addEventListener('change', () => setCondWhen(card, sel.value, message)));
    // Always-live damage-type dropdown.
    root.querySelectorAll('select[data-ddbx-dtype]').forEach(sel => sel.addEventListener('change', () => changeDtype(card, sel.value, message)));
    // Contested-check skill picker (single, NPC contests only — group checks read the skill from each DDB roll).
    root.querySelectorAll('select.ddbx2-contestpick').forEach(sel => sel.addEventListener('change', () => setContestSkill(card, sel.value, message)));
    // Manual contest entry (real dice / awaited player rolls).
    root.querySelectorAll('input[data-ddbx-cinput]').forEach(inp => inp.addEventListener('change', () => { const v = parseInt(inp.value, 10); setContestManual(card, inp.dataset.tname, v, message); }));
    // Click the roll total to edit it (override a received roll / enter real dice).
    root.querySelectorAll('[data-ddbx="editnum"]').forEach(el => el.addEventListener('click', () => {
      if (!game.user.isGM) return;
      const inp = document.createElement('input'); inp.type = 'number'; inp.value = card.gen?.total ?? ''; inp.className = 'ddbx2-dsel'; inp.style.width = '90px';
      el.replaceWith(inp); inp.focus(); inp.select();
      inp.addEventListener('change', () => editGenTotal(card, parseInt(inp.value, 10), message));
    }));
  });
  console.log(`DDB Roll Cards | ready (v4.91) — ${game.modules.get(SYNC)?.active ? 'riding ddb-sync socket' : 'standalone connection'}`);
});
