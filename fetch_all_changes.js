import { Octokit } from '@octokit/rest'
import fs from 'fs'
import path from 'path'

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

async function getTree(octokit, owner, repo, sha, prefix = '') {
  const { data } = await octokit.git.getTree({ owner, repo, tree_sha: sha });
  let files = [];
  for (const item of data.tree) {
    const fullPath = prefix ? `${prefix}/${item.path}` : item.path;
    if (item.type === 'tree') {
      const subFiles = await getTree(octokit, owner, repo, item.sha, fullPath);
      files = files.concat(subFiles);
    } else if (item.type === 'blob') {
      files.push({ path: fullPath, sha: item.sha, size: item.size });
    }
  }
  return files;
}

async function run() {
  const token = await getAccessToken();
  const octokit = new Octokit({ auth: token });
  const owner = 'Trelinder';
  const repo = 'Mathscript';

  const branch = process.argv[2] || 'main';
  const { data: ref } = await octokit.git.getRef({ owner, repo, ref: `heads/${branch}` });
  const commitSha = ref.object.sha;
  const { data: commit } = await octokit.git.getCommit({ owner, repo, commit_sha: commitSha });
  const treeSha = commit.tree.sha;

  const remoteFiles = await getTree(octokit, owner, repo, treeSha);
  
  let updated = 0;
  let skipped = 0;
  const skipPaths = ['node_modules', '.git', '__pycache__', '.cache', 'dist', '.replit', 'replit.nix', '.config'];
  
  for (const rf of remoteFiles) {
    if (skipPaths.some(d => rf.path === d || rf.path.startsWith(d + '/'))) { skipped++; continue; }
    if (rf.size > 500000) { skipped++; continue; }
    
    let localContent = null;
    try { localContent = fs.readFileSync(rf.path, 'utf8'); } catch(e) {}
    
    try {
      const { data: blob } = await octokit.git.getBlob({ owner, repo, file_sha: rf.sha });
      const remoteContent = Buffer.from(blob.content, 'base64').toString('utf8');
      
      if (localContent !== remoteContent) {
        const dir = path.dirname(rf.path);
        if (dir !== '.') fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(rf.path, remoteContent);
        console.log('UPDATED: ' + rf.path);
        updated++;
      } else {
        skipped++;
      }
    } catch(e) {
      console.log('FAILED: ' + rf.path + ' - ' + e.message);
    }
  }
  
  console.log('\nDone. Updated: ' + updated + ', Unchanged: ' + skipped);
}

run();
