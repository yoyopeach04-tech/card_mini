// ============================================================
//  ⚔️ CARD BATTLE ENGINE — HYBRID v4.5.2 (FINAL BOSS OPTIMIZED)
// ============================================================

// ── 1. CONFIG & HELPERS ────────────────────────────────────
// cloneCard: deep-clone การ์ด (ใช้ structuredClone เพื่อ clone nested objects ได้ครบ)
// Fix Bug #6: shallow clone เดิมพัง buff/effect ที่ซ้อนกันหลายชั้น
function cloneCard(c) {
  try {
    return structuredClone(c);
  } catch {
    return { ...c, skills: c.skills ? c.skills.map(s => ({ ...s })) : [] };
  }
}
// ── Board / Hand limits ─────────────────────────────────────
// FIX: แทน magic number 7 ที่กระจาย 8 จุด — แก่ที่เดียวเพื่อเปลี่ยน board size
const BOARD_SIZE = 7;
const HAND_LIMIT  = 7;
let gameSpeed = 1;
// Fix Bug #5: ทั้ง sleep และ sd หาร gameSpeed เองอิสระ — ใช้อันเดียวกันต่อ flow
// sleep = await-able pause / sd = fire-and-forget cleanup (อย่าผสมใน timing เดียวกัน)
const sleep = ms => new Promise(r => setTimeout(r, ms / gameSpeed));
const sd    = (fn, ms) => setTimeout(fn, ms / gameSpeed);
const $      = id => document.getElementById(id);
// FIX: ใช้ skill.id (exact match) แทน s.name.includes(k) ป้องกัน false-positive
// ถ้าสกิลมี id → เปรียบเทียบ id ตรงๆ / ถ้าไม่มี → fallback เป็น name.includes (backward compat)
const hasSkill  = (c, k) => c?.skills?.some(s => s.id ? s.id === k : s.name.includes(k));
const getMyBoard = p => p ? playerBoard : enemyBoard;
const markDirty  = () => { boardDirty = true; };
const flushBoard = () => { if (boardDirty) { realRenderBoard(); boardDirty = false; } };


// ── 4. STATE ───────────────────────────────────────────────
let playerHP = 25000, enemyHP = 25000, isGameOver = false, cardUidCounter = 0, combatStats = {};
let playerDeck = [], enemyDeck = [], hand = [], enemyHand = [];
let playerBoard = Array(BOARD_SIZE).fill(null), enemyBoard = Array(BOARD_SIZE).fill(null);
let playerGraveyard = [], enemyGraveyard = [], boardDirty = false;

// ── 5. DOM REFS (กำหนดตรงนี้ก่อน, assign ใน DOMContentLoaded ด้านล่าง) ──────
// Fix Bug #1+#2: ประกาศ let ก่อน จะ assign หลัง DOM โหลด
let handZone, enemyHandZone;
let playerBoardSlots, enemyBoardSlots;
let playerHeroText, enemyHeroText, playerHeroEl, enemyHeroEl;
let endTurnBtn, logContent, logToggle, logContainer;
let statsBtn, statsContainer;

function addLog(msg) {
  if (!logContent) return;
  const e = document.createElement('div'); e.className = 'log-entry';
  e.innerHTML = `<span class="log-time">[${new Date().toLocaleTimeString('th-TH', { hour12: false })}]</span> ${msg}`;
  logContent.appendChild(e);
  logContent.scrollTop = logContent.scrollHeight;
}

// ── 6. BATTLE ENGINE v4.5.2 (RAF + POOL + WEAKMAP + STAGGER) ──
let battlefieldEl;
const lastFloatTime = new WeakMap();
let globalFloatOrder = 0;

const FLOAT_CFG = {
  dmg:   { color:"#ff3333", size:"2.2rem" },
  heal:  { color:"#33ff33", size:"2.2rem" },
  skill: { color:"#ffcc00", size:"1.6rem" },
  drain: { color:"#ffd700", size:"2.2rem" } 
};

const FLOAT_DURATION = 900;
const FLOAT_POOL_SIZE = 40; // เพิ่ม Pool นิดนึงรับ AOE
const MAX_SPAWN_PER_FRAME = 8;

const floatPool  = [];
const floatQueue = [];
const activeFloats = [];

let battlefieldRect = null;
let rectCache = new Map();

