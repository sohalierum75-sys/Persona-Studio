import { execFileSync } from 'node:child_process';
import JSZip from 'jszip';
const text = execFileSync('git', ['credential', 'fill'], { input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8', stdio: ['pipe','pipe','pipe'] });
const token = text.split('\n').find(line => line.startsWith('password='))?.slice(9);
if (!token) throw new Error('GitHub credential unavailable');
const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };
const base = 'https://api.github.com/repos/sohalierum75-sys/Persona-Studio';
const runs = await fetch(base + '/actions/runs?per_page=1', { headers }).then(r=>r.json());
const run = runs.workflow_runs[0];
console.log(JSON.stringify({id:run.id,sha:run.head_sha,conclusion:run.conclusion,url:run.html_url}));
const jobs = await fetch(run.jobs_url, { headers }).then(r=>r.json());
console.log(JSON.stringify(jobs.jobs.map(j=>({name:j.name,conclusion:j.conclusion,steps:j.steps.map(s=>({name:s.name,conclusion:s.conclusion}))}))));
const response = await fetch(run.logs_url, { headers });
if (!response.ok) throw new Error(`Logs HTTP ${response.status}`);
const zip = await JSZip.loadAsync(await response.arrayBuffer());
console.log(Object.keys(zip.files));
for (const [name,file] of Object.entries(zip.files)) if (name === '0_deploy.txt') {
  const log = await file.async('string');
  console.log(name);
  console.log(log.split('\n').filter(line => /(?:Container |Pulling|Pulled|deployed |healthy|Caddyfile |Error|error|Warning|warning|IMAGE_TAG=|exit code|Recreat|Starting|Started|Valid configuration|deploy.sh)/.test(line)).join('\n').replaceAll(token,'[redacted]'));
}
