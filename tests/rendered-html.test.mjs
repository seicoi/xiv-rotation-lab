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

test("keeps the Allagan Studies damage invariants explicit", async () => {
  const [formula, engine, page] = await Promise.all([
    readFile(new URL("../app/calculation/damage-formula.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/damage-engine.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);

  // Attack is 110 potency; Shot (BRD/MCH) is 100 potency.
  assert.match(formula, /AA_POTENCY:Record<string,number>=\{BRD:100,MCH:100\}/);
  assert.match(formula, /AA_POTENCY\[job\]\|\|110/);

  // Action Damage / Maim and Mend traits do not modify auto attacks.
  assert.match(formula, /kind==="auto"\?100:f\.trait/);

  // Allagan Studies applies +1 to DoT base damage after the trait stage.
  assert.match(formula, /return kind==="dot"\?value\+1:value/);

  assert.match(engine, /aaPotency=autoAttackPotency\(job\)/);
  assert.match(engine, /baseDamage\(aaPotency/);
  assert.doesNotMatch(engine, /stats\.autoAttack/);

  // Weapon tooltip AA remains a read-only reference, not a damage input.
  assert.match(page, /武器AA性能（参照値）/);
  assert.match(page, /AA内部威力/);
});