for (let i = 0; i < FLOAT_POOL_SIZE; i++){
  const el = document.createElement("div");
  el.className = "floating-text";
  el.style.cssText = "position:absolute;pointer-events:none;font-weight:bold;text-shadow:2px 2px 0 #000,-2px -2px 0 #000,2px -2px 0 #000,-2px 2px 0 #000,4px 4px 10px rgba(0,0,0,0.8);will-change:transform,opacity;z-index:9999;";
  floatPool.push(el);
}

// ✅ public API + Delay Support for AOE Stagger
function showFloat(msg, cardEl, type="dmg", delayMS=0) {
  if (!cardEl) return;
  const data = { msg, type, cardEl, order: globalFloatOrder++ };
  
  if (delayMS > 0) {
    setTimeout(() => floatQueue.push(data), delayMS / gameSpeed);
  } else {
    floatQueue.push(data);
  }
}

function acquireFloat() {
  if (floatPool.length) return floatPool.pop();
  if (activeFloats.length) {
    const oldest = activeFloats.shift();
    releaseFloat(oldest.el);
    return floatPool.pop();
  }
  return null;
}

function releaseFloat(el) {
  el.remove();
  floatPool.push(el);
}

function getCardRect(el) {
  if (rectCache.has(el)) return rectCache.get(el);
  const r = el.getBoundingClientRect();
  rectCache.set(el, r);
  return r;
}
// getEffectRect: เหมือน getCardRect แต่ใช้ได้นอก RAF loop (effect code)
// clear cache อัตโนมัติเมื่อ DOM เพิ่งถูก flush
const getEffectRect = (el) => {
  if (!el) return null;
  if (rectCache.has(el)) return rectCache.get(el);
  const r = el.getBoundingClientRect();
  rectCache.set(el, r);
  return r;
};

function spawnFloat(data) {
  const el = acquireFloat();
  if (!el) return;

  const cfg = FLOAT_CFG[data.type] ?? FLOAT_CFG.dmg;
  const rect = getCardRect(data.cardEl);

  const startX = rect.left - battlefieldRect.left + rect.width/2 + (Math.random()-0.5)*22;
  const startY = rect.top - battlefieldRect.top + rect.height/2 - 10;

  el.textContent = data.msg;
  el.style.color = cfg.color;
  el.style.fontSize = cfg.size;
  el.style.left = startX + "px";
  el.style.top  = startY + "px";
  el.style.opacity = "1";
  el.style.transform = "translate(0,0)";

  battlefieldEl.appendChild(el);
  activeFloats.push({ el, time: 0 });
}

let lastTime = performance.now();

function updateFloats(now) {
  const dt = now - lastTime;
  lastTime = now;

  const duration = FLOAT_DURATION / gameSpeed;
  battlefieldRect = getEffectRect(battlefieldEl);
  rectCache.clear();

  let budget = MAX_SPAWN_PER_FRAME;
  const staggerTime = 500 / gameSpeed;

  // ✅ เรียงคิวตาม Order (มากไปน้อย) เพื่อให้ pop() ทำงานเร็วสุดแบบ O(1)
  if (floatQueue.length > 1) {
    floatQueue.sort((a, b) => b.order - a.order);
  }

  let qIdx = 0;
  while (qIdx < floatQueue.length && budget > 0) {
    const itemIdx = floatQueue.length - 1 - qIdx;
    const data = floatQueue[itemIdx];
    const card = data.cardEl;
    const last = lastFloatTime.get(card) || 0;

    if (now - last > staggerTime) {
      lastFloatTime.set(card, now);
      spawnFloat(data);
      floatQueue.splice(itemIdx, 1);
      budget--;
    } else {
      qIdx++;
    }
  }

  for (let i = activeFloats.length - 1; i >= 0; i--) {
    const f = activeFloats[i];
    f.time += dt;
    const t = Math.min(f.time / duration, 1);

    if (t >= 1) {
      releaseFloat(f.el);
      activeFloats.splice(i, 1);
      continue;
    }

    const moveY = -65 * t;
    const moveX = Math.sin(t * Math.PI) * 8;
    const opacity = 1 - (t * t);

    const el = f.el;
    el.style.transform = `translate(${moveX}px,${moveY}px)`;
    el.style.opacity = opacity;
  }
  requestAnimationFrame(updateFloats);
}
// RAF loop จะถูก start ใน DOMContentLoaded ด้านล่าง

