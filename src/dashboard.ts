export const dashboardHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AgentTidy</title>
<style>
body{font-family:system-ui,sans-serif;max-width:1100px;margin:40px auto;padding:0 20px;color:#1f2328}h1{margin-bottom:4px}.muted{color:#59636e}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:24px 0}.card{border:1px solid #d0d7de;border-radius:8px;padding:16px}.value{font-size:24px;font-weight:700}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:28px}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:9px;border-bottom:1px solid #d8dee4;vertical-align:top;font-size:14px} @media(prefers-color-scheme:dark){body{background:#0d1117;color:#e6edf3}.card,th,td{border-color:#30363d}.muted{color:#8b949e}}
</style>
</head>
<body>
<h1>AgentTidy</h1><div class="muted">Local telemetry and waste findings</div>
<div class="cards" id="cards"></div>
<div class="grid"><section><h2>MCP servers</h2><table><thead><tr><th>Name</th><th>Calls</th><th>Tokens</th></tr></thead><tbody id="mcp"></tbody></table></section><section><h2>Skills</h2><table><thead><tr><th>Name</th><th>Loads</th><th>Tokens</th></tr></thead><tbody id="skills"></tbody></table></section></div>
<h2>Findings</h2><table><thead><tr><th>Rule</th><th>Finding</th><th>Confidence</th><th>Potential tokens</th></tr></thead><tbody id="findings"></tbody></table>
<script>
function cell(value){const td=document.createElement('td');td.textContent=String(value??'');return td}
function rows(id,data,skill=false){const body=document.getElementById(id);body.replaceChildren(...data.map(r=>{const tr=document.createElement('tr');tr.append(cell(r.name),cell(skill?r.spans:r.calls),cell(r.inputTokens+r.outputTokens));return tr}))}
async function load(){
 const r=await fetch('/v1/report'); const d=await r.json();
 const values=[['Spans',d.totals.spans],['Input tokens',d.totals.inputTokens],['Output tokens',d.totals.outputTokens],['MCP calls',d.totals.mcpCalls],['Reported cost','$'+d.totals.estimatedCostUsd.toFixed(4)],['Potential avoidable','~'+d.totals.potentialAvoidableTokens+' tok']];
 const cards=document.getElementById('cards'); cards.replaceChildren(...values.map(([k,v])=>{const e=document.createElement('div');e.className='card';const a=document.createElement('div');a.className='muted';a.textContent=k;const b=document.createElement('div');b.className='value';b.textContent=v;e.append(a,b);return e;}));
 rows('mcp',d.breakdown.mcpServers); rows('skills',d.breakdown.skills,true);
 const body=document.getElementById('findings'); body.replaceChildren(...d.findings.map(f=>{const tr=document.createElement('tr');tr.append(cell(f.ruleId),cell(f.title+' — '+f.detail),cell(f.confidence),cell(f.avoidableTokens??'—'));return tr;}));
}
load();
</script>
</body></html>`;
