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
.ddbx2-bar button[disabled]{opacity:.4;cursor:not-allowed;}
.ddbx2-wait{flex:0 0 auto;display:inline-flex;align-items:center;gap:5px;font-size:11px;color:#d8c79f;padding:0 4px;}
.ddbx2 .ddbx2-bar button.ddbx2-cancel{flex:0 0 auto;background:rgba(220,80,80,.14);border-color:rgba(220,80,80,.4);color:#f0b3b3;}
.ddbx2 .ddbx2-bar button.ddbx2-cancel:hover{background:rgba(220,80,80,.28);}
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
.ddbx2-condsec{display:flex;align-items:center;gap:5px;margin-top:8px;flex-wrap:wrap;color:#e8966e;}
.ddbx2 .ddbx2-condsec select{flex:1 1 90px;min-width:70px;}
.ddbx2 .ddbx2-condsec button{flex:0 0 auto;font-size:10px;line-height:22px;padding:0 9px;border-radius:4px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.18);color:#ededed;cursor:pointer;}
.ddbx2 .ddbx2-condsec button:hover{background:rgba(255,255,255,.14);}
.ddbx2 .ddbx2-cinput{width:46px;font-size:13px;text-align:center;background:#222;color:#fff;border:1px solid rgba(255,255,255,.25);border-radius:4px;padding:1px 2px;}
.ddbx2 [data-ddbx="editnum"]{cursor:pointer;}
.ddbx2-dcrow{display:flex;align-items:center;gap:4px;margin-top:7px;font-size:11px;color:#9a9a9a;}
.ddbx2-dcrow span{letter-spacing:.06em;}
.ddbx2 .ddbx2-dcrow button{flex:0 0 30px;width:30px;}
.ddbx2-pc-name{font-size:17px;font-weight:bold;letter-spacing:.06em;color:#fff;margin-bottom:2px;}
.ddbx2-pc-ctx{font-size:13px;font-weight:bold;letter-spacing:.08em;text-transform:uppercase;color:#cfcfcf;margin-top:5px;}
.ddbx2-pc-ctx.ddbx2-pc-hit{color:#5fd07a;} .ddbx2-pc-ctx.ddbx2-pc-miss{color:#ff6b6b;}
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
.ddbx-bg{position:absolute;inset:0;background-size:cover;background-position:center;filter:blur(64px) saturate(1.25) brightness(.6);opacity:.42;animation:ddbx-st-zoom var(--dur,3500ms) ease-out forwards;}
@keyframes ddbx-st-zoom{0%{transform:scale(1.32);}100%{transform:scale(1.06);}}
.ddbx-vig{position:absolute;inset:0;background:radial-gradient(ellipse 62% 58% at 50% 50%, color-mix(in srgb, var(--c2) 28%, transparent), rgba(2,2,4,.93) 74%);}
.ddbx-sting.colorbg .ddbx-vig{background:radial-gradient(ellipse 64% 60% at 50% 46%, color-mix(in srgb, var(--c1) 24%, transparent), color-mix(in srgb, var(--c2) 30%, rgba(2,2,4,.96)) 72%);}
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
.ddbx-emblem.bare{width:156px;height:156px;margin:4px auto 2px;border-radius:0;background-size:contain;background-repeat:no-repeat;box-shadow:none;filter:drop-shadow(0 0 26px var(--c2));}
.ddbx-glow{width:0;height:2px;margin:12px auto 4px;background:linear-gradient(90deg,transparent,var(--c1),transparent);box-shadow:0 0 16px var(--c1);animation:ddbx-glowline .9s cubic-bezier(.2,.8,.3,1) .25s both;}
@keyframes ddbx-glowline{0%{width:0;opacity:0;}40%{opacity:1;}100%{width:62%;opacity:.95;}}
.ddbx-title{font-size:72px;font-weight:900;line-height:1;letter-spacing:.03em;text-transform:uppercase;background:linear-gradient(180deg,#fff 35%,var(--c1));-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 3px 20px var(--c2));animation:ddbx-textin .7s ease-out;}
@keyframes ddbx-textin{0%{opacity:0;transform:translateY(16px);letter-spacing:.2em;}100%{opacity:1;transform:translateY(0);letter-spacing:.03em;}}
.ddbx-total{font-size:92px;font-weight:900;line-height:1;margin-top:16px;background:linear-gradient(180deg,#fff,var(--c1));-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 3px 24px var(--c2));opacity:0;animation:ddbx-reveal .6s cubic-bezier(.2,1.5,.4,1) 1.3s both;}
@keyframes ddbx-reveal{0%{opacity:0;transform:scale(1.5);}60%{opacity:1;}100%{opacity:1;transform:scale(1);}}
.ddbx-result{position:relative;font-size:112px;font-weight:900;line-height:1;letter-spacing:.04em;text-transform:uppercase;background:linear-gradient(180deg,#fff 30%,var(--c1));-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 4px 30px var(--c1));animation:ddbx-punch .65s cubic-bezier(.2,1.5,.4,1);}
@keyframes ddbx-punch{0%{opacity:0;transform:scale(1.6);letter-spacing:.5em;}55%{opacity:1;}100%{transform:scale(1);letter-spacing:.04em;}}
.ddbx-rsub{font-size:20px;letter-spacing:.28em;text-transform:uppercase;color:#dcdcdc;margin-top:16px;animation:ddbx-textin .7s ease-out .12s both;}
.ddbx-dc{font-size:24px;font-weight:bold;letter-spacing:.18em;text-transform:uppercase;color:var(--c1);margin-top:12px;opacity:0;animation:ddbx-textin .6s ease-out 2.1s both;}
.ddbx-sting.crit .ddbx-result{animation:ddbx-punch .65s cubic-bezier(.2,1.5,.4,1),ddbx-critpulse 1.1s ease-in-out .35s 2;}
@keyframes ddbx-critpulse{0%,100%{filter:drop-shadow(0 0 20px var(--c1));}50%{filter:drop-shadow(0 0 48px var(--c1)) drop-shadow(0 0 18px #fff);}}
.ddbx-burst{position:absolute;left:50%;top:50%;width:380px;height:380px;margin:-190px 0 0 -190px;border-radius:50%;background:radial-gradient(circle,var(--c1),transparent 62%);opacity:0;animation:ddbx-burst .9s ease-out forwards;}
@keyframes ddbx-burst{0%{opacity:0;transform:scale(.3);}25%{opacity:.55;}100%{opacity:0;transform:scale(1.8);}}
.ddbx-tgrp{position:absolute;display:flex;gap:20px;justify-content:center;align-items:center;}
.ddbx-tg{position:relative;border-radius:50%;background-size:cover;background-position:center;box-shadow:0 0 0 3px var(--c1),0 0 18px #000a;animation:ddbx-portin .6s cubic-bezier(.15,1.3,.4,1) both;}
.ddbx-tg.win{box-shadow:0 0 0 5px #69d77f,0 0 34px #69d77f;}
.ddbx-tg.lose{box-shadow:0 0 0 5px #ff7b7b,0 0 24px #b33;opacity:.62;filter:grayscale(.35);}
.ddbx-tg-m{position:absolute;right:-6px;bottom:-6px;font-size:24px;background:#000c;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 12px #000;}
.ddbx-tg-n{position:absolute;left:50%;bottom:-30px;transform:translateX(-50%);font-size:23px;font-weight:bold;letter-spacing:.03em;color:#fff;white-space:nowrap;text-shadow:0 2px 6px #000,0 0 10px #000;}
.ddbx-pts{position:absolute;inset:0;overflow:hidden;}
.ddbx-pt{position:absolute;bottom:-12px;border-radius:50%;background:var(--c1);opacity:0;box-shadow:0 0 8px var(--c1);animation-name:ddbx-pt-rise;animation-timing-function:ease-out;animation-fill-mode:forwards;}
.ddbx-pt.spark{background:#fff;box-shadow:0 0 10px #fff,0 0 18px var(--c1);}
@keyframes ddbx-pt-rise{0%{opacity:0;transform:translate(0,0) scale(.6);}15%{opacity:.85;}100%{opacity:0;transform:translate(var(--sway,0),-70vh) scale(1.15);}}
/* Caster (orbit) layout — caster centered, info at the top (same for both phases), targets on the bottom arc. */
.lay-orbit .ddbx-casterwrap{left:50%;top:52%;transform:translate(-50%,-50%);}
.lay-orbit .ddbx-caster{width:208px;height:208px;}
.lay-orbit .ddbx-center{left:0;right:0;top:7vh;}
.lay-orbit .ddbx-title{font-size:54px;}
.lay-orbit .ddbx-result{font-size:88px;}
.lay-orbit .ddbx-total{font-size:64px;margin-top:8px;}
.lay-orbit .ddbx-dc{font-size:20px;margin-top:8px;}
.lay-orbit .ddbx-tgrp{inset:0;display:block;}
.ddbx-tex{position:absolute;inset:0;pointer-events:none;opacity:.32;mix-blend-mode:overlay;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");background-size:300px 300px;}
.ddbx-gparts{position:absolute;inset:0;display:flex;flex-wrap:wrap;gap:32px;align-items:center;justify-content:center;padding:20vh 6vw 8vh;}
.ddbx-gp{position:relative;text-align:center;animation:ddbx-portin .6s cubic-bezier(.15,1.3,.4,1) both;}
.ddbx-gp-img{position:relative;width:150px;height:150px;border-radius:50%;background-size:cover;background-position:center;box-shadow:0 0 0 3px var(--c1),0 0 22px #000a;margin:0 auto;}
.ddbx-gp.win .ddbx-gp-img{box-shadow:0 0 0 6px #69d77f,0 0 48px #69d77f;transform:scale(1.08);}
.ddbx-gp.lose{opacity:.5;filter:grayscale(.45);}
.ddbx-gp-n{font-size:22px;font-weight:bold;color:#fff;margin-top:10px;text-shadow:0 2px 6px #000;}
.ddbx-gval{display:block;font-size:30px;font-weight:900;color:var(--c1);text-shadow:0 2px 10px #000;}
.ddbx-gval.pend{color:#888;}
.ddbx-crown{position:absolute;top:-26px;left:50%;transform:translateX(-50%);font-size:30px;color:#ffd34d;text-shadow:0 0 14px #ffb300;animation:ddbx-reveal .6s ease-out .2s both;}
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
.dmgnum{font-size:150px;animation:ddbx-dmgpunch .55s cubic-bezier(.2,1.6,.35,1);}
@keyframes ddbx-dmgpunch{0%{opacity:0;transform:scale(2.4);filter:blur(8px);}45%{opacity:1;transform:scale(.92);filter:blur(0);}70%{transform:scale(1.05);}100%{transform:scale(1);}}
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
.ddbx-center.gc-head{top:6vh;}
.ddbx-gskill{display:block;font-size:15px;letter-spacing:.14em;text-transform:uppercase;color:#cdbdf0;margin-top:4px;text-shadow:0 2px 6px #000;}
.ddbx-gskill.pend{color:#7a7a86;}
.ddbx-gparts.revealing .ddbx-gp.win{animation:ddbx-portin .6s cubic-bezier(.15,1.3,.4,1) both, ddbx-winpop .7s ease-out .25s;}
@keyframes ddbx-winpop{0%{transform:scale(1.08);}40%{transform:scale(1.2);}100%{transform:scale(1.08);}}
.ddbx-gparts.revealing .ddbx-gp.lose{opacity:.55;filter:saturate(.6);}
/* --- Group Check cards (GM + public) --- */
.ddbx2-pskill{font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:#bda9e8;}
.ddbx2-rrow.win{background:rgba(105,215,127,.08);} .ddbx2-rrow.lose{opacity:.7;}
.ddbx2-gsum{margin-top:8px;font-size:13px;color:#e6e6e6;text-align:center;}
.ddbx2-gsum b{color:#fff;}
.ddbx2-pcg{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-top:8px;}
.ddbx2-pcg-p{position:relative;width:78px;text-align:center;}
.ddbx2-pcg-img{position:relative;width:62px;height:62px;border-radius:50%;background-size:cover;background-position:center;margin:0 auto;box-shadow:0 0 0 2px var(--accent),0 2px 8px #0008;}
.ddbx2-pcg-p.win .ddbx2-pcg-img{box-shadow:0 0 0 3px #69d77f,0 0 16px #69d77f;}
.ddbx2-pcg-p.lose{opacity:.6;}
.ddbx2-pcg-n{font-size:12px;font-weight:bold;color:#fff;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.ddbx2-pcg-s{font-size:10px;letter-spacing:.04em;text-transform:uppercase;color:#bda9e8;min-height:12px;}
.ddbx2-pcg-val{font-size:18px;font-weight:900;color:#fff;}
.ddbx2-pcg-pend{font-size:18px;font-weight:900;color:#888;}
.ddbx2-pcg-crown{position:absolute;top:-12px;left:50%;transform:translateX(-50%);font-size:14px;color:#ffd34d;text-shadow:0 0 8px #ffb300;}
`;
function injectStyles() { if (document.getElementById('ddbx2-styles')) return; const el = document.createElement('style'); el.id = 'ddbx2-styles'; el.textContent = STYLES; document.head.appendChild(el); }

/* ------------------------------------------------------------------ helpers */
function esc(s) { return foundry.utils.escapeHTML ? foundry.utils.escapeHTML(String(s)) : String(s); }
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
function snapshotTargets(tokens) { return (tokens || getTargets()).map(t => { const a = t.actor, s = a?.system ?? {}; return { name: a?.name ?? 'Target', img: a?.img || t.document?.texture?.src || 'icons/svg/mystery-man.svg', ac: s.attributes?.ac?.value ?? null, hp: `${s.attributes?.hp?.value ?? '—'}/${s.attributes?.hp?.max ?? '—'}${s.attributes?.hp?.temp ? '+' + s.attributes.hp.temp : ''}` }; }); }
// A contested check's win/loss: vs the roller (targeted) or highest-wins (group). Returns 'hit'|'miss'|null.
function contestWin(card, name) {
  const tot = card.gen?.contestResults?.[name]; if (tot == null) return null;
  if (card.gen?.group) { const all = [card.gen.total ?? 0, ...Object.values(card.gen.contestResults)]; return tot >= Math.max(...all) ? 'hit' : 'miss'; }
  return (card.gen.total >= tot) ? 'hit' : 'miss';
}

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
    toggles = `<button class="ddbx2-sv ${outcome === 'fail' ? 'on miss' : ''}" data-ddbx="mark" data-tname="${esc(t.name)}" data-v="fail" title="Failed"><i class="fas ${IC.miss}"></i></button>`
      + `<button class="ddbx2-sv ${outcome === 'save' ? 'on hit' : ''}" data-ddbx="mark" data-tname="${esc(t.name)}" data-v="save" title="Saved"><i class="fas ${IC.save}"></i></button>`;
  }
  const tg = card.tgt?.[t.name] || {};
  const actor = actorByName(t.name);
  const m = (tg.mult ?? defaultPortion(outcome, card.save?.onSave, actor, card.dmg?.parts));
  const pbtn = (val, lbl, ti) => `<button class="ddbx2-sv ${m === val ? 'on dmg' : ''}" data-ddbx="tmult" data-tname="${esc(t.name)}" data-mult="${val}" title="${ti}">${lbl}</button>`;
  const effConds = tg.conditions ?? defaultConds(outcome, card);
  const conds = effConds.map(id => `<span class="ddbx2-cond" data-ddbx="delcond" data-tname="${esc(t.name)}" data-cid="${esc(id)}" title="Remove">${esc(condLabel(id))} <i class="fas ${IC.miss}"></i></span>`).join('');
  // Estimate = total × portion (the portion already accounts for resistance); tags show which types are resisted.
  const rb = card.dmg ? resBlend(actor, card.dmg.parts) : null;
  const dealtEst = card.dmg ? Math.floor(dmgTotal(card.dmg) * Math.abs(m)) : null;
  const estHtml = dealtEst != null ? `<span class="ddbx2-est" title="damage after resistances">&asymp;${dealtEst}${(rb?.marks || []).map(([ty, k]) => ` <span class="ddbx2-rk ${k}" title="${ty} ${k === 'imm' ? 'immune' : k === 'vul' ? 'vulnerable' : 'resistant'}">${esc(ty).slice(0, 4)}</span>`).join('')}</span>` : '';
  // Token art is a square the height of both lines, on the left.
  return `<div class="ddbx2-rrow"><img class="ddbx2-ravatar" src="${t.img}"><div class="ddbx2-rmain">`
    + `<div class="ddbx2-rtop"><span class="ddbx2-tname">${esc(t.name)}</span>`
    + (isAtk ? `<span class="ddbx2-stat">AC ${t.ac ?? '?'}</span>` : '')
    + `<span class="ddbx2-grp">${toggles}</span></div>`
    + `<div class="ddbx2-rbot"><span class="ddbx2-portion">${pbtn(0, '0', 'No damage')}${pbtn(0.5, '&frac12;', 'Half')}${pbtn(1, '1', 'Full')}${pbtn(2, '&times;2', 'Double')}</span>${estHtml}`
    + (conds ? `<span class="ddbx2-conds">${conds}</span>` : '') + `</div></div></div>`;
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
        // Status-condition section: pick a condition, apply it to a group of targets.
        const grpLabels = card.save ? { dmg: 'Failed', safe: 'Saved' } : { dmg: 'Hit', safe: 'Missed' };
        const effs = (CONFIG.statusEffects || []).filter(e => e.id);
        const def = (card.actionConds || [])[0];
        const opts = effs.map(e => `<option value="${e.id}" ${e.id === def ? 'selected' : ''}>${esc(game.i18n.localize(e.name ?? e.label ?? e.id))}</option>`).join('');
        const condSec = `<div class="ddbx2-condsec"><i class="fas ${IC.cond}"></i><select class="ddbx2-dsel ddbx2-condpick">${opts}</select>`
          + `<button data-ddbx="condapply" data-grp="dmg">${grpLabels.dmg}</button>`
          + `<button data-ddbx="condapply" data-grp="safe">${grpLabels.safe}</button>`
          + `<button data-ddbx="condapply" data-grp="all">All</button></div>`;
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
        const dcRow = `<div class="ddbx2-dcrow"><span>DC</span>${[5, 10, 15, 20, 25, 30].map(d => `<button class="ddbx2-sv ${card.gen.dc === d ? 'on dmg' : ''}" data-ddbx="gdc" data-dc="${d}">${d}</button>`).join('')}${card.gen.dc != null ? `<button class="ddbx2-sv" data-ddbx="gdc" data-dc="" title="Clear DC"><i class="fas ${IC.miss}"></i></button>` : ''}</div>`;
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
          ? `<div class="ddbx2-gsum">Average <b>${o.avg ?? '—'}</b>${o.dc != null ? ` vs DC ${o.dc} — <b style="color:${o.pass ? '#69d77f' : '#ff7b7b'}">${o.pass ? 'Success' : 'Failure'}</b>` : ''}</div>`
          : `<div class="ddbx2-gsum">${o.dc != null ? 'Passed' : 'Winner'}: <b>${[...o.winners].map(esc).join(', ') || '—'}</b>${o.dc != null ? ` vs DC ${o.dc}` : ''}</div>`) : '';
        const bar = hidden
          ? `<div class="ddbx2-bar inline"><span class="ddbx2-wait"><i class="fas fa-hourglass-half"></i> ${inN}/${targets.length} rolled</span><button data-ddbx="revealcontest"><i class="fas ${IC.hit}"></i> Reveal</button><button class="ddbx2-cancel" data-ddbx="cancelgroup"><i class="fas ${IC.miss}"></i> Cancel</button></div>`
          : `<div class="ddbx2-resolved"><i class="fas ${IC.hit}"></i> Revealed<button class="ddbx2-undo" data-ddbx="hidecontest" title="Hide again"><i class="fas ${IC.reopen}"></i></button><button class="ddbx2-undo" data-ddbx="cancelgroup" title="Cancel"><i class="fas ${IC.miss}"></i></button></div>`;
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
      const dcRow = `<div class="ddbx2-dcrow"><span>DC</span>${[5, 10, 15, 20, 25, 30].map(d => `<button class="ddbx2-sv ${card.gen.dc === d ? 'on dmg' : ''}" data-ddbx="checkdc" data-dc="${d}">${d}</button>`).join('')}</div>`;
      const genBar = card.gen.verdict
        ? `<div class="ddbx2-resolved" style="color:${card.gen.verdict === 'success' ? '#69d77f' : '#ff7b7b'};"><i class="fas ${card.gen.verdict === 'success' ? IC.hit : IC.miss}"></i> ${card.gen.verdict === 'success' ? 'Success' : 'Failure'}${card.gen.dc ? ` vs DC ${card.gen.dc}` : ''}<button class="ddbx2-undo" data-ddbx="regen" title="Undo"><i class="fas ${IC.reopen}"></i></button></div>`
        : `<div class="ddbx2-bar inline"><button data-ddbx="genverdict" data-v="success"><i class="fas ${IC.hit}"></i> Success</button><button data-ddbx="genverdict" data-v="fail"><i class="fas ${IC.miss}"></i> Failure</button></div>`;
      genSec = `<div class="ddbx2-sec"><div class="ddbx2-lbl"><i class="fas ${IC.d20}"></i> ${esc(card.gen.label || 'Roll')}</div><div class="ddbx2-num${gcls}">${card.gen.total}</div>${dcRow}${genBar}</div>`;
    }
  }
  // Compact icon utilities. The save button: hidden on the resolve panel and on save rolls; on a CHECK it
  // contests against a target's save.
  const isCheck = !card.atk && !card.dmg && !!card.gen;
  const showSave = !card.save && !(card.gen?.isSave);
  const saveTitle = isCheck ? 'Contest: roll a target\'s save vs this check' : `Roll a saving throw for targets${card.saveDC != null ? ' (DC ' + card.saveDC + ')' : ''}`;
  const condTitle = (isCheck) ? 'Apply a condition to this character' : 'Toggle a condition on targets';
  const footer = `<div class="ddbx2-bar ddbx2-foot">
    ${showSave ? `<button class="ddbx2-icn" data-ddbx="save" title="${saveTitle}"><i class="fas ${IC.save}"></i></button>` : ''}
    <button class="ddbx2-icn" data-ddbx="condition" title="${condTitle}"><i class="fas ${IC.cond}"></i></button>
    <button class="ddbx2-icn" data-ddbx="reactions" title="List target reactions"><i class="fas ${IC.react}"></i></button>
  </div>`;
  const titleIcon = card.heal ? IC.hp : card.atk ? 'fa-crosshairs' : card.save ? IC.save : card.dmg ? IC.dmg : IC.d20;
  const actTitle = card.gen?.group ? 'Group Check' : card.action;
  return `<div class="ddbx2"><div class="ddbx2-act"><i class="fas ${titleIcon}"></i> ${esc(actTitle)}</div>${atkSec}${saveSec}${dmgSec}${genSec}${footer}</div>`;
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
      let mark = '';
      const sr = pub.save?.results?.[t.name];
      const av = pub.atk?.confirmed ? pub.atk.verdicts?.[t.name] : null;
      const gShown = pub.gen && !pub.gen.hidden; const gc = gShown ? pub.gen.contestResults?.[t.name] : null; const gw = gShown ? contestWin(pub, t.name) : null;
      if (sr) mark = sr === 'fail' ? `<span class="ddbx2-miss"><i class="fas ${IC.miss}"></i></span>` : `<span class="ddbx2-hit"><i class="fas ${IC.save}"></i></span>`;
      else if (av === 'hit' || av === 'miss') mark = `<span class="ddbx2-${av}"><i class="fas ${av === 'hit' ? IC.hit : IC.miss}"></i></span>`;
      else if (gc != null && gw) mark = `<span class="ddbx2-${gw === 'hit' ? 'hit' : 'miss'}">${gc} <i class="fas ${gw === 'hit' ? IC.hit : IC.miss}"></i></span>`;
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
  if (pub.save && dmgReady) bits.push(`DC ${pub.save.dc} ${esc(abilityLabel(pub.save.ability))} save`);
  if (pub.formula) bits.push(esc(pub.formula));
  const sub = bits.join(' &nbsp;|&nbsp; ');
  // Checks/saves show their name as the prominent hero label, so skip the top title to avoid duplication.
  const title = (heroMode === 'gen') ? '' : `<div class="ddbx2-pc-title">${esc(pub.action)}</div>`;
  return `<div class="ddbx2-pc" style="--accent:${accent}">${wm}<div class="ddbx2-pc-body">${title}${body}${tgts}${sub ? `<div class="ddbx2-pc-sub">${sub}</div>` : ''}</div></div></div>`;
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
    // Auto-approve hits after a beat (lets the declaration + dice play first).
    if (p.targets?.length && game.settings.get(NS, 'autoConfirmHits')) setTimeout(() => { try { confirmHits(gm, gmMsg); } catch (e) {} }, 1900);
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
  announce(rec.gm, 'declare'); // refresh the on-screen progress (… → total) but hold the result until the GM reveals
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

async function renderRoll(data) {
  const roll = data.rolls?.[0] || {};
  const rt = (roll.rollType || '').toLowerCase();
  const action = data.action || 'Roll';
  const actor = resolveActor(data);
  const ctx = resolveAction(actor, action);
  const kind = rt === 'to hit' ? 'to hit' : (rt === 'damage' || rt === 'heal' || ctx.isHeal) ? 'damage' : 'other';
  const checkAb = kind === 'other' ? checkAbilityFromName(action) : null;
  const img = checkAb ? abilityIcon(checkAb) : ctx.img;
  const rollerName = actor?.name || data.context?.name || 'D&D Beyond';
  const genLabel = titleCase(action || rt);
  // A check from a participant of an active group check folds into that card (with the skill they rolled) — no new card.
  if (kind === 'other' && await foldGroupRoll(rollerName, Number(roll.result?.total ?? 0), ddbDice(roll), genLabel)) return;
  // Auto group check: a check rolled while MORE THAN ONE player-owned token is targeted (by anyone).
  let targets = snapshotTargets(), group = false;
  if (kind === 'other') {
    const pt = playerTargetedTokens();
    if (pt.length > 1) {
      let toks = pt;
      // Make sure the roller is included even if they didn't target their own token.
      if (actor?.hasPlayerOwner && !pt.some(t => t.actor?.id === actor.id)) { const own = canvas.tokens?.placeables?.find(t => t.actor?.id === actor.id); if (own) toks = [own, ...pt]; }
      targets = snapshotTargets(toks); group = true;
    }
  }
  return present({ who: rollerName, action, actorId: actor?.id || null, saveDC: ctx.saveDC, saveAbility: ctx.saveAbility, saveOnSave: ctx.saveOnSave, actionConds: ctx.actionConds, heal: ctx.isHeal || rt === 'heal', ability: checkAb, group, img, kind, total: Number(roll.result?.total ?? 0), nat: natFace(roll), dtype: ctx.damageType, damageTypes: ctx.damageTypes, dice: ddbDice(roll), advKind: roll.rollKind || '', targets, formula: ddbFormula(roll), genLabel });
}

function targetsFromFlags(ft) {
  if (!ft?.length) return snapshotTargets();
  return ft.map(t => { let a = null; try { a = fromUuidSync(t.uuid); } catch (e) {} const actor = a?.actor || a; const hp = actor?.system?.attributes?.hp; return { name: t.name, img: actor?.img || t.img || 'icons/svg/mystery-man.svg', ac: t.ac ?? actor?.system?.attributes?.ac?.value ?? null, hp: hp ? `${hp.value ?? '—'}/${hp.max ?? '—'}${hp.temp ? '+' + hp.temp : ''}` : '—/—' }; });
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
  const checkLabel = r.skill ? (CONFIG.DND5E?.skills?.[r.skill]?.label || action) : (rtype === 'save' && ability) ? `${abilityLabel(ability)} Saving Throw` : (rtype === 'ability' || rtype === 'check') && ability ? `${abilityLabel(ability)} Check` : titleCase(rtype || action);
  const img = (kind === 'other' && ability) ? abilityIcon(ability) : (ctx.img || item?.img || '');
  // A local check from a group-check participant folds into the active card (with the skill rolled) instead of a new one.
  if (kind === 'other' && groupCardActive() && groupContest?.names.has(who)) { try { if (game.dice3d) game.dice3d.showForRoll(roll, game.user, true); } catch (e) {} foldGroupRoll(who, Number(roll.total ?? 0), null, checkLabel); return; }
  // We cancel the native message, so trigger Dice So Nice ourselves for the real local roll (attacks/damage).
  try { if (game.dice3d && (kind === 'to hit' || kind === 'damage')) game.dice3d.showForRoll(roll, game.user, true); } catch (e) {}
  const args = { who, action, actorId: actor?.id || null, saveDC: ctx.saveDC, saveAbility: ctx.saveAbility, saveOnSave: ctx.saveOnSave, actionConds: ctx.actionConds, heal: ctx.isHeal || rtype === 'heal', ability: (kind === 'other') ? ability : null, genSave: rtype === 'save', img, kind, total: Number(roll.total ?? 0), nat, dtype: ctx.damageType, damageTypes: ctx.damageTypes, dice: null, advKind: '', targets: targetsFromFlags(f.targets), formula: roll.formula, genLabel: kind === 'other' ? checkLabel : (rtype || action) };
  enqueueRoll(() => present(args));
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
  if (!card.gen?.hidden) announce(card, 'result'); else announce(card, 'declare');
}
// Set/clear the DC on a group check WITHOUT revealing (results stay hidden until the GM confirms).
async function setGroupDC(card, dc, message) {
  const set = (c) => { if (c?.gen) { if (dc == null) delete c.gen.dc; else c.gen.dc = dc; } };
  set(card); const rec = actionCards.get(cardKey(card)); if (rec) { set(rec.gm); set(rec.pub); }
  await syncCards(card, message);
  if (!card.gen?.hidden) announce(card, 'result'); else announce(card, 'declare');
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
async function rollContest(card, name, message) {
  const sel = card.gen?.contestSkill; if (!sel) { ui.notifications.warn('DDB: pick what the targets roll.'); return; }
  const total = await contestRoll(actorByName(name), sel);
  if (typeof total === 'number') { setContestResult(card, name, total); await syncCards(card, message); }
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
  if (card.gen?.group) announce(card, card.gen.hidden ? 'declare' : 'result');
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
async function setTargetCondition(card, name, cid, add, message) {
  // Materialize from the suggested defaults the first time the GM edits this target's conditions.
  const base = card.tgt?.[name]?.conditions ?? defaultConds(getOutcome(card, name), card);
  const next = Array.from(new Set(add ? [...base, cid] : base.filter(x => x !== cid)));
  const set = (c) => { if (c) ensureTgt(c, name).conditions = [...next]; };
  set(card); const rec = actionCards.get(cardKey(card)); if (rec) { set(rec.gm); set(rec.pub); }
  if (message) { try { await message.update({ content: buildCard(card), flags: { [NS]: { card } } }); } catch (e) {} }
}
// Add a condition to a group of targets: 'dmg' (hit/failed-save), 'safe' (miss/saved), or 'all'.
async function applyGroupCondition(card, grp, cid, message) {
  if (!cid) return;
  for (const t of (card.targets || [])) {
    const o = getOutcome(card, t.name);
    const took = (o === 'hit' || o === 'fail');
    const inGrp = grp === 'all' || (grp === 'dmg' && took) || (grp === 'safe' && (o === 'miss' || o === 'save'));
    if (!inGrp) continue;
    const cur = card.tgt?.[t.name]?.conditions ?? defaultConds(o, card);
    if (cur.includes(cid)) continue;
    const next = Array.from(new Set([...cur, cid]));
    const set = (c) => { if (c) ensureTgt(c, t.name).conditions = [...next]; };
    set(card); const rec = actionCards.get(cardKey(card)); if (rec) { set(rec.gm); set(rec.pub); }
  }
  await syncCards(card, message);
}
// Unified apply: per-target damage/healing (portion × parts) + conditions, then confirm/reveal in one shot.
// Records exactly what was done per target so the undo can reverse it precisely.
async function applyAll(card, message) {
  const dmg = card?.dmg; if (!dmg) return;
  const targets = card.targets || []; if (!targets.length) { ui.notifications.warn('DDB: no targets to apply to.'); return; }
  const isAtk = !!card.atk, heal = !!card.heal; const parts = dmgApplyParts(dmg); const audit = []; const detail = {};
  for (const t of targets) {
    const actor = actorByName(t.name); if (!actor) continue;
    const outcome = isAtk ? (card.atk.verdicts?.[t.name] ?? defaultHit(t, card.atk.total)) : card.save?.results?.[t.name];
    const mult = card.tgt?.[t.name]?.mult ?? defaultPortion(outcome, card.save?.onSave, actor, dmg.parts);
    // Portion already includes resistance, so apply total×portion directly (no second resistance pass).
    const dealt = Math.floor(dmgTotal(dmg) * Math.abs(mult));
    if (mult !== 0) { try { (heal ? applyHealing : manualDamage)(actor, dealt); } catch (e) { console.error(e); } }
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
  announce(card, 'impact');
  ChatMessage.create({ whisper: ChatMessage.getWhisperRecipients('GM').map(u => u.id), content: `<b>${esc(card.action)}</b> — ${esc(txt)}` });
}
// Undo = reverse exactly what applyAll did: heal back the damage (or remove the healing) and drop only the
// conditions we actually added (leave ones the target already had).
async function reopenAll(card, message) {
  const detail = card.appliedDetail || {};
  for (const [name, det] of Object.entries(detail)) {
    const actor = actorByName(name); if (!actor) continue;
    try { (det.heal ? manualDamage : applyHealing)(actor, det.dealt); } catch (e) { console.error(e); }
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
async function promptCondition(card) {
  // On a check/save the condition applies to the roller; otherwise to the targeted/selected tokens.
  const selfActor = (card?.gen && card.actorId) ? game.actors.get(card.actorId) : null;
  const t = selfActor ? [selfActor] : applyTargetsList();
  if (!t.length) { ui.notifications.warn('DDB: target/select token(s).'); return; }
  const opts = (CONFIG.statusEffects ?? []).filter(e => e.id).map(e => `<option value="${e.id}">${game.i18n.localize(e.name ?? e.label ?? e.id)}</option>`).join('');
  let chosen; try { chosen = await foundry.applications.api.DialogV2.wait({ window: { title: `Condition · ${t.map(a => a.name).join(', ')}` }, content: `<select name="cond" style="width:100%;">${opts}</select>`, buttons: [{ action: 'ok', label: 'Toggle', default: true, callback: (e, b) => b.form.elements.cond.value }, { action: 'cancel', label: 'Cancel', callback: () => null }] }); } catch (e) { return; }
  if (!chosen) return; for (const a of t) { try { await a.toggleStatusEffect?.(chosen); } catch (e) { console.error(e); } }
}
// Contested check: roll a target's save (Dice So Nice), then resolve the check vs that total.
async function promptContest(card, message) {
  const t = applyTargetsList(); if (!t.length) { ui.notifications.warn('DDB: target a token to contest.'); return; }
  const actor = t[0];
  const buttons = Object.entries(CONFIG.DND5E?.abilities ?? {}).map(([k, c]) => ({ action: k, label: c.label ?? k.toUpperCase(), callback: () => k }));
  let ability; try { ability = await foundry.applications.api.DialogV2.wait({ window: { title: `Contest · ${actor.name}` }, content: '<p>Roll which save to contest?</p>', buttons }); } catch (e) { return; }
  if (!ability) return;
  const total = await rollOneSave(actor.name, ability);
  if (typeof total === 'number') await setCheckDC(card, total, message);
  else ui.notifications.warn(`DDB: couldn't roll ${actor.name}'s save.`);
}
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
    case 'checkdc': return setCheckDC(card, Number(ds.dc), message);
    case 'rollcontest': return rollContest(card, ds.tname, message);
    case 'rollallcontest': return rollAllContest(card, message);
    case 'revealcontest': return revealContest(card, message);
    case 'hidecontest': return hideContest(card, message);
    case 'cancelgroup': return cancelGroupContest(card, message);
    case 'gmode': return setGroupMode(card, ds.mode, message);
    case 'gdc': return setGroupDC(card, ds.dc === '' ? null : Number(ds.dc), message);
    case 'mark': return markSave(card, ds.tname, ds.v, message);
    case 'rollsave': return rollSave(card, ds.tname, message);
    case 'rollallsaves': return rollAllSaves(card, message);
    case 'tmult': return setTargetMult(card, ds.tname, Number(ds.mult), message);
    case 'delcond': return setTargetCondition(card, ds.tname, ds.cid, false, message);
    case 'applyall': return applyAll(card, message);
    case 'reopenall': return reopenAll(card, message);
    case 'reveal': return revealDamage(card, message);
    case 'save': return (card.gen && !card.gen.isSave) ? promptContest(card, message) : promptSaves();
    case 'condition': return promptCondition(card);
    case 'reactions': return listReactions();
  }
}

/* ------------------------------------------------------------- socket tap */
function onRaw(ev) {
  let msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
  if (typeof msg?.eventType !== 'string' || !msg.eventType.startsWith('dice/roll')) return;
  const data = msg.data || msg; const rollId = data.rollId || msg.id;
  try { if (game.settings.get(NS, 'debug')) console.log('[ddbx ddb-roll]', { eventType: msg.eventType, action: data.action, rollType: data.rolls?.[0]?.rollType, rollKind: data.rolls?.[0]?.rollKind, total: data.rolls?.[0]?.result?.total, data }); } catch (e) {}
  if (!rollId || seen.has(rollId)) return; seen.set(rollId, Date.now());
  if (!data.rolls?.length) return;
  enqueueRoll(() => renderRoll(data));
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
const TONE_HUE = { hit: 130, success: 130, miss: 2, failure: 2, crit: 45, critmiss: 350 };
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
  return `<div class="ddbx-gp${cls}"><div class="ddbx-gp-img" style="background-image:url('${t.img || 'icons/svg/mystery-man.svg'}')">${crown}</div><div class="ddbx-gp-n">${esc(t.name)}</div>${skill}${val}</div>`;
}
let _declareEl = null, _declareTimer = null;
// Tear down any lingering cinematic (e.g. a cancelled group contest) on every client.
function clearStingerLocal() { try { clearTimeout(_declareTimer); document.querySelectorAll('.ddbx-sting').forEach(el => el.remove()); _declareEl = null; liftDice(false); } catch (e) {} }
function hideStinger() { clearStingerLocal(); try { game.socket?.emit(`module.${NS}`, { t: 'clearsting' }); } catch (e) {} }
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
// Reserve the docked sidebar on the right so cinematic CONTENT centers in the actual free play area (not the
// whole window). Getting this wrong shifts a single centered target off to one side — so measure the sidebar
// itself (robust across Foundry v11–v14 DOM changes) and fall back to the chat panel.
function rightInset() {
  const inW = window.innerWidth;
  try {
    const sbEl = ui.sidebar?.element; const sb = (sbEl instanceof HTMLElement) ? sbEl : (sbEl?.[0] || document.getElementById('sidebar'));
    let left = 0;
    const sr = sb?.getBoundingClientRect?.();
    // Only reserve when the sidebar is actually docked against the right edge and is reasonably wide (expanded).
    if (sr && sr.width > 40 && sr.right >= inW - 40) left = sr.left;
    if (!left) { const ce = (ui.chat?.element instanceof HTMLElement ? ui.chat.element : ui.chat?.element?.[0]) || document.querySelector('#chat, #chat-log, #chat-notifications'); const cr = ce?.getBoundingClientRect?.(); if (cr && cr.width > 80 && cr.right >= inW - 40) left = cr.left; }
    if (!left) return 0;
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
    const span = 130, start = 25;
    const deg = n > 1 ? start + (idx / (n - 1)) * span : 90;
    const ang = deg * Math.PI / 180;
    const x = 50 + Math.cos(ang) * 33, y = 50 + Math.sin(ang) * 26;
    pos = `position:absolute;left:${x.toFixed(1)}%;top:${y.toFixed(1)}%;transform:translate(-50%,-50%);`;
  }
  const win = (t.mark === 'hit' || t.mark === 'save'), lose = (t.mark === 'miss' || t.mark === 'fail');
  const cls = win ? ' win' : lose ? ' lose' : '';
  const mk = t.mark ? `<span class="ddbx-tg-m" style="color:${col}"><i class="fas ${markIcon(t.mark)}"></i></span>` : '';
  return `<div class="ddbx-tg${cls}" style="${pos}width:${size}px;height:${size}px;background-image:url('${t.img || 'icons/svg/mystery-man.svg'}');">${mk}<span class="ddbx-tg-n">${esc(t.name)}</span></div>`;
}
async function playStinger(p) {
  try {
    if (!document.body) return;
    if (!game.settings.get(NS, 'stingers')) return;
    const layout = 'orbit';
    const crit = p.tone === 'crit' || p.tone === 'critmiss';
    // Declaration lingers (12s) until the result fires; result holds ~7s; the damage impact is a quick, punchy hit.
    const dur = (p.phase === 'declare') ? 12000 : (p.phase === 'impact') ? 2300 : 7000;
    // A result OR a refreshed declaration (group progress tick) clears the lingering declaration first.
    if ((p.phase === 'result' || p.phase === 'declare') && _declareEl) { clearTimeout(_declareTimer); _declareEl.remove(); _declareEl = null; }
    // Actor's theme colour drives the cinematic when available; else result tone / ability / sampled art.
    let H = hexToHue(p.color);
    if (p.phase === 'impact') H = p.heal ? 140 : (damageHue(p.dtype) ?? H ?? 0);
    if (H == null) { if (p.phase === 'result') H = TONE_HUE[p.tone] ?? 45; else H = (p.hue != null) ? p.hue : (await imgHue(p.img)); }
    if (H == null) H = p.heal ? 140 : 265;
    const colorBg = !!p.color; // a constant colour field instead of the blurred art
    const wrap = document.createElement('div'); wrap.className = `ddbx-sting lay-${layout} ph-${p.phase}${crit ? ' crit' : ''}${colorBg ? ' colorbg' : ''}`;
    wrap.style.setProperty('--c1', `hsl(${H} 78% 62%)`); wrap.style.setProperty('--c2', `hsl(${H} 80% 26%)`); wrap.style.setProperty('--dur', dur + 'ms');
    let particles = ''; const N = p.phase === 'result' ? 44 : 30; for (let i = 0; i < N; i++) { const x = (Math.random() * 100).toFixed(1); const dl = (Math.random() * 1.8).toFixed(2); const du = (1.6 + Math.random() * 1.9).toFixed(2); const sz = (2 + Math.random() * 5).toFixed(1); const sway = Math.round(Math.random() * 50 - 25); const spark = i % 4 === 0 ? ' spark' : ''; particles += `<span class="ddbx-pt${spark}" style="left:${x}%;--sway:${sway}px;width:${sz}px;height:${sz}px;animation-delay:${dl}s;animation-duration:${du}s;"></span>`; }
    const tint = (p.tintArt && p.artHue != null);
    const bgFilter = tint ? `filter:blur(64px) ${recolor(p.artHue, 0.55)};` : "";
    const embFilter = tint ? `filter:${recolor(p.artHue, 1.05)};` : '';
    const frame = layout === 'theater' ? `<div class="ddbx-lb top"></div><div class="ddbx-lb bot"></div>` : layout === 'versus' ? `<div class="ddbx-streak"></div>` : `<div class="ddbx-radial"></div>`;
    // Caster portrait with the player's nickname directly beneath it.
    const caster = p.actorImg ? `<div class="ddbx-casterwrap"><span class="ddbx-caster" style="background-image:url('${p.actorImg}')"></span>${p.who ? `<span class="ddbx-cname">${esc(p.who)}</span>` : ''}</div>` : '';
    // Action name ABOVE the action artwork (declaration); result word above the art, action name beneath.
    // Orbit: the caster portrait is the hero, so no emblem — just the glowing line for checks.
    const emblem = (layout !== 'orbit' && p.img) ? `<div class="ddbx-emblem${p.tintArt ? ' bare' : ''}" style="background-image:url('${p.img}');${embFilter}"></div>` : '';
    const glow = p.tintArt ? '<div class="ddbx-glow"></div>' : '';
    const rsub = p.action ? `${esc(p.action)}${p.dc ? ` &middot; DC ${p.dc}` : ''}` : (p.dc ? `DC ${p.dc}` : '');
    const center = (p.phase === 'result')
      ? `<div class="ddbx-center"><div class="ddbx-burst"></div><div class="ddbx-result">${esc(p.word || '')}</div>${emblem}${rsub ? `<div class="ddbx-rsub">${rsub}</div>` : ''}</div>`
      : `<div class="ddbx-center"><div class="ddbx-title">${esc(p.action || '')}</div>${glow}${emblem}${p.total != null ? `<div class="ddbx-total">${p.total}</div>` : ''}${p.dc ? `<div class="ddbx-dc">DC ${p.dc}</div>` : ''}</div>`;
    const tg = p.targets || []; const tsize = 140; // ~1/3 smaller than the caster
    const targets = tg.length ? `<div class="ddbx-tgrp">${tg.slice(0, 8).map((t, i) => targetChip(t, tsize, i, Math.min(tg.length, 8), layout)).join('')}</div>` : '';
    const showBg = p.img && !colorBg;
    const bgEl = showBg ? `<div class="ddbx-bg" style="background-image:url('${p.img}');${bgFilter}"></div>` : '';
    const tex = '<div class="ddbx-tex"></div>';
    if (p.phase === 'impact') {
      // Full-screen damage hit: themed effect + edge flash + screen shake. Punchy and quick.
      const dmgType = p.heal ? 'healing' : p.dtype;
      const num = p.total != null ? `<div class="ddbx-result dmgnum">${p.total}</div>` : '';
      const lab = `<div class="ddbx-rsub">${p.heal ? 'healing' : `${esc(p.dtype || '')} damage`}</div>`;
      wrap.classList.add('impactwrap');
      wrap.innerHTML = `<div class="ddbx-vig hit"></div>${tex}<div class="ddbx-flash"></div>${damageFx(dmgType)}<div class="ddbx-stage"><div class="ddbx-center">${num}${lab}</div></div>`;
      try { shakeScreen(p.heal ? 'soft' : ((p.total ?? 0) >= 25 ? 'hard' : 'med')); } catch (e) {}
    } else if (p.group) {
      // Group Check: every participant shown once as an equal; no central caster. Declare = live progress; result = reveal.
      const parts = (p.targets || []).slice(0, 12).map(t => groupChip(t)).join('');
      const isCheck = (p.mode || 'check') === 'check';
      let head;
      if (!p.reveal) head = `<div class="ddbx-title">Group Check</div><div class="ddbx-rsub">${isCheck ? 'party average' : 'contest'}${p.dc != null ? ` &middot; DC ${p.dc}` : ''}</div>`;
      else if (isCheck) head = `<div class="ddbx-title">Group Check</div><div class="ddbx-result">${esc(p.word || '—')}</div><div class="ddbx-rsub">party average${p.dc != null ? ` &middot; ${p.pass ? 'Success' : 'Failure'} vs DC ${p.dc}` : ''}</div>`;
      else head = `<div class="ddbx-result">${p.dc != null ? 'PASSED' : 'WINNER'}</div><div class="ddbx-rsub">${esc(p.word || '—')}</div>`;
      wrap.innerHTML = `${bgEl}<div class="ddbx-vig"></div>${tex}<div class="ddbx-pts">${particles}</div><div class="ddbx-center gc-head">${head}</div><div class="ddbx-gparts${p.reveal ? ' revealing' : ''}">${parts}</div>`;
    } else {
      wrap.innerHTML = `${bgEl}<div class="ddbx-vig"></div>${tex}${frame}<div class="ddbx-pts">${particles}</div><div class="ddbx-stage">${caster}${center}${targets}</div>`;
    }
    wrap.style.right = rightInset() + 'px';
    document.body.appendChild(wrap); liftDice(true);
    const done = () => { wrap.remove(); if (_declareEl === wrap) _declareEl = null; if (!document.querySelector('.ddbx-sting')) liftDice(false); };
    // A group contest declaration stays up until all rolls land (reveal) or the GM cancels — no auto-dismiss.
    if (p.phase === 'declare') { _declareEl = wrap; if (!p.group) _declareTimer = setTimeout(done, dur); }
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
    const group = !!card.gen?.group;
    const base = { phase, action: isCheck ? (card.gen.label || card.action) : card.action, img: card.img || '', actorImg: actor?.img || '', who: card.who || actor?.name || '', hue, tintArt: isCheck && hue != null, artHue: hue, color: actorThemeColor(actor), dc: card.gen?.dc ?? card.save?.dc ?? null, group };
    let payload;
    if (phase === 'impact') {
      payload = { ...base, total: dmgTotal(card.dmg), dtype: (card.dmg?.parts || []).map(p => p.type).filter(Boolean)[0] || dmgTypeLabel(card.dmg), heal: !!card.heal };
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
      payload = { ...base, total: (card.atk?.total ?? card.gen?.total ?? null), targets: (card.targets || []).map(t => ({ name: t.name, img: t.img })) };
    } else { // result — one outcome word + per-target marks
      const nat = card.atk?.nat ?? card.gen?.nat;
      let word = '', tone = 'hit';
      if (card.atk) {
        if (nat === 20) { word = 'Critical Hit'; tone = 'crit'; } else if (nat === 1) { word = 'Critical Miss'; tone = 'critmiss'; }
        else { const v = Object.values(card.atk.verdicts || {}); const allHit = v.length && v.every(x => x === 'hit'), allMiss = v.length && v.every(x => x === 'miss'); word = allHit ? 'Hit' : allMiss ? 'Miss' : 'Hit & Miss'; tone = allMiss ? 'miss' : 'hit'; }
      } else if (isCheck && card.gen.contestResults && Object.keys(card.gen.contestResults).length) {
        const tot = card.gen.total ?? 0; const rs = Object.values(card.gen.contestResults); const won = rs.filter(v => tot >= v).length;
        word = `${won}/${rs.length} Won`; tone = won >= rs.length - won ? 'hit' : 'miss';
      } else if (isCheck) {
        if (nat === 20) { word = 'Critical Success'; tone = 'crit'; } else if (nat === 1) { word = 'Critical Failure'; tone = 'critmiss'; }
        else { word = card.gen.verdict === 'success' ? 'Success' : 'Failure'; tone = card.gen.verdict === 'success' ? 'success' : 'failure'; }
      } else if (card.save) {
        const r = Object.values(card.save.results || {}); const f = r.filter(x => x === 'fail').length, s = r.filter(x => x === 'save').length;
        word = `${f} Failed · ${s} Saved`; tone = f >= s ? 'hit' : 'miss';
      }
      const cr = card.gen?.contestResults; const ctot = card.gen?.total ?? 0;
      const targets = (card.targets || []).map(t => ({ name: t.name, img: t.img, mark: card.atk ? (card.atk.verdicts?.[t.name] ?? defaultHit(t, card.atk.total)) : card.save ? card.save.results?.[t.name] : (cr && cr[t.name] != null) ? (ctot >= cr[t.name] ? 'hit' : 'miss') : null }));
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
  game.settings.register(NS, 'autoConfirmHits', { name: 'Auto-approve attack hits', hint: 'Automatically confirm attack hit/miss (from the target ACs) without clicking Confirm hits.', scope: 'world', config: true, type: Boolean, default: false });
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
  try { game.socket?.on(`module.${NS}`, (m) => { if (m?.t === 'stinger') playStinger(m.payload, false); else if (m?.t === 'clearsting') clearStingerLocal(); }); } catch (e) {}
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
      if (b.dataset.ddbx === 'condapply') {
        if (!game.user.isGM) return;
        const sel = b.closest('.ddbx2-condsec')?.querySelector('.ddbx2-condpick');
        applyGroupCondition(card, b.dataset.grp, sel?.value, message);
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
  console.log(`DDB Roll Cards | ready (v4.27) — ${game.modules.get(SYNC)?.active ? 'riding ddb-sync socket' : 'standalone connection'}`);
});
