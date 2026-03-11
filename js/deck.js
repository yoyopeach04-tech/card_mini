// ── 7. CARD INIT & DECK ────────────────────────────────────
function initCard(c) {
  if (!c || typeof c.maxHP !== 'undefined') { if (c && !combatStats[c.uid]) combatStats[c.uid] = { name: c.name, owner: c.owner, isClone: c.isClone, dmg: 0, taken: 0, heal: 0 }; return; }
  Object.assign(c, {
    baseHP: c.hp, maxHP: c.hp, baseATK: c.atk, bloodStacks: 0,
    hasRevived: false, reviveBuffTurns: 0, domainTurns: 0, fragments: 0,
    hpLostAccum: 0, immortalTurns: 0, baseWait: c.waitTime, critChance: 0,
    isSummoned: c.isSummoned || false, echoesUsed: false, burnTurns: c.burnTurns || 0,
    shadowTurns: hasSkill(c, "Shadow Protocol") ? 2 : 0, shadowReady: false,
    airstrikeCharge: 0, sentinelStacks: 0,
    physShield: false, unrevivable: false,
    corruptTurns: 0, devourStacks: 0,
    tyrantEntryDone: false, hunterAuraActive: false, hunterAuraBonus: 0,
  });
  if (!c.uid) { c.uid = ++cardUidCounter; c.owner = "Unknown"; }
  combatStats[c.uid] = { name: c.name, owner: c.owner, isClone: c.isClone, dmg: 0, taken: 0, heal: 0 };
}

function buildDeck(isPlayer) {
  let d = [], counts = {};
  while (d.length < 10) {
    let c = cardDB[Math.floor(Math.random() * cardDB.length)];
    counts[c.id] = (counts[c.id] || 0);
    if (c.stars === 6 && counts[c.id] >= 1) continue;
    if (c.stars === 5 && counts[c.id] >= 2) continue;
    if (c.stars  <  5 && counts[c.id] >= 3) continue;
    let nc = cloneCard(c); nc.uid = ++cardUidCounter;
    nc.owner = isPlayer ? 'พีช' : 'บอส';
    d.push(nc); counts[c.id]++;
  }
  return d;
}