function cleanupAllEffects() {
  // FIX: แทน hardcode selector list ที่ต้องแก้ทุกครั้งเพิ่ม effect ใหม่
  // ทุก visual effect element ควรเพิ่ม class 'battle-vfx' ตอนสร้าง
  // → querySelectorAll('.battle-vfx') เพียงพอ ไม่มี selector หลุด
  document.querySelectorAll('.battle-vfx').forEach(el => el.remove());
}

function renderStatsUI() {
  let sorted = Object.values(combatStats).sort((a, b) => (b.dmg + b.taken + b.heal) - (a.dmg + a.taken + a.heal));
  let mD = Math.max(...sorted.map(s => s.dmg), 1), mT = Math.max(...sorted.map(s => s.taken), 1), mH = Math.max(...sorted.map(s => s.heal), 1);
  $('stats-content').innerHTML = sorted.filter(s => s.dmg || s.taken || s.heal).map(s => `
    <div class="stat-card-row">
      <div class="stat-name"><span class="${s.owner === 'พีช' ? 'log-player' : 'log-enemy'}">${s.owner}</span> — ${s.name}${s.isClone ? ' (โคลน)' : ''}</div>
      ${s.dmg   ? `<div class="stat-bar-bg"><div class="stat-bar-fill fill-dmg"  style="width:${s.dmg/mD*100}%">⚔️ ${s.dmg}</div></div>`   : ''}
      ${s.taken ? `<div class="stat-bar-bg"><div class="stat-bar-fill fill-tank" style="width:${s.taken/mT*100}%;color:#fff">🛡️ ${s.taken}</div></div>` : ''}
      ${s.heal  ? `<div class="stat-bar-bg"><div class="stat-bar-fill fill-heal" style="width:${s.heal/mH*100}%">💚 ${s.heal}</div></div>`  : ''}
    </div>`).join('') || "<div style='text-align:center;color:#888'>ยังไม่มีสถิติ</div>";
}


