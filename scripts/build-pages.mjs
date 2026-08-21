import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const jobs = ["PLD","WAR","DRK","GNB","WHM","SCH","AST","SGE","MNK","DRG","NIN","SAM","RPR","VPR","BRD","MCH","DNC","BLM","SMN","RDM","PCT"];
const locales = ["ja", "en"];
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const clientDirectory = join(root, "dist", "client");
const serverEntry = pathToFileURL(join(root, "dist", "server", "index.js"));
serverEntry.searchParams.set("pages", Date.now().toString());
const { default: worker } = await import(serverEntry.href);
const environment = {
  ASSETS: {
    fetch: async () => new Response("Not found", { status: 404 }),
  },
};
const context = {
  waitUntil() {},
  passThroughOnException() {},
};

async function request(path) {
  return worker.fetch(new Request(`http://localhost${path}`), environment, context);
}

async function writeActionData(job, locale) {
  const response = await request(`/api/actions?schema=3&job=${job}&level=100&language=${locale}`);
  if (!response.ok) {
    throw new Error(`Could not build ${job}/${locale}: ${response.status} ${await response.text()}`);
  }
  const data = await response.json();
  if (!Array.isArray(data.actions) || data.actions.length === 0) {
    throw new Error(`No actions returned for ${job}/${locale}`);
  }
  const output = join(clientDirectory, "data", "actions", locale, `${job}.json`);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(data));
  process.stdout.write(`Generated ${job}/${locale}: ${data.actions.length} actions\n`);
}

const queue = locales.flatMap(locale => jobs.map(job => ({ job, locale })));
const workers = Array.from({ length: 3 }, async () => {
  while (queue.length) {
    const item = queue.shift();
    if (item) await writeActionData(item.job, item.locale);
  }
});
await Promise.all(workers);

const page = await request("/");
if (!page.ok) throw new Error(`Could not render the application shell: ${page.status}`);
const html = await page.text();
if (!html.includes("XIV Rotation Lab")) throw new Error("Rendered HTML is missing the application title");
await writeFile(join(clientDirectory, "index.html"), html);
await writeFile(join(clientDirectory, "404.html"), html);
await writeFile(join(clientDirectory, ".nojekyll"), "");
