// ── 10. VISUAL EFFECTS (Optimized) ────────────────────────
async function triggerBloodNovaEffect(cSlot, tSlots, tBoard, dmg, isPlayer, cCard) {
  battlefieldEl?.classList.add('anim-screen-shake'); sd(() => battlefieldEl?.classList.remove('anim-screen-shake'), 700);
  const ov = document.createElement('div'); ov.className = 'battle-vfx blood-nova-overlay'; document.body.appendChild(ov);
  const tt = document.createElement('div'); tt.className = 'battle-vfx blood-nova-title';
  tt.innerHTML = `<span class="title-main">💀 BLOOD NOVA</span><span class="title-sub">— CRIMSON FRENZY —</span>`; document.body.appendChild(tt);
  const cr = getEffectRect(cSlot), cx = cr.left + cr.width / 2, cy = cr.top + cr.height / 2;
  for (let w = 0; w < 3; w++) { let wv = document.createElement('div'); wv.className = 'battle-vfx blood-shockwave'; wv.style.cssText = `left:${cx}px;top:${cy}px;animation-delay:${w * 0.15}s`; document.body.appendChild(wv); setTimeout(() => wv.remove(), 1400); }
  
  await sleep(500);
  
  // ✅ FIX AOE Stagger: เรียกใช้ delay จาก index
  for (let i = 0; i < tBoard.length; i++) {
    if (!tBoard[i]) continue; 
    let s = tSlots[i];
    let fl = document.createElement('div'); fl.className = 'battle-vfx blood-hit-flash'; s.style.position = 'relative'; s.appendChild(fl);
    let st = document.createElement('div'); st.className = 'battle-vfx blood-stain'; s.appendChild(st);
    applyDamage(tBoard[i], dmg, s, !isPlayer, "blood_nova", cCard); 
    showFloat(`💀 ${dmg}`, s, "dmg", i * 80); // <--- หน่วงเวลา 80ms ต่อใบ
    sd(() => fl?.remove(), 800); setTimeout(() => st?.remove(), 3000);
  }
  
  await sleep(300);
  sd(() => ov?.remove(), 400); sd(() => tt?.remove(), 500); await sleep(200);
}

async function triggerTyrantEffect(cSlot, tSlots, tBoard, dmg, isPlayer, cCard) {
  battlefieldEl?.classList.add('anim-tyrant-shake'); sd(() => battlefieldEl?.classList.remove('anim-tyrant-shake'), 900);
  const ov = document.createElement('div'); ov.className = 'battle-vfx tyrant-overlay'; document.body.appendChild(ov);
  const tt = document.createElement('div'); tt.className = 'battle-vfx tyrant-title';
  tt.innerHTML = `<span class="title-main">IMMORTAL TYRANT</span><span class="title-sub">— Soul Dominion —</span><div class="title-souls">💀💀💀💀</div>`; document.body.appendChild(tt);
  
  await sleep(500);
  
  // ✅ FIX AOE Stagger: เรียกใช้ delay จาก index
  for (let i = 0; i < tBoard.length; i++) {
    if (!tBoard[i]) continue; 
    let s = tSlots[i];
    let fl = document.createElement('div'); fl.className = 'battle-vfx tyrant-hit-flash'; s.style.position = 'relative'; s.appendChild(fl);
    applyDamage(tBoard[i], dmg, s, !isPlayer, "tyrant", cCard);
    showFloat(`👑 ${dmg}`, s, "skill", i * 80); // <--- หน่วงเวลา 80ms ต่อใบ
    sd(() => fl?.remove(), 1000);
  }
  
  await sleep(300);
  sd(() => ov?.remove(), 300); sd(() => tt?.remove(), 500); await sleep(200);
}

