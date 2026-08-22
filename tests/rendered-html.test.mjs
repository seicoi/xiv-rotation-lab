import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders XIV Rotation Lab", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>XIV Rotation Lab<\/title>/i);
  assert.match(html, /タイムライン/);
  assert.match(html, /設定/);
  assert.doesNotMatch(html, /FFLogs|XIVAPI|イベントログ|戦闘レポート|アクションDB|ACTION DATABASE|ID \d+/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("keeps the Allagan Studies damage and timing invariants explicit", async () => {
  const [formula, engine, jobs, pets, specials, dots, blackMage, recasts, page, actionRoute, logClient, readme, workflow] = await Promise.all([
    readFile(new URL("../app/calculation/damage-formula.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/damage-engine.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/calculation/job-configs.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/calculation/pet-configs.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/calculation/special-actions.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/calculation/dot-actions.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/calculation/black-mage-config.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/recast-timer.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/actions/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/fflogs-client.ts", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/pages.yml", import.meta.url), "utf8"),
  ]);

  // Public copy and workflow titles do not disclose internal integrations or
  // stable identifiers. Internal implementation names remain testable below.
  assert.doesNotMatch(page, /イベントログ|Event log|戦闘レポート|Combat report|Castイベント|アクションDB|ACTION DATABASE|ID \{action\.id\}|www\.fflogs\.com\/reports/i);
  assert.doesNotMatch(readme, /actionId|アクションID|FFLogs|XIVAPI/i);
  assert.match(workflow, /^name: Deploy GitHub Pages/m);
  assert.doesNotMatch(workflow, /^run-name:/m);

  // Current Attack is 90 potency; Shot (BRD/MCH) is 80 potency.
  assert.match(formula, /AA_POTENCY:Record<string,number>=\{BRD:80,MCH:80\}/);
  assert.match(formula, /AA_POTENCY\[job\]\|\|90/);

  // Action Damage / Maim and Mend traits do not modify auto attacks.
  assert.match(formula, /kind==="auto"\?100:f\.trait/);
  assert.match(formula, /if\(kind==="auto"\)return Math\.max\(1,value\)/);
  assert.match(formula, /if\(base<=1\)return applyMultipliers\(1,allMultipliers\)/);

  // Allagan Studies applies +1 to DoT base damage after the trait stage.
  assert.match(formula, /return kind==="dot"\?value\+1:value/);

  assert.match(engine, /aaPotency=autoAttackPotency\(job\)/);
  assert.match(engine, /aaFormulaStats=\{\.\.\.stats,main:mainStat,aaMain,speed:stats\.aaSpeed\}/);
  assert.match(engine, /baseDamage\(aaPotency/);
  assert.doesNotMatch(engine, /stats\.autoAttack/);
  assert.match(formula, /FULL_PARTY_MAIN_STAT_BONUS=\.05/);
  assert.match(formula, /Math\.floor\(Math\.max\(0,value\)\*\(1\+FULL_PARTY_MAIN_STAT_BONUS\)\)/);
  assert.match(engine, /mainStat=fullPartyMainStat\(stats\.main\)/);
  assert.match(engine, /aaMain=fullPartyMainStat\(aaUsesMain\?stats\.main:stats\.aaMain\)/);

  // Weapon tooltip AA remains a read-only reference, not a damage input.
  assert.match(page, /武器AA性能（参照値）/);
  assert.match(page, /AA内部威力/);

  // SS tiers come from integer floors: displayed GCD is 2 decimals and the
  // internal cycle adds 0.005 seconds of GCD tax. Ability lock is 0.625 sec,
  // and cast actions unlock oGCD after 80% of the adjusted cast.
  assert.match(formula, /Math\.floor\(hasteMilliseconds\/10\)\/100/);
  assert.match(formula, /speedAdjustedTime\(seconds,stats,haste\)\+\.005/);
  assert.match(engine, /ANIMATION_LOCK=\.625/);
  assert.match(engine, /adjustedCast\*\.8/);
  assert.match(engine, /nextOgcd=Math\.max\(nextOgcd,ogcdUnlock\)/);
  assert.doesNotMatch(engine, /sumPotency\+=newAa\*aaPotency/);
  assert.match(actionRoute, /AdditionalCooldownGroup/);
  assert.match(actionRoute, /cooldownGroup===58\?recast:additionalCooldownGroup===58\?0:recast/);
  assert.match(engine, /row\.gcdRecast\|\|stats\.gcd/);

  // Job-specific haste supports timed buffs, passive traits, and consumable stacks.
  assert.match(engine, /config\.passiveHaste\|\|0/);
  assert.match(engine, /remainingStacks/);
  assert.match(page, /milliseconds%60000\/1000/);
  assert.match(page, /seconds\.toFixed\(3\)\.padStart\(6,"0"\)/);
  assert.match(jobs, /JOB_CONFIGS\.WHM\.buffs\.push\(\{sourceActionId:136,duration:15,haste:20\}\)/);
  assert.match(jobs, /JOB_CONFIGS\.GNB\.buffs\.push\(\{sourceActionId:16138,duration:20,damageMultiplier:1\.2\}\)/);
  assert.match(jobs, /sourceActionId:3539,key:"divine-might".*include:\[7384\].*potencyOverride:500,castOverride:0/);
  assert.match(jobs, /sourceActionId:7436,duration:20,critRateBonus:\.1/);
  assert.match(jobs, /sourceActionId:36958,key:"kunais-bane",duration:15,damageMultiplier:1\.1/);
  assert.match(jobs, /sourceActionId:118,duration:20,dhRateBonus:\.2/);
  assert.match(jobs, /sourceActionId:7520,duration:20,damageMultiplier:1\.1,attackTypeIds:\[5\]/);
  assert.match(engine, /buffRateBonuses/);
  assert.match(engine, /rateBonuses=buffRateBonuses/);
  assert.match(jobs, /sourceActionId:2876,duration:5,guaranteedCrit:true,guaranteedDh:true/);
  assert.match(engine, /buffs\.some\(buff=>buff\.guaranteedCrit\)/);
  assert.match(blackMage, /level>=96\?1\.27:level>=86\?1\.22:level>=78\?1\.15:level>=70\?1\.1/);
  assert.match(blackMage, /\[1,1\.4,1\.6,1\.8\]/);
  assert.match(engine, /blackMageDamageMultipliers/);
  assert.match(jobs, /JOB_CONFIGS\.MNK\.passiveHaste=20/);
  assert.match(jobs, /JOB_CONFIGS\.NIN\.passiveHaste=15/);
  assert.match(jobs, /JOB_CONFIGS\.SAM\.buffs\.push/);
  assert.match(jobs, /JOB_CONFIGS\.VPR\.buffs\.push/);
  assert.match(jobs, /JOB_CONFIGS\.BLM\.buffs\.push\(\{sourceActionId:3573,duration:20,haste:15\}\)/);
  assert.match(jobs, /sourceActionId:34675,duration:30,haste:25,stacks:5/);

  // English descriptions use "a potency of 220" while Japanese and some
  // secondary values use a colon. Match the direct value before combo values.
  assert.match(actionRoute, /potency\\s\+of/);
  assert.match(actionRoute, /ActionCombo,PreservesCombo,Aspect/);
  assert.match(actionRoute, /MaxCharges/);
  assert.match(actionRoute, /function extractComboPotency/);
  assert.match(engine, /comboSucceeded/);
  assert.match(engine, /comboExpires=actionReady\+30/);
  assert.match(page, /migrateDeveloperConfig/);
  assert.match(page, /<RecastTracker states=\{recastStates\}/);
  assert.match(page, /作成後にジョブは変更できません/);
  assert.match(recasts, /nextChargeAt=charges<maximum\?nextChargeAt\+recast:Infinity/);

  // Post-stat-squish pet ratios stay separate from the historical 5.x values.
  assert.match(pets, /DRK:.*numerator:80,denominator:86.*useNonTankAttack:true,provisional:true/s);
  assert.match(pets, /NIN:.*numerator:80,denominator:85.*applicability:"damage"/s);
  assert.match(pets, /MCH:.*numerator:80,denominator:90.*applicability:"damage"/s);
  assert.match(pets, /SMN:.*numerator:80,denominator:90.*applicability:"damage"/s);
  assert.match(pets, /SCH:.*numerator:80,denominator:90.*applicability:"healing"/s);
  assert.match(pets, /AST:.*numerator:80,denominator:90.*hiddenTraitMultiplier:1\.04.*allowedActionIds:\[7439,8324\]/s);
  assert.match(pets, /ownerMain-ownerBase\+petBase/);
  assert.match(pets, /profile\.numerator\*100\/POST_SQUISH_MODIFIER_BASE/);
  assert.match(formula, /overrides\.postTraitMultiplier/);
  assert.match(engine, /usesPetFormula=!!detonatedStar\|\|isDirectPetCorrectedAction\(job,row\.actionId\)/);
  assert.match(engine, /canApplyPetDamageCorrection\(candidatePetProfile,row\.actionId\)/);
  assert.match(page, /ペット／分身補正/);
  assert.doesNotMatch(page, /onChange=\{event=>update\(action,\{petCorrection:/);

  // Summons, delayed detonation, clone stacks, and ground effects use their
  // dedicated timing models rather than a parsed direct-potency shortcut.
  assert.match(specials, /livingShadowAttacks/);
  assert.match(specials, /stacks:5,duration:30,singlePotency:160,aoePotency:80/);
  assert.match(specials, /growAfter:10,expiresAfter:20,smallPotency:205,largePotency:310/);
  assert.match(specials, /initialDelay:5\.5,punchInterval:1\.56,punches:5,finisherInterval:2/);
  assert.match(specials, /minBattery:50,maxBattery:100/);
  assert.match(engine, /resolveScheduled/);
  assert.match(engine, /damageEvent<bunshinState\.ends/);
  assert.match(engine, /bunshinState\.stacks--/);
  assert.match(engine, /queenOverdrive/);
  assert.match(specials, /phantomKamaitachi:25774/);
  assert.match(specials, /isDirectPetCorrectedAction/);
  assert.match(specials, /PET_COMMAND_DELAY=\.675/);
  assert.match(engine, /isSummonerPetCommand\(job,row\.actionId\)\?actionReady\+PET_COMMAND_DELAY:actionReady/);
  assert.match(engine, /damageEvent=.*:actionReady/);
  assert.match(dots, /actionId:3639.*initialTick:true/);
  assert.match(dots, /actionId:2270.*initialTick:true/);
  assert.match(dots, /actionId:25837.*initialTick:true/);
  assert.match(page, /<BatteryInput value=\{row\.specialValue\?\?100\}/);

  // Combat-report import follows Timeline Studio's complete PKCE + GraphQL
  // workflow and uses every Cast-event page, rather than accepting only a
  // preformatted four-row fixture.
  assert.match(logClient, /code_challenge_method:"S256"/);
  assert.match(logClient, /dataType: Casts/);
  assert.match(logClient, /limit: 10000/);
  assert.match(logClient, /while\(startTime!==null\)/);
  assert.match(page, /fetchAllLogCastEvents/);
  assert.match(page, /event\.timestamp-logContext\.fight\.startTime/);
  assert.match(page, /Math\.round\(event\.timestamp-logContext\.fight\.startTime\)\/1000/);
  assert.match(page, /actionMap\.get\(Number\(event\.abilityGameID\)\)/);
  assert.match(page, /setJob\(targetJob\)/);
  assert.match(page, /requestAnimationFrame\(\(\)=>\{setSheets/);
  assert.match(page, /setPanel\("timeline"\)/);
  assert.match(page, /legacyMilliseconds=.*maxTime>7200/);
  assert.match(page, /SimulationDistributionChart/);
  assert.match(engine, /simulationTotals/);
  assert.match(engine, /minimum:samples\[0\]/);
  assert.match(engine, /function mergeDowntimes/);
  assert.match(engine, /measuredDuration\(damageEvent,downtimes\)/);
  assert.match(engine, /options\.simulate!==false/);
  assert.match(page, /calculate\(candidateRows,stats,job,developerConfig,false\)/);
  assert.match(page, /01a0219a-7b72-70bf-8e4d-e04dbe54ac70/);
  assert.doesNotMatch(page, /019f7ed6-39d0-726d-80a4-8a4e413d26f3/);
});