// ── 13. TURN PHASE ─────────────────────────────────────────
async function processTurnPhase(isPlayer) {
  getMyBoard(isPlayer).forEach(initCard);
  const slots  = isPlayer ? playerBoardSlots : enemyBoardSlots;
  const heroEl = isPlayer ? playerHeroEl : enemyHeroEl;
  
  for (let i = 0; i < BOARD_SIZE; i++) {
    if (isGameOver) return;
    let myBoard = getMyBoard(isPlayer), pCard = myBoard[i];
    if (!pCard || pCard.hp <= 0) continue;
    const pN = `<span class="${isPlayer ? 'log-player' : 'log-enemy'}">${pCard.name}</span>`;

    if (pCard.immortalTurns  > 0) pCard.immortalTurns--;
    if (pCard.reviveBuffTurns > 0) { pCard.reviveBuffTurns--; if (!pCard.reviveBuffTurns) pCard.atk -= Math.floor(pCard.baseATK * 0.2); }

    // 🌌 Corrupt tick-down
    if ((pCard.corruptTurns || 0) > 0) { pCard.corruptTurns--; markDirty(); }

    if ((pCard.burnTurns || 0) > 0) {
      let bd = Math.floor((pCard.maxHP || pCard.hp) * 0.05);
      pCard.hp -= bd; pCard.burnTurns--;
      if (combatStats[pCard?.uid]) combatStats[pCard?.uid].taken += bd;
      showFloat(`🔥 -${bd}`, slots[i], "dmg"); addLog(`🔥 ${pN} ไฟไหม้! -${bd} (${pCard.burnTurns} เทิร์นที่เหลือ)`);
      if (pCard.hp <= 0) { await checkDeaths(); myBoard = getMyBoard(isPlayer); pCard = myBoard[i]; if (!pCard) continue; }
    }

    let isInStealth = false;
    if (hasSkill(pCard, "Shadow Protocol") && (pCard.shadowTurns || 0) > 0) {
      pCard.shadowTurns--;
      if (pCard.shadowTurns > 0) { showFloat(`👻 STEALTH(${pCard.shadowTurns})`, slots[i], "skill"); addLog(`👻 ${pN} ซ่อนตัว (${pCard.shadowTurns} เทิร์น)`); isInStealth = true; }
      else { pCard.shadowReady = true; showFloat("💥 SHADOW BREAK!", slots[i], "skill"); addLog(`💥 ${pN} ออกซ่อน! โจมตีถัดไป ×2.5`); }
      markDirty(); flushBoard();
    }

    // 🦁 Hunter's Aura — toggle ATK+30% เมื่อมีศัตรู baseWait < 3 บนสนาม
    if (hasSkill(pCard, "Hunter's Aura")) {
      const oBoard2 = getMyBoard(!isPlayer);
      const hasWeak = oBoard2.some(c => c && c.hp > 0 && (c.baseWait || 0) < 3);
      if (hasWeak && !pCard.hunterAuraActive) {
        pCard.hunterAuraActive = true;
        const bonus = Math.floor(pCard.baseATK * 0.3);
        pCard._displayATK = pCard.atk; pCard.hunterAuraBonus = bonus;
        pCard.atk = Number(pCard.atk) + bonus;
        showFloat("🦁 HUNTER +30%", slots[i], "skill"); markDirty();
      } else if (!hasWeak && pCard.hunterAuraActive) {
        pCard.hunterAuraActive = false;
        pCard._displayATK = pCard.atk;
        pCard.atk = Math.max(pCard.baseATK, Number(pCard.atk) - (pCard.hunterAuraBonus || 0));
        pCard.hunterAuraBonus = 0; markDirty();
      }
    }

    // 💀 Devour the Weak — entry skill: ยิงครั้งเดียวตอนเพิ่งลงสนาม
    if (hasSkill(pCard, "Devour the Weak") && !pCard.tyrantEntryDone) {
      pCard.tyrantEntryDone = true;
      const oBoard2 = getMyBoard(!isPlayer);
      const oSlots2 = isPlayer ? enemyBoardSlots : playerBoardSlots;
      let minAtk = Infinity, minIdx = -1;
      oBoard2.forEach((c, idx) => { if (c && c.hp > 0 && c.atk < minAtk) { minAtk = c.atk; minIdx = idx; } });
      if (minIdx !== -1) {
        const victim = oBoard2[minIdx];
        const atkGain = Math.floor(victim.atk * 2.0);
        const hpGain  = Math.floor(victim.maxHP * 2.0);
        addLog(`💀 ${pN} <span class="log-skill">Devour the Weak</span> → ${victim.name} (ATK ${victim.atk})`);
        // visual: reuse tyrant-overlay + devour-title
        battlefieldEl?.classList.add('anim-tyrant-shake');
        sd(() => battlefieldEl?.classList.remove('anim-tyrant-shake'), 900);
        const ov2 = document.createElement('div'); ov2.className = 'tyrant-overlay'; document.body.appendChild(ov2);
        const dt  = document.createElement('div'); dt.className  = 'devour-title'; document.body.appendChild(dt);
        dt.innerHTML = `<span class="title-main">💀 DEVOURED</span><span class="title-sub">${victim.name} — Consumed</span><div class="title-skulls">💀⚔️💀</div>`;
        sd(() => ov2.remove(), 2100); sd(() => dt.remove(), 2300);
        await sleep(500);
        // kill victim
        victim.hp = 0;
        await checkDeaths(); markDirty(); flushBoard(); await sleep(300);
        // buff Tyrant
        pCard._displayATK = pCard.atk; pCard._displayHP = pCard.hp;
        pCard.atk = Number(pCard.atk) + atkGain;
        pCard.maxHP += hpGain; pCard.hp = Math.min(pCard.maxHP, pCard.hp + hpGain);
        // buff aura visual
        const au = document.createElement('div'); au.className = 'buff-aura'; slots[i].appendChild(au);
        sd(() => au.remove(), 700);
        showFloat(`💀 ATK+${atkGain}/HP+${hpGain}`, slots[i], "skill");
        addLog(`💀 ${pN} กลืนพลัง: ATK+${atkGain} HP+${hpGain}`);
        markDirty(); flushBoard(); await sleep(600);
        // สกิล 4: โจมตีทันที 1 ครั้ง
        myBoard = getMyBoard(isPlayer); pCard = myBoard[i];
        if (pCard && pCard.hp > 0) {
          showFloat("⚡ INSTANT ATTACK!", slots[i], "skill");
          await executeAttack(pCard, getMyBoard(!isPlayer)[i], i, isPlayer);
          await checkDeaths(); markDirty(); flushBoard(); await sleep(300);
        }
        myBoard = getMyBoard(isPlayer); pCard = myBoard[i];
        if (!pCard || pCard.hp <= 0) continue;
      }
    }

    let usedSkill = false;

    if (hasSkill(pCard, "Temporal Acceleration")) {
      addLog(`⏳ ${pN} <span class="log-skill">Temporal Acceleration</span>`);
      showFloat("⏳ TIME ACCEL!", slots[i], "skill"); await sleep(400);

      // ── ✨ TIME ACCEL visual: gold sweep + clock particles ──
      (() => {
        const sweep = document.createElement('div'); sweep.className = 'time-accel-sweep'; document.body.appendChild(sweep);
        sd(() => sweep.remove(), 950);
        const clocks = ['⏳','⌛','🕐','⏱️'];
        for (let ci = 0; ci < 6; ci++) {
          const slotRect = getEffectRect(slots[i]);
          const p = document.createElement('div'); p.className = 'time-clock-particle';
          p.textContent = clocks[ci % clocks.length];
          const ox = (Math.random() - 0.5) * 160;
          const oy = -(60 + Math.random() * 80);
          p.style.cssText = `left:${slotRect.left + slotRect.width/2 + (Math.random()-0.5)*60}px;top:${slotRect.top}px;--clk-x:${ox}px;--clk-y:${oy}px;--clk-dur:${1.1 + Math.random()*0.4}s;--clk-delay:${ci * 0.08}s;`;
          document.body.appendChild(p);
          setTimeout(() => p.remove(), 1800);
        }
      })();
      // ──────────────────────────────────────────────────────

      let th = isPlayer ? hand : enemyHand, tz = isPlayer ? handZone : enemyHandZone;
      th.forEach(c => c.waitTime = Math.max(0, c.waitTime - 1));
      if (tz) { tz.classList.add('anim-hand-twinkle'); showFloat("CD -1", slots[i], "heal");
      if (isPlayer) renderHand(); else renderEnemyHand(); await sleep(800); tz.classList.remove('anim-hand-twinkle'); }
      
      let has6 = myBoard.some(c => c && c.baseWait >= 6);
      for (let ai = 0; ai < myBoard.length; ai++) {
        let ally = myBoard[ai];
        if (!ally) continue;
        let au = document.createElement('div'); au.className = 'buff-aura'; slots[ai].appendChild(au);
        let hb = Math.floor(ally.maxHP * 0.3), ab = Math.floor(ally.baseATK * 0.3);
        ally._displayHP = ally.hp; ally._displayATK = ally.atk; // snapshot ครั้งเดียวก่อน mutate ทั้งหมด
        ally.maxHP += hb; ally.hp += hb; ally.atk = Number(ally.atk) + ab; // ❌ ไม่แตะ baseATK — ไว้เป็น reference สีเปรียบเทียบ
        if (ally.isSummoned || ally.isClone) ally.critChance = (ally.critChance || 0) + 35;
        showFloat(`ATK+${ab}/HP+${hb}`, slots[ai], "skill"); markDirty(); 
        if (has6) { let h = Math.floor(ally.maxHP * 0.1); ally.hp += h; if (combatStats[pCard?.uid]) combatStats[pCard?.uid].heal += h; showFloat(`+${h}HP`, slots[ai], "heal"); markDirty(); } // ❌ ไม่แตะ _displayHP อีก
        await sleep(200); 
        sd(() => au.remove(), 300);
      }
      // ❌ ลบ flushBoard() ออกจากตรงนี้ — ให้ if(usedSkill) ข้างล่าง flush แทน
      // เพราะถ้า flush ตรงนี้ก่อน _displayHP จะถูก reset → outer flush ไม่มีอะไรเปลี่ยน → เลขไม่ไหล
      usedSkill = true;
    }

    if (hasSkill(pCard, "ฟื้นฟู")) { pCard.hp = Math.min(pCard.maxHP, pCard.hp + 100);
      if (combatStats[pCard?.uid]) combatStats[pCard?.uid].heal += 100; showFloat("+100", slots[i], "heal");
      usedSkill = true; }

    if (hasSkill(pCard, "Grave Domain")) {
      if ((pCard.domainTurns || 0) <= 0 && !pCard.domainUsed) { pCard.domainTurns = 3; pCard.domainUsed = true; showFloat("GRAVE DOMAIN", slots[i], "skill"); usedSkill = true; }
      else if ((pCard.domainTurns || 0) > 0) { pCard.domainTurns--; myBoard.forEach((a, ai) => { if (a) { let h = Math.floor(a.maxHP * 0.08); a.hp += h; if (combatStats[pCard?.uid]) combatStats[pCard?.uid].heal += h; showFloat(`+${h}`, slots[ai], "heal"); } }); usedSkill = true; }
    }

    if (hasSkill(pCard, "Soul Rip")) {
      let ve = getMyBoard(!isPlayer).filter(Boolean), es = myBoard.reduce((a, c, ii) => !c ? [...a, ii] : a, []);
      if (ve.length && es.length) {
        let tgt = ve[Math.floor(Math.random() * ve.length)];
        let cln = { uid: ++cardUidCounter, owner: isPlayer ? 'พีช' : 'บอส', name: "Shadow of " + tgt.name.replace(/Shadow of /g, ""),
          hp: Math.floor((tgt.maxHP || tgt.hp) * 0.5), maxHP: Math.floor((tgt.maxHP || tgt.hp) * 0.5), baseHP: Math.floor((tgt.maxHP || tgt.hp) * 0.5),
          atk: Math.floor((tgt.baseATK || tgt.atk) * 1.5), baseATK: Math.floor((tgt.baseATK || tgt.atk) * 1.5),
          stars: 0, image: tgt.image, skills: [{ name: "💥 Soul Nova", desc: "โคลนระเบิดเป้าเดี่ยว" }],
          parentATK: pCard.atk, isClone: true, waitTime: 0, baseWait: 0, isSummoned: true,
          _initialized: true, // set ก่อน getCombatStateDefaults ป้องกัน double-init
        };
        // FIX: ใช้ getCombatStateDefaults แทน hardcode — single source of truth
        Object.assign(cln, getCombatStateDefaults(cln), { burnTurns: 0, corruptTurns: 0 });
        myBoard[es[0]] = cln; initCard(cln); showFloat("Summon!", slots[es[0]], "skill"); addLog(`💀 ${pN} Soul Rip → ${cln.name}`); usedSkill = true;
      }
    }

    if (hasSkill(pCard, "Void Breath") && pCard.hp > 0) {
      const vbDmg = Math.floor(pCard.atk * 1.4);
      const oppBoard = getMyBoard(!isPlayer);
      const oppSlots = isPlayer ? enemyBoardSlots : playerBoardSlots;
      const hasTargets = oppBoard.some(Boolean);
      if (hasTargets) {
        addLog(`🌌 ${pN} <span class="log-skill">Void Breath!</span> <span class="log-dmg">AOE ${vbDmg} + Corrupt</span>`);

        // ── ✨ VOID BREATH visual ──
        (() => {
          battlefieldEl?.classList.add('anim-screen-shake'); sd(() => battlefieldEl?.classList.remove('anim-screen-shake'), 700);
          const ov = document.createElement('div'); ov.className = 'void-overlay'; document.body.appendChild(ov);
          sd(() => ov.remove(), 2100);
          const ttl = document.createElement('div'); ttl.className = 'void-breath-title';
          ttl.innerHTML = `<span class="vt-main">🌌 VOID BREATH</span><span class="vt-sub">— Corrupt —</span>`;
          document.body.appendChild(ttl); sd(() => ttl.remove(), 2300);
          const sRect = getEffectRect(slots[i]);
          const cx = sRect.left + sRect.width / 2, cy = sRect.top + sRect.height / 2;
          [0, 0.18, 0.36].forEach((d, idx) => {
            const sw = document.createElement('div'); sw.className = 'void-shockwave';
            sw.style.cssText = `left:${cx}px;top:${cy}px;--vs-delay:${d}s;--vs-dur:${1.1 + idx*0.1}s;`;
            document.body.appendChild(sw); setTimeout(() => sw.remove(), (1.6 + d) * 1000);
          });
        })();
        // ──────────────────────────

        await sleep(400);
        for (let ai = 0; ai < oppBoard.length; ai++) {
          if (!oppBoard[ai]) continue;
          const fl = document.createElement('div'); fl.className = 'void-hit-flash';
          oppSlots[ai].style.position = 'relative'; oppSlots[ai].appendChild(fl);
          const st = document.createElement('div'); st.className = 'corrupt-stain';
          oppSlots[ai].appendChild(st);
          applyDamage(oppBoard[ai], vbDmg, oppSlots[ai], !isPlayer, "void_breath", pCard);
          oppBoard[ai].corruptTurns = (oppBoard[ai].corruptTurns || 0) + 2;
          showFloat("🌌 CORRUPT", oppSlots[ai], "skill", ai * 80);
          sd(() => fl?.remove(), 900); setTimeout(() => st?.remove(), 3000);
          await sleep(80);
        }
        markDirty(); flushBoard(); updateHeroHP(); await sleep(500);
        await checkDeaths(); myBoard = getMyBoard(isPlayer); pCard = myBoard[i];
        if (!pCard || pCard.hp <= 0) continue;
        usedSkill = true;
      }
    }

    if (hasSkill(pCard, "Airstrike Omega") && !isInStealth) {
      pCard.airstrikeCharge = (pCard.airstrikeCharge || 0) + 1;
      showFloat(`🚀 ${pCard.airstrikeCharge}/3`, slots[i], "skill"); markDirty(); flushBoard();
      if (pCard.airstrikeCharge >= 3) {
        pCard.airstrikeCharge = 0;
        let aoeDmg = Math.floor(pCard.atk * 1.6);
        let tb = getMyBoard(!isPlayer), ts2 = isPlayer ? enemyBoardSlots : playerBoardSlots;
        let fl = document.createElement('div'); fl.className = 'airstrike-flash'; document.body.appendChild(fl); sd(() => fl.remove(), 1500);
        battlefieldEl?.classList.add('anim-screen-shake'); sd(() => battlefieldEl?.classList.remove('anim-screen-shake'), 700);
        let ttl = document.createElement('div'); ttl.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:99995;pointer-events:none;text-align:center;animation:bloodTitleAnim 2s ease-out forwards";
        ttl.innerHTML = `<span style="display:block;font-size:3.5rem;font-weight:900;font-family:Georgia,serif;color:#fff;text-shadow:0 0 20px #ff6600,0 0 50px #ff3300,4px 4px 0 #661100;-webkit-text-stroke:2px #ff4400">🚀 AIRSTRIKE OMEGA</span>`;
        document.body.appendChild(ttl); sd(() => ttl.remove(), 2000);
        addLog(`🚀 ${pN} <span class="log-skill">Airstrike Omega!</span> <span class="log-dmg">${aoeDmg} AOE ทะลุเกราะ + Burn</span>`);
        await sleep(400);
        // ✅ FIX AOE Stagger: เรียกใช้ delay จาก index
        for (let ai = 0; ai < tb.length; ai++) { if (!tb[ai]) continue; applyDamage(tb[ai], aoeDmg, ts2[ai], !isPlayer, "airstrike", pCard);
          tb[ai].burnTurns = (tb[ai].burnTurns || 0) + 2; showFloat("🔥 BURN", ts2[ai], "skill", ai * 80); await sleep(100); }
        markDirty(); flushBoard(); updateHeroHP(); await sleep(500);
        await checkDeaths(); myBoard = getMyBoard(isPlayer); pCard = myBoard[i];
        if (!pCard || pCard.hp <= 0) continue;
        usedSkill = true;
      }
    }

    if (usedSkill) { markDirty(); flushBoard(); updateHeroHP(); await sleep(500); await checkDeaths(); myBoard = getMyBoard(isPlayer); pCard = myBoard[i]; }
    if (!isInStealth && pCard && pCard.hp > 0) { await executeAttack(pCard, getMyBoard(!isPlayer)[i], i, isPlayer); await checkDeaths(); markDirty(); flushBoard(); await sleep(300); }
  }
  if (!isGameOver) await shiftBoards();
}