// ── 11. COMBAT CORE ────────────────────────────────────────
function applyDamage(target, dmg, targetEl, isTargetPlayer, sourceType = "normal", attackerCard = null) {
  if (!target || isNaN(dmg)) return 0;
  let tN = `<span class="${isTargetPlayer ? 'log-player' : 'log-enemy'}">${target.name}</span>`;

  // ✅ เช็กโล่กันกายภาพ 1 ฮิต (ป้องกันเฉพาะดาเมจธรรมดา)
  if (target.physShield && sourceType === "normal") {
    target.physShield = false;
    showFloat("BLOCKED!", targetEl, "skill");
    addLog(`🛡️ ${tN} ใช้โล่ Physical Shield ป้องกันดาเมจกายภาพ!`);
    markDirty(); flushBoard();
    return 0; // ดาเมจกลายเป็น 0
  }

  if (target.immortalTurns > 0 && target.hp - dmg <= 0) { dmg = Math.max(0, target.hp - 1);
    if (target.hp <= 1) { showFloat("IMMORTAL!", targetEl, "skill"); return 0; } }

  // 🌌 Corrupt: รับดาเมจเพิ่ม 20%
  if ((target.corruptTurns || 0) > 0 && dmg > 0) {
    dmg = Math.floor(dmg * 1.2);
    showFloat("🌌 CORRUPT +20%", targetEl, "skill");
  }

  for (let [key, fn] of Object.entries(ARMOR_TABLE)) {
    if (hasSkill(target, key)) {
      let newDmg = fn(dmg, sourceType);
      if (newDmg < dmg) { showFloat(key === "Crimson Frenzy" ? "BLOOD ARMOR" : "🛡️ SHIELD", targetEl, "skill"); dmg = newDmg; break; }
    }
  }

  let effective = Math.min(dmg, target.hp);
  target.hp -= dmg;
  if (attackerCard && combatStats[attackerCard?.uid]) combatStats[attackerCard?.uid].dmg += dmg;
  if (combatStats[target?.uid]) combatStats[target?.uid].taken += dmg;
  if (dmg > 0 && !["tyrant", "blood_nova"].includes(sourceType)) showFloat(`-${dmg}`, targetEl, "dmg");

  const skipSources = ["tyrant", "blood_nova", "reflect", "echoes", "soul_nova", "counterstrike"];
  if (hasSkill(target, "Immortal Tyrant") && effective > 0 && !skipSources.includes(sourceType)) {
    target.hpLostAccum = (target.hpLostAccum || 0) + effective;
    while (target.hpLostAccum >= target.maxHP * 0.25) {
      target.fragments = (target.fragments || 0) + 1;
      target.hpLostAccum -= target.maxHP * 0.25;
      showFloat(`Fragment ${target.fragments}/4`, targetEl, "skill"); addLog(`🔮 ${tN} Soul Fragment (${target.fragments}/4)`);
      if (target.fragments >= 4) {
        target.fragments = 0; target.hpLostAccum = 0;
        let heal = Math.floor(target.maxHP * 0.5); target._displayHP = target.hp; target.hp += heal; target.immortalTurns = (target.immortalTurns || 0) + 1;
        if (combatStats[target?.uid]) combatStats[target?.uid].heal += heal;
        showFloat("TYRANT AWOKEN!", targetEl, "skill"); showFloat(`+${heal}`, targetEl, "heal");
        let eb = isTargetPlayer ? enemyBoard : playerBoard, es = isTargetPlayer ? enemyBoardSlots : playerBoardSlots;
        let cs = isTargetPlayer ? playerBoardSlots[playerBoard.indexOf(target)] : enemyBoardSlots[enemyBoard.indexOf(target)];
        addLog(`👑 ${tN} <span class="log-skill">Immortal Tyrant!</span>`);
        triggerTyrantEffect(cs || targetEl, es, eb, target.atk * 2, isTargetPlayer, target);
        break;
      }
    }
  }

  if (hasSkill(target, "Iron Sentinel") && dmg > 0 && ["normal", "splash", "domain", "burn"].includes(sourceType)) {
    target.sentinelStacks = Math.min(10, (target.sentinelStacks || 0) + 1);
    target.atk = (target.baseATK || target.atk) + target.sentinelStacks * 35;
    addLog(`🛡️ ${tN} Battle Hardened (${target.sentinelStacks}/10) ATK→${target.atk}`);
    showFloat(`⚔️+35(${target.sentinelStacks})`, targetEl, "skill");
  }

  return dmg;
}

