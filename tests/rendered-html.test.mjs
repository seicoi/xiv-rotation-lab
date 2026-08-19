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
  assert.match(html, /データベース/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("keeps the Allagan Studies damage and timing invariants explicit", async () => {
  const [formula, engine, jobs, pets, page, actionRoute] = await Promise.all([
    readFile(new URL("../app/calculation/damage-formula.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/damage-engine.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/calculation/job-configs.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/calculation/pet-configs.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/actions/route.ts", import.meta.url), "utf8"),
  ]);

  // Current Attack is 90 potency; Shot (BRD/MCH) is 80 potency.
  assert.match(formula, /AA_POTENCY:Record<string,number>=\{BRD:80,MCH:80\}/);
  assert.match(formula, /AA_POTENCY\[job\]\|\|90/);

  // Action Damage / Maim and Mend traits do not modify auto attacks.
  assert.match(formula, /kind==="auto"\?100:f\.trait/);
  assert.match(formula, /if\(kind==="auto"\)return Math\.max\(1,value\)/);
  assert.match(formula, /if\(base<=1\)return applyMultipliers\(1,multipliers\)/);

  // Allagan Studies applies +1 to DoT base damage after the trait stage.
  assert.match(formula, /return kind==="dot"\?value\+1:value/);

  assert.match(engine, /aaPotency=autoAttackPotency\(job\)/);
  assert.match(engine, /aaFormulaStats=\{\.\.\.stats,speed:stats\.aaSpeed\}/);
  assert.match(engine, /baseDamage\(aaPotency/);
  assert.doesNotMatch(engine, /stats\.autoAttack/);
  assert.doesNotMatch(engine, /stats\.main\*1\.05|stats\.aaMain\*1\.05/);

  // Weapon tooltip AA remains a read-only reference, not a damage input.
  assert.match(page, /武器AA性能（参照値）/);
  assert.match(page, /AA内部威力/);

  // SS tiers come from integer floors: displayed GCD is 2 decimals and the
  // internal cycle adds 0.005 seconds of GCD tax. Ability lock is 0.675 sec.
  assert.match(formula, /Math\.floor\(hasteMilliseconds\/10\)\/100/);
  assert.match(formula, /speedAdjustedTime\(seconds,stats,haste\)\+\.005/);
  assert.match(engine, /nextOgcd=Math\.max\(nextOgcd,row\.time\)\+\.675/);

  // Job-specific haste supports timed buffs, passive traits, and consumable stacks.
  assert.match(engine, /config\.passiveHaste\|\|0/);
  assert.match(engine, /remainingStacks/);
  assert.match(page, /milliseconds%60000\/1000/);
  assert.match(page, /seconds\.toFixed\(3\)\.padStart\(6,"0"\)/);
  assert.match(jobs, /JOB_CONFIGS\.WHM\.buffs\.push\(\{sourceActionId:136,duration:15,haste:20\}\)/);
  assert.match(jobs, /JOB_CONFIGS\.MNK\.passiveHaste=20/);
  assert.match(jobs, /JOB_CONFIGS\.NIN\.passiveHaste=15/);
  assert.match(jobs, /JOB_CONFIGS\.SAM\.buffs\.push/);
  assert.match(jobs, /JOB_CONFIGS\.VPR\.buffs\.push/);
  assert.match(jobs, /JOB_CONFIGS\.BLM\.buffs\.push\(\{sourceActionId:3573,duration:20,haste:15\}\)/);
  assert.match(jobs, /sourceActionId:34675,duration:30,haste:25,stacks:5/);

  // English descriptions use "a potency of 220" while Japanese and some
  // secondary values use a colon. Match the direct value before combo values.
  assert.match(actionRoute, /potency\\s\+of/);

  // Published 5.x pet coefficients remain explicit and level-scoped.
  assert.match(pets, /SMN:.*hiddenTraitMultiplier:\.8.*attackCoefficientByLevel:\{80:180\}/s);
  assert.match(pets, /SCH:.*hiddenTraitMultiplier:\.67.*coefficient:106,denominator:304/s);
  assert.match(pets, /DRK:.*jobModifier:100.*useNonTankAttack:true/s);
  assert.match(pets, /AST:.*hiddenTraitMultiplier:1\.04/s);
  assert.match(engine, /petCorrection:actionOverride\?\.petCorrection\?\?configuredRule\.petCorrection/);
  assert.match(engine, /actionRule\.petCorrection\?findPetCorrectionProfile\(job\)/);
  assert.match(page, /ペット／分身補正/);
});
