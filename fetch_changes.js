import { Octokit } from '@octokit/rest'

async function getAccessToken() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;
  if (!xReplitToken) throw new Error('X_REPLIT_TOKEN not found');
  const data = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=github',
    { headers: { 'Accept': 'application/json', 'X_REPLIT_TOKEN': xReplitToken } }
  ).then(res => res.json());
  const cs = data.items?.[0];
  return cs?.settings?.access_token || cs?.settings?.oauth?.credentials?.access_token;
}

async function run() {
  const token = await getAccessToken();
  const octokit = new Octokit({ auth: token });
  const owner = 'Trelinder';
  const repo = 'Mathscript';
  
  // Get commits on main
  const { data: commits } = await octokit.repos.listCommits({ owner, repo, sha: 'main', per_page: 10 });
  console.log('=== REMOTE COMMITS ===');
  for (const c of commits) {
    console.log(`${c.sha.slice(0,7)} ${c.commit.message.split('\n')[0]}`);
  }
  
  // Check if there are commits we don't have locally (compare with our latest: e2c5e3a)
  const localHead = 'e2c5e3a83658867cac266e7f6cd7d042a667257a';
  const localIdx = commits.findIndex(c => c.sha.startsWith('e2c5e3a'));
  if (localIdx === 0) {
    console.log('\n=== NO NEW REMOTE COMMITS ===');
    return;
  }
  
  if (localIdx === -1) {
    console.log('\n=== LOCAL HEAD NOT FOUND IN REMOTE - histories may have diverged ===');
  } else {
    console.log(`\n=== ${localIdx} NEW COMMITS FROM CURSOR ===`);
  }
  
  // Get the diff/changed files from comparison
  try {
    const { data: comparison } = await octokit.repos.compareCommits({
      owner, repo, base: localHead.slice(0,7), head: 'main'
    });
    console.log(`\n=== CHANGED FILES (${comparison.files.length}) ===`);
    for (const f of comparison.files) {
      console.log(`${f.status.padEnd(10)} ${f.filename}`);
    }
    
    // Download each changed file
    const fs = await import('fs');
    const path = await import('path');
    for (const f of comparison.files) {
      if (f.status === 'removed') {
        console.log(`SKIP REMOVED: ${f.filename}`);
        continue;
      }
      try {
        const { data: fileData } = await octokit.repos.getContent({ owner, repo, path: f.filename, ref: 'main' });
        const content = Buffer.from(fileData.content, 'base64').toString('utf8');
        const dir = path.dirname(f.filename);
        if (dir !== '.') fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(f.filename, content);
        console.log(`UPDATED: ${f.filename} (${content.length} bytes)`);
      } catch (e) {
        console.log(`FAILED: ${f.filename} - ${e.message}`);
      }
    }
  } catch(e) {
    console.log('Compare failed:', e.message);
  }
}

run();