// ── ✨ SHATTER EFFECT ──────────────────────────────────────
function shatterCard(slotEl) {
  if (!slotEl) return;
  const rect = slotEl.getBoundingClientRect();
  const cardEl = slotEl.querySelector('.card');
  const imgUrl = cardEl
    ? (cardEl.querySelector('.card-image-bg')?.style.backgroundImage || 'none')
    : 'none';

  // 7 เศษแตกกระเด็นคนละทิศ
  const shards = [
    { clip: "polygon(0% 0%, 48% 0%, 32% 42%, 0% 28%)",       ox: -65, oy: -85, rot: -38 },
    { clip: "polygon(48% 0%, 100% 0%, 100% 22%, 62% 36%)",    ox:  75, oy: -72, rot:  30 },
    { clip: "polygon(0% 28%, 32% 42%, 18% 68%, 0% 58%)",      ox: -82, oy:  18, rot: -52 },
    { clip: "polygon(32% 42%, 62% 36%, 58% 74%, 18% 68%)",    ox: -18, oy:  95, rot:  14 },
    { clip: "polygon(62% 36%, 100% 22%, 100% 68%, 58% 74%)",  ox:  78, oy:  52, rot:  42 },
    { clip: "polygon(18% 68%, 58% 74%, 46% 100%, 0% 100%)",   ox: -58, oy: 112, rot: -26 },
    { clip: "polygon(58% 74%, 100% 68%, 100% 100%, 46% 100%)",ox:  62, oy: 105, rot:  32 },
  ];

  shards.forEach((s, idx) => {
    const shard = document.createElement('div');
    shard.className = 'battle-vfx card-shard';
    shard.style.cssText = `
      width:${rect.width}px; height:${rect.height}px;
      left:${rect.left}px; top:${rect.top}px;
      background-image:${imgUrl};
      clip-path:${s.clip};
      --ex:${s.ox}px; --ey:${s.oy + 55}px; --er:${s.rot}deg;
      animation-delay:${idx * 0.028}s;
    `;
    document.body.appendChild(shard);
    setTimeout(() => shard.remove(), 900 + idx * 30);
  });

  // Flash ขาวตอนแตก
  const flash = document.createElement('div');
  flash.className = 'battle-vfx card-shatter-flash';
  flash.style.cssText = `left:${rect.left}px; top:${rect.top}px; width:${rect.width}px; height:${rect.height}px;`;
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 280);
}
// ──────────────────────────────────────────────────────────

