const JOBS = new Set(["PLD","WAR","DRK","GNB","WHM","SCH","AST","SGE","MNK","DRG","NIN","SAM","RPR","VPR","BRD","MCH","DNC","BLM","SMN","RDM","PCT"]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const job = (url.searchParams.get("job") || "").toUpperCase();
  const level = Math.min(100, Math.max(1, Number(url.searchParams.get("level")) || 100));
  if (!JOBS.has(job)) return Response.json({ error: "unsupported job" }, { status: 400 });

  const query = encodeURIComponent(`+ClassJobCategory.${job}=true +IsPlayerAction=true`);
  const endpoint = `https://v2.xivapi.com/api/search?sheets=Action&fields=Name,Icon,ActionCategory,ClassJobLevel,Recast100ms&query=${query}&language=ja&limit=200`;
  const response = await fetch(endpoint, { headers: { Accept: "application/json" } });
  if (!response.ok) return Response.json({ error: "xivapi unavailable" }, { status: 502 });
  const data = await response.json() as { results?: Array<{ row_id:number; fields?:Record<string, any> }> };
  const seen = new Set<string>();
  const actions = (data.results || []).map((row) => {
    const fields = row.fields || {};
    const category = fields.ActionCategory?.fields?.Name || "";
    return {
      id: row.row_id,
      name: fields.Name || "",
      lane: category === "アビリティ" ? "ability" : "gcd",
      level: Number(fields.ClassJobLevel || 0),
      recast: Number(fields.Recast100ms || 0) / 10,
      iconPath: fields.Icon?.path_hr1 || fields.Icon?.path || "",
    };
  }).filter((action) => action.name && action.level <= level && (action.lane === "ability" || action.recast > 0) && !seen.has(action.name) && seen.add(action.name));
  return Response.json({ job, actions }, { headers: { "Cache-Control": "public, max-age=86400" } });
}