// ── 15. INIT ───────────────────────────────────────────────
async function initGame() {
  cleanupAllEffects();
  playerDeck = buildDeck(true); enemyDeck = buildDeck(false); updateHeroHP();
  for (let i = 0; i < 3; i++) {
    if (playerDeck.length) hand.push(cloneCard(playerDeck.splice(0, 1)[0]));
    if (enemyDeck.length)  enemyHand.push(cloneCard(enemyDeck.splice(0, 1)[0]));
  }
  renderHand(); renderEnemyHand(); markDirty(); flushBoard(); updateDeckCount();
  addLog("⚔️ เริ่มการต่อสู้!");
  if (endTurnBtn) endTurnBtn.disabled = true;
  await startOfBattlePhase();
  if (endTurnBtn) endTurnBtn.disabled = false;
}

// ── Fix Bug #1+#2: กำหนด DOM refs ทั้งหมดหลัง DOM โหลดครบ ──────────────────
document.addEventListener('DOMContentLoaded', () => {

  // ── Speed buttons ──
  const btnX05 = $('speed-x05'), btnX1 = $('speed-x1'), btnX2 = $('speed-x2');
  const setSpeed = (s) => {
    gameSpeed = s;
    document.documentElement.style.setProperty('--speed', s);
    [btnX05, btnX1, btnX2].forEach(b => { if(b) { b.style.background='#444'; b.style.borderColor='#777'; }});
    const active = s === 0.5 ? btnX05 : s === 1 ? btnX1 : btnX2;
    if (active) { active.style.background='#007bff'; active.style.borderColor='#fff'; }
  };
  if (btnX05) btnX05.onclick = () => setSpeed(0.5);
  if (btnX1)  btnX1.onclick  = () => setSpeed(1);
  if (btnX2)  btnX2.onclick  = () => setSpeed(2);
  setSpeed(2); // default x2

  // ── DOM element refs ──
  handZone        = $('player-hand');
  enemyHandZone   = $('enemy-hand');
  playerBoardSlots = document.querySelectorAll('.player-board .card-slot');
  enemyBoardSlots  = document.querySelectorAll('.enemy-board .card-slot');
  playerHeroText   = document.querySelector('.player-hero p');
  enemyHeroText    = document.querySelector('.enemy-hero p');
  playerHeroEl     = document.querySelector('.player-hero');
  enemyHeroEl      = document.querySelector('.enemy-hero');
  endTurnBtn       = $('end-turn-btn');
  logContent       = $('battle-log-content');
  logToggle        = $('battle-log-toggle');
  logContainer     = $('battle-log-container');
  battlefieldEl    = document.querySelector('.battlefield');

  // ── Log panel events ──
  if (logToggle) logToggle.onclick = () => logContainer.style.display = logContainer.style.display === 'none' ? 'flex' : 'none';
  const logClose = $('close-log-btn');
  if (logClose) logClose.onclick = () => logContainer.style.display = 'none';
  const logCopy  = $('copy-log-btn');
  if (logCopy)  logCopy.onclick  = () => navigator.clipboard.writeText(logContent.innerText).then(() => { let o = logCopy.innerText; logCopy.innerText = "✅ Copied!"; setTimeout(() => logCopy.innerText = o, 2000); });

  // ── Stats panel (inject into DOM) ──
  statsBtn = document.createElement('button'); statsBtn.className = 'stats-toggle-btn'; statsBtn.innerText = '📊 สถิติ'; document.body.appendChild(statsBtn);
  statsContainer = document.createElement('div');
  statsContainer.className = 'stats-container';
  statsContainer.innerHTML = `<div class="stats-header"><span>🏆 สรุปผลงานบอร์ด</span><button id="close-stats-btn" class="log-btn">❌</button></div><div id="stats-content" class="stats-content"></div>`;
  document.body.appendChild(statsContainer);
  statsBtn.onclick = () => { statsContainer.style.display = statsContainer.style.display === 'none' ? 'flex' : 'none'; if (statsContainer.style.display === 'flex') renderStatsUI(); };
  document.getElementById('close-stats-btn').onclick = () => statsContainer.style.display = 'none';

  // ── Modals ──
  detailModal    = $('card-detail-modal');
  detailClose    = $('close-detail-modal');
  detailPlayBtn  = $('detail-play-btn');
  if (detailClose) detailClose.onclick = () => detailModal.style.display = 'none';

  graveBtn   = $('graveyard-btn');
  graveModal = $('grave-modal');
  closeModal = $('close-modal');
  graveList  = $('grave-list');
  if (graveBtn) graveBtn.onclick = () => { graveModal.style.display = 'flex'; graveList.innerHTML = '';
    playerGraveyard.forEach((c, i) => { let el = document.createElement('div'); el.className = 'card dead-card'; el.innerHTML = createCardHTML(c, 'grave'); el.onclick = () => openDetail(c, 'graveyard', i); graveList.appendChild(el); });
  };
  if (closeModal) closeModal.onclick = () => graveModal.style.display = 'none';

  // Fix Bug #8: ปิด Modal ด้วยปุ่ม ESC ──────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (detailModal)    detailModal.style.display    = 'none';
    if (graveModal)     graveModal.style.display     = 'none';
    if (statsContainer) statsContainer.style.display  = 'none';
    if (logContainer)   logContainer.style.display    = 'none';
  });
  // ──────────────────────────────────────────────────────────────────────────

  if (endTurnBtn) endTurnBtn.onclick = endTurn;

  // ── Start RAF loop ──
  requestAnimationFrame(updateFloats);

  // ── Boot game ──
  initGame();
  });