async function checkDeaths() {
  let changed = false, loop = true;
  while (loop) {
    loop = false;
    [playerBoard, enemyBoard].forEach((board, bIdx) => {
      let slots = bIdx === 0 ? playerBoardSlots : enemyBoardSlots;
      let grave  = bIdx === 0 ? playerGraveyard  : enemyGraveyard;
      for (let i = 0; i < BOARD_SIZE; i++) {
        let c = board[i]; if (!c || c.hp > 0 || c.isDying) continue;
        c.isDying = true;
        for (let [key, fn] of Object.entries(DEATH_TABLE)) {
          if (hasSkill(c, key)) {
            let blocked = fn(c, board, grave, slots, i, bIdx);
            if (blocked) { c.isDying = false; break; }
          }
        }
      }
    });
    for (let i = 0; i < BOARD_SIZE; i++) {
      for (const [board, grave, oBoard, oSlots, isP] of [[enemyBoard, enemyGraveyard, playerBoard, playerBoardSlots, false], [playerBoard, playerGraveyard, enemyBoard, enemyBoardSlots, true]]) {
        if (board[i] && board[i].hp <= 0) {
          if (board[i].isClone) {
            let xd = Math.floor(board[i].parentATK * 0.5), ti = -1, mh = -1;
            oBoard.forEach((e, idx) => { if (e && e.hp > mh) { mh = e.hp; ti = idx; } });
            if (ti !== -1) { addLog(`💥 โคลนระเบิดใส่ ${oBoard[ti].name}`); applyDamage(oBoard[ti], xd, oSlots[ti], isP, "soul_nova", board[i]); }
          }
          addLog(`💀 <span class="${isP ? 'log-enemy' : 'log-player'}">${board[i].name}</span> ตาย`);

          // 🕳 Abyss Devour: ทุก Void Dragon ฝ่ายเดียวกันดูดวิญญาณ
          const devourBoard = isP ? enemyBoard : playerBoard;
          const devourSlots = isP ? enemyBoardSlots : playerBoardSlots;
          // FIX: ผูก deadSlots กับ board โดยตรง ไม่ใช้ isP (ชัดกว่า ไม่พลาดเวลาสองฝั่งตายพร้อมกัน)
          const deadSlots  = board === playerBoard ? playerBoardSlots : enemyBoardSlots;
          const deadSRect  = getEffectRect(deadSlots?.[i]);
          devourBoard.forEach((ally, ai) => {
            if (!ally || ally === board[i] || ally.hp <= 0) return;
            if (!hasSkill(ally, "Abyss Devour")) return;
            if ((ally.devourStacks || 0) >= 8) return;
            ally.devourStacks = (ally.devourStacks || 0) + 1;
            const healAmt = Math.floor(ally.maxHP * 0.1);
            ally._displayHP = ally.hp; ally._displayATK = ally.atk; // snapshot
            ally.hp = Math.min(ally.maxHP, ally.hp + healAmt);
            // FIX: set baseATK ก่อน แล้วค่อย buff atk
            ally.baseATK = ally.baseATK || ally.atk;
            ally.atk = Number(ally.atk) + 40;
            if (combatStats[ally?.uid]) combatStats[ally?.uid].heal += healAmt;
            // visual: soul orb เคลื่อนจาก slot ที่ตาย → Void Dragon
            const dRect = getEffectRect(devourSlots[ai]);
            if (deadSRect) {
              const orb = document.createElement('div'); orb.className = 'battle-vfx devour-orb';
              const sz = 14;
              const tx = dRect.left + dRect.width/2 - (deadSRect.left + deadSRect.width/2);
              const ty = dRect.top  + dRect.height/2 - (deadSRect.top  + deadSRect.height/2);
              orb.style.cssText = `width:${sz}px;height:${sz}px;left:${deadSRect.left + deadSRect.width/2 - sz/2}px;top:${deadSRect.top + deadSRect.height/2 - sz/2}px;--do-tx:${tx}px;--do-ty:${ty}px;--do-delay:0s;--do-dur:0.75s;`;
              document.body.appendChild(orb);
              setTimeout(() => orb.remove(), 900);
            }
            showFloat(`🕳 +${healAmt}HP / ATK+40`, devourSlots[ai], "heal");
            addLog(`🕳 ${ally.name} <span class="log-skill">Abyss Devour</span> (${ally.devourStacks}/8) ฮีล +${healAmt} ATK→${ally.atk}`);
          });

          // ⚡ Power from the Fallen: Tyrant ฝ่ายตรงข้ามของผู้ตาย gain ATK+20% + heal 15% maxHP
          oBoard.forEach((killer, ki) => {
            if (!killer || killer.hp <= 0 || !hasSkill(killer, "Power from the Fallen")) return;
            killer._displayATK = killer.atk; killer._displayHP = killer.hp;
            const atkBonus = Math.floor(Number(killer.atk) * 0.2);
            const healAmt  = Math.floor(killer.maxHP * 0.15);
            killer.atk = Number(killer.atk) + atkBonus;
            killer.hp  = Math.min(killer.maxHP, killer.hp + healAmt);
            if (combatStats[killer?.uid]) combatStats[killer?.uid].heal += healAmt;
            showFloat(`⚡ ATK+${atkBonus}/+${healAmt}HP`, oSlots[ki], "skill");
            addLog(`⚡ ${killer.name} <span class="log-skill">Power from the Fallen</span>: ATK→${killer.atk}`);
          });

          shatterCard(deadSlots[i]); // 💥 เศษแตกกระเด็น
          await sleep(200);          // รอ shatter animation ก่อน remove การ์ด
          grave.push(board[i]); board[i] = null; changed = true; loop = true;
        }
      } // end for...of
    }
  }
  if (changed) { updateHeroHP(); updateGrave(); markDirty(); flushBoard(); }
}

async function shiftBoards() {
  let np = [...playerBoard.filter(Boolean), ...Array(BOARD_SIZE).fill(null)].slice(0, BOARD_SIZE);
  let ne = [...enemyBoard.filter(Boolean),  ...Array(BOARD_SIZE).fill(null)].slice(0, BOARD_SIZE);
  if (playerBoard.some((c, i) => c !== np[i]) || enemyBoard.some((c, i) => c !== ne[i])) {
    playerBoard = np; enemyBoard = ne; addLog(`➡️ <span style="color:#aaa">กระดานเลื่อน...</span>`); markDirty(); flushBoard(); await sleep(250);
  }
}

// ── 12. EXECUTE ATTACK (LOA CLASSIC STYLE) ─────────────────
// animation = 350ms → impact point = 50% = 175ms พอดี
const LOA_IMPACT_MS = 175; // impact จังหวะพุ่งถึง target
const LOA_RECOIL_MS = 175; // รอดีดกลับ (ครึ่งหลังของ 350ms)

