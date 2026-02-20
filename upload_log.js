import { Octokit } from '@octokit/rest'
import fs from 'fs'

async function getAccessToken() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found');
  }

  const response = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=github',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  );
  
  const data = await response.json();
  const connectionSettings = data.items?.[0];

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings?.settings?.oauth?.credentials?.access_token;
  if (!accessToken) {
    throw new Error('GitHub not connected');
  }
  return accessToken;
}

async function run() {
  try {
    const token = await getAccessToken();
    const octokit = new Octokit({ auth: token });
    
    const user = await octokit.users.getAuthenticated();
    const owner = user.data.login;
    const repo = 'math-quest-logs';
    const path = `logs/quest_log_${Date.now()}.txt`;
    const content = fs.readFileSync('/home/runner/workspace/latest_quest_log.txt', 'utf8');

    // Ensure repo exists or create it
    try {
      await octokit.repos.get({ owner, repo });
    } catch (e) {
      await octokit.repos.createForAuthenticatedUser({ name: repo, private: true });
      // Wait a bit for repo creation to propagate
      await new Promise(r => setTimeout(r, 2000));
    }

    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message: 'Upload Math Quest App logs',
      content: Buffer.from(content).toString('base64'),
    });

    console.log(`LOGS_UPLOADED: https://github.com/${owner}/${repo}/blob/main/${path}`);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

run();