async function executeAttack(attacker, defender, idx, isPlayer) {
  if (!attacker || isGameOver) return;
  // FIX: ใช้ cached element แทน querySelector
  const tHero   = isPlayer ? enemyHeroEl : playerHeroEl;
  const tSlots  = isPlayer ? enemyBoardSlots : playerBoardSlots;
  const aSlots  = isPlayer ? playerBoardSlots : enemyBoardSlots;
  // FIX: ใช้ animation ใหม่แบบ LOA (Leap + Recoil)
  const anim    = isPlayer ? 'anim-loa-attack-up' : 'anim-loa-attack-down';
  const aName   = `<span class="${isPlayer ? 'log-player' : 'log-enemy'}">${attacker.name}</span>`;

  // ── ✨ spawnImpactClaw helper — 3 slash lines + hit shake ──
  const spawnImpactClaw = (targetEl) => {
    if (!targetEl) return; // null-guard (สำคัญ: หลายจุดส่ง tHero/tSlots ที่อาจ null มา)
    targetEl.style.position = 'relative';
    const cx = targetEl.offsetWidth  / 2;
    const cy = targetEl.offsetHeight / 2;
    for (let i = 0; i < 3; i++) {
      const slash = document.createElement('div');
      slash.className = 'claw-slash';
      slash.style.left = (cx + (Math.random() - 0.5) * 50 - 40) + 'px'; // จากกึ่งกลาง ±25px
      slash.style.top  = (cy + (Math.random() - 0.5) * 30)       + 'px';
      targetEl.appendChild(slash);
      setTimeout(() => slash.remove(), 350);
    }
    targetEl.classList.add('hit-shake');
    sd(() => targetEl.classList.remove('hit-shake'), 200);
  };

  // ✅ สกิลก่อนโจมตี: Temporal Summon
  if (hasSkill(attacker, "Temporal Summon")) {
    let th = isPlayer ? hand : enemyHand;
    let tb = isPlayer ? playerBoard : enemyBoard;
    let ts = isPlayer ? playerBoardSlots : enemyBoardSlots;
    let em = tb.indexOf(null);
    if (em !== -1 && th.length > 0) {
      let maxW = -1, maxIdx = -1;
      th.forEach((c, i) => { if (c.waitTime > maxW) { maxW = c.waitTime; maxIdx = i; } });
      if (maxIdx !== -1) {
        let sc = th.splice(maxIdx, 1)[0];
        sc.isSummoned = true; sc.waitTime = 0;
        tb[em] = sc; initCard(tb[em]); tb[em].physShield = true;

        // ── ✨ TEMPORAL SUMMON visual ──
        (() => {
          const srcRect = getEffectRect(aSlots[idx]);
          const dstRect = getEffectRect(ts[em]);
          const sx = srcRect.left + srcRect.width / 2;
          const sy = srcRect.top  + srcRect.height / 2;
          const dx = dstRect.left + dstRect.width / 2;
          const dy = dstRect.top  + dstRect.height / 2;
          // Beam from caster to summoned slot
          const len = Math.hypot(dx - sx, dy - sy);
          const ang = Math.atan2(dy - sy, dx - sx) * 180 / Math.PI;
          const beam = document.createElement('div'); beam.className = 'battle-vfx temporal-beam';
          beam.style.cssText = `left:${sx}px;top:${sy}px;height:${len}px;transform:rotate(${ang - 90}deg);--tb-dur:0.65s;`;
          document.body.appendChild(beam);
          setTimeout(() => beam.remove(), 750);
          // Gear particles near summoned slot
          const gears = ['⚙️','⏳','🔵'];
          for (let g = 0; g < 4; g++) {
            const p = document.createElement('div'); p.className = 'battle-vfx temporal-gear';
            p.textContent = gears[g % gears.length];
            const ox = (Math.random() - 0.5) * 70;
            const oy = -(30 + Math.random() * 40);
            p.style.cssText = `left:${dx + (Math.random()-0.5)*30}px;top:${dy}px;--gx:${ox}px;--gy:${oy}px;--gear-delay:${g*0.07}s;--gear-dur:${1.0 + Math.random()*0.3}s;`;
            document.body.appendChild(p);
            setTimeout(() => p.remove(), 1500);
          }
          // Shield burst on summoned card
          const dstSlot = ts[em];
          dstSlot.style.position = 'relative';
          const shield = document.createElement('div'); shield.className = 'battle-vfx shield-burst';
          dstSlot.appendChild(shield);
          setTimeout(() => shield.remove(), 1300);
        })();
        // ──────────────────────────────

        showFloat("⏳ TEMPORAL SUMMON!", aSlots[idx], "skill");
        showFloat("🛡️ SHIELD", ts[em], "skill");
        addLog(`⏳ ${aName} <span class="log-skill">Temporal Summon</span> ดึง ${sc.name} ลงสนาม!`);
        if (isPlayer) renderHand(); else renderEnemyHand();
        markDirty(); flushBoard(); await sleep(600);
      }
    }
  }

  let attacks = (hasSkill(attacker, "ยิงแฝด") ? 2 : 1) +  (hasSkill(attacker, "Crimson Frenzy") && (attacker.bloodStacks || 0) >= 3 ? 1 : 0);
  
  if (hasSkill(attacker, "พ่นไฟ")) {
    let fb = document.createElement('div'); fb.className = `fireball anim-fireball-${isPlayer ? 'up' : 'down'}`; aSlots[idx].appendChild(fb); await sleep(400);
    if (defender && defender.hp > 0 && !(defender.shadowTurns || 0)) { applyDamage(defender, 100, tSlots[idx], !isPlayer, "skill", attacker); }
    else { if (isPlayer) enemyHP -= 100; else playerHP -= 100; showFloat("-100 🔥", tHero, "dmg"); if (combatStats[attacker?.uid]) combatStats[attacker?.uid].dmg += 100; }
    updateHeroHP(); fb.remove(); await sleep(400); if (defender?.hp <= 0) defender = null;
  }

  for (let a = 0; a < attacks; a++) {
    if (attacker.hp <= 0 || isGameOver) break;
    
    if (hasSkill(attacker, "Crimson Frenzy") && a === 1 && (attacker.bloodStacks || 0) >= 3) {
      attacker.bloodStacks = 0;
      let cardEl = aSlots[idx].querySelector('.card');
      if (cardEl) { cardEl.classList.remove(anim); void cardEl.offsetWidth; cardEl.classList.add(anim); }
      await sleep(LOA_IMPACT_MS); // รอให้พุ่งถึง impact point พอดี
      addLog(`🩸 ${aName} <span class="log-skill">💥 BLOOD NOVA!</span> <span class="log-dmg">${attacker.atk} AOE</span>`);
      await triggerBloodNovaEffect(aSlots[idx], isPlayer ? enemyBoardSlots : playerBoardSlots, isPlayer ? enemyBoard : playerBoard, attacker.atk, isPlayer, attacker);
      updateHeroHP(); await sleep(LOA_RECOIL_MS); cardEl?.classList.remove(anim); continue;
    }

    let curEnemy = getMyBoard(!isPlayer);
    let hasDomain = curEnemy.some(c => c && (c.domainTurns || 0) > 0);
    if (hasDomain) { applyDamage(attacker, Math.floor((attacker.maxHP || attacker.hp) * 0.05), aSlots[idx], isPlayer, "domain"); await sleep(200); if (attacker.hp <= 0) break; }

    let cardEl = aSlots[idx].querySelector('.card');
    if (cardEl) { cardEl.classList.remove(anim); void cardEl.offsetWidth; cardEl.classList.add(anim); }
    // ⏳ The Leap — รอให้พุ่งถึง impact point (50% ของ animation = 175ms)
    await sleep(LOA_IMPACT_MS);

    if (defender?.hp <= 0) defender = null;
    if (hasSkill(attacker, "คลุ้มคลั่ง")) { attacker.atk = Number(attacker.atk) + 50; showFloat("ATK +50", aSlots[idx], "skill"); markDirty(); flushBoard(); }

    if (defender && (defender.shadowTurns || 0) > 0) {
      showFloat("👻 STEALTH", tSlots[idx], "skill");
      addLog(`👻 ${defender.name} ซ่อนตัว — ดาเมจทะลุฮีโร่`);
      spawnImpactClaw(tHero); // 💥 The Impact — กระแทกหน้าฮีโร่
      let pd = attacker.atk; if (isPlayer) enemyHP -= pd; else playerHP -= pd;
      showFloat(`-${pd}`, tHero, "dmg"); if (combatStats[attacker?.uid]) combatStats[attacker?.uid].dmg += pd;
      updateHeroHP();
      // ⏳ The Recoil — รอดีดกลับที่เดิม
      await sleep(LOA_RECOIL_MS); cardEl?.classList.remove(anim); await sleep(100); continue;
    }

    if (defender) {
      let dmg = attacker.atk;
      if (hasDomain) dmg = Math.floor(dmg * 0.8);
      let dName = `<span class="${!isPlayer ? 'log-player' : 'log-enemy'}">${defender.name}</span>`;
      let shadowMult = 1;
      
      if (hasSkill(attacker, "Shadow Protocol") && attacker.shadowReady) {
        attacker.shadowReady = false; shadowMult = 2.5; dmg = Math.floor(dmg * 2.5);
        showFloat("💥 SHADOW STRIKE!", aSlots[idx], "skill");
        addLog(`💥 ${aName} <span class="log-skill">Shadow Strike ×2.5</span> → <span class="log-dmg">${dmg}</span>`);
      }
      let isCrit = (shadowMult > 1) || (Math.random() * 100 < (attacker.critChance || 0));
      if (isCrit && shadowMult <= 1) { dmg = Math.floor(dmg * 2); showFloat("CRITICAL!", aSlots[idx], "skill"); }

      let tEl = tSlots[idx];
      if (hasSkill(defender, "หลบหลีก") && Math.random() > 0.5) { showFloat("Miss!", tEl, "skill"); addLog(`💨 ${aName} ตีวืด!`); }
      else {
        spawnImpactClaw(tEl); // 💥 The Impact — รอยกรงเล็บบน target
        addLog(`⚔️ ${aName} → ${dName} ${isCrit ? '💥 คริ! ' : ''}(<span class="log-dmg">${dmg}</span>)`);
        let actual = applyDamage(defender, dmg, tEl, !isPlayer, "normal", attacker);

        // Crimson Frenzy drain
        if (actual > 0 && hasSkill(defender, "Crimson Frenzy") && defender.hp > 0) {
          let da = Math.floor((attacker.atk || 0) * 0.1), dh = Math.floor((attacker.maxHP || attacker.hp) * 0.1);
          if (da > 0) { attacker._displayATK = attacker.atk; attacker.atk = Math.max(0, attacker.atk - da); }
          if (dh > 0) { attacker._displayHP = attacker.hp; attacker.hp = Math.max(0, attacker.hp - dh); }
          defender._displayATK = defender.atk; defender._displayHP = defender.hp;
          defender.atk = Number(defender.atk) + da; defender.hp += dh; 
          if (combatStats[defender?.uid]) combatStats[defender?.uid].heal += dh;
          showFloat(`🩸-${da}A/-${dh}H`, aSlots[idx], "drain"); 
          showFloat(`+${da}A/+${dh}H`, tEl, "drain");
          defender.bloodStacks = Math.min(3, (defender.bloodStacks || 0) + 1);
          addLog(`🩸 ${dName} Blood Stack (${defender.bloodStacks}/3)`);
        }

        if (actual > 0 && hasSkill(defender, "Iron Sentinel") && defender.hp > 0) {
          let cd = Math.floor(actual * 0.4);
          if (cd > 0) { showFloat(`🛡️↩${cd}`, tEl, "skill"); addLog(`🛡️ ${dName} Counterstrike <span class="log-dmg">${cd}</span>`); applyDamage(attacker, cd, aSlots[idx], isPlayer, "counterstrike", defender); }
        }
      }

      if (hasSkill(defender, "สะท้อน") && dmg > 0) { addLog(`🛡️ ${dName} สะท้อน!`); applyDamage(attacker, Math.floor(dmg / 2), aSlots[idx], !isPlayer, "reflect", defender); }
      if (hasSkill(attacker, "ตีกระจาย") && dmg > 0) {
        let sp = Math.floor(dmg / 2);
        if (idx > 0 && curEnemy[idx - 1]) { spawnImpactClaw(tSlots[idx - 1]); applyDamage(curEnemy[idx - 1], sp, tSlots[idx - 1], !isPlayer, "splash", attacker); }
        if (idx < 6 && curEnemy[idx + 1]) { spawnImpactClaw(tSlots[idx + 1]); applyDamage(curEnemy[idx + 1], sp, tSlots[idx + 1], !isPlayer, "splash", attacker); }
      }
      if (hasSkill(attacker, "เจาะเกราะ") && dmg > 0) {
        spawnImpactClaw(tHero); // 💥 ทะลุไปโดนฮีโร่ด้วย
        let p = Math.floor(attacker.atk / 2); if (isPlayer) enemyHP -= p; else playerHP -= p;
        showFloat(`-${p} (เจาะ)`, tHero, "dmg"); if (combatStats[attacker?.uid]) combatStats[attacker?.uid].dmg += p;
      }
      if (hasSkill(attacker, "สตัน") && dmg > 0) { defender.atk = Math.max(0, Number(defender.atk) - 50); showFloat("ATK -50", tSlots[idx], "skill"); }

    } else {
      // ตีเข้าหน้าฮีโร่โดยตรง
      spawnImpactClaw(tHero); // 💥 The Impact — กระแทกหน้าฮีโร่
      let dmg = attacker.atk;
      if (hasDomain) dmg = Math.floor(dmg * 0.8);
      if (hasSkill(attacker, "Shadow Protocol") && attacker.shadowReady) { attacker.shadowReady = false; dmg = Math.floor(dmg * 2.5); showFloat("💥 SHADOW STRIKE!", aSlots[idx], "skill"); addLog(`💥 ${aName} Shadow Strike ×2.5 ตรงฮีโร่!`); }
      let isCrit = Math.random() * 100 < (attacker.critChance || 0);
      if (isCrit) { dmg = Math.floor(dmg * 2); showFloat("CRITICAL!", aSlots[idx], "skill"); }
      if (isPlayer) enemyHP -= dmg; else playerHP -= dmg; showFloat(`-${dmg}`, tHero, "dmg");
      addLog(`⚔️ ${aName} → ฮีโร่ ${isCrit ? '💥 คริ! ' : ''}(<span class="log-dmg">${dmg}</span>)`);
      if (combatStats[attacker?.uid]) combatStats[attacker?.uid].dmg += dmg;
    }
    
    updateHeroHP();
    // ⏳ The Recoil — รอดีดกลับที่เดิม แล้วพักหายใจก่อนสวิงรอบถัดไป
    await sleep(LOA_RECOIL_MS);
    cardEl?.classList.remove(anim);
    await sleep(60); // breath ระหว่าง combo

  if (attacker.hp > 0 && hasSkill(attacker, "Restoration Pulse")) {
    let tb = isPlayer ? playerBoard : enemyBoard;
    let ts = isPlayer ? playerBoardSlots : enemyBoardSlots;
    let minHP = Infinity, minIdx = -1;
    
    tb.forEach((c, i) => {
      if (c && c.hp > 0 && c.hp < minHP) { minHP = c.hp; minIdx = i; }
    });
    
    if (minIdx !== -1) {
      let heal = Math.floor(attacker.atk * 1.5);
      tb[minIdx]._displayHP = tb[minIdx].hp; // snapshot
      tb[minIdx].hp = Math.min(tb[minIdx].maxHP, tb[minIdx].hp + heal);
      if (combatStats[attacker?.uid]) combatStats[attacker?.uid].heal += heal;

      // ── ✨ RESTORATION PULSE visual ──
      (() => {
        const srcRect = getEffectRect(aSlots[idx]);
        const dstRect = getEffectRect(ts[minIdx]);
        const sx = srcRect.left + srcRect.width / 2;
        const sy = srcRect.top  + srcRect.height / 2;
        const dx = dstRect.left + dstRect.width / 2;
        const dy = dstRect.top  + dstRect.height / 2;
        // Pulse rings from caster
        [0, 0.15, 0.30].forEach((delay) => {
          const ring = document.createElement('div'); ring.className = 'battle-vfx restore-ring';
          ring.style.cssText = `left:${sx}px;top:${sy}px;--rr-delay:${delay}s;--rr-dur:0.9s;`;
          document.body.appendChild(ring);
          setTimeout(() => ring.remove(), 1100);
        });
        // Healing beam to target (only if different slot)
        if (minIdx !== idx) {
          const len = Math.hypot(dx - sx, dy - sy);
          const ang = Math.atan2(dy - sy, dx - sx) * 180 / Math.PI;
          const beam = document.createElement('div'); beam.className = 'battle-vfx restore-beam';
          beam.style.cssText = `left:${sx}px;top:${sy}px;width:${len}px;transform:rotate(${ang}deg);--rb-dur:0.55s;`;
          document.body.appendChild(beam);
          setTimeout(() => beam.remove(), 700);
        }
        // Heart particles on healed card
        for (let h = 0; h < 5; h++) {
          const p = document.createElement('div'); p.className = 'battle-vfx heart-particle';
          p.textContent = h % 2 === 0 ? '💖' : '✨';
          const ox = (Math.random() - 0.5) * 60;
          const oy = -(55 + Math.random() * 50);
          p.style.cssText = `left:${dx + (Math.random()-0.5)*30}px;top:${dy}px;--hx:${ox}px;--hy:${oy}px;--hp-delay:${h*0.09}s;--hp-dur:${1.0 + Math.random()*0.3}s;`;
          document.body.appendChild(p);
          setTimeout(() => p.remove(), 1600);
        }
      })();
      // ────────────────────────────────

      showFloat(`💖 +${heal}`, ts[minIdx], "heal");
      addLog(`💖 ${aName} <span class="log-skill">Restoration Pulse</span> ฮีล ${tb[minIdx].name} ${heal} HP`);
      updateHeroHP(); markDirty(); flushBoard(); await sleep(400);
    }
  }
  } // end for (attacks)
} // end executeAttack