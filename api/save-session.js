export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  let body;
  try { body = await req.json(); } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const { entry, pat, inventoryChanges, npcChanges } = body;
  if (!entry || !pat) return json({ error: 'Missing entry or pat' }, 400);

  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || 'main';
  if (!repo) return json({ error: 'GITHUB_REPO not configured on server' }, 500);

  const apiBase = `https://api.github.com/repos/${repo}/contents`;
  const ghHeaders = {
    'Authorization': `token ${pat}`,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'User-Agent': 'dnd-tracker',
  };

  const filePaths = ['data/journal.json'];
  if (inventoryChanges) filePaths.push('data/inventory.json');
  if (npcChanges) filePaths.push('data/npcs.json');

  try {
    // GET all needed files in parallel
    const getResults = await Promise.all(
      filePaths.map(path =>
        fetch(`${apiBase}/${path}?ref=${branch}`, { headers: ghHeaders }).then(async r => {
          if (!r.ok) throw new Error(`GitHub GET ${path}: ${r.status}`);
          return r.json();
        })
      )
    );

    const fileMap = {};
    for (let i = 0; i < filePaths.length; i++) {
      const { content: b64, sha } = getResults[i];
      const bytes = Uint8Array.from(atob(b64.replace(/\n/g, '')), c => c.charCodeAt(0));
      fileMap[filePaths[i]] = { data: JSON.parse(new TextDecoder().decode(bytes)), sha };
    }

    // Apply changes and commit sequentially to avoid conflicts
    const journalData = fileMap['data/journal.json'];
    const updatedJournal = [entry, ...journalData.data.filter(e => e.day !== entry.day)];
    await commitFile(apiBase, ghHeaders, 'data/journal.json', updatedJournal, journalData.sha, branch,
      `Сесія: день ${entry.day}${entry.location ? ' — ' + entry.location : ''}`);

    if (inventoryChanges) {
      const invData = fileMap['data/inventory.json'];
      const updatedInv = applyInventoryChanges(invData.data, inventoryChanges);
      await commitFile(apiBase, ghHeaders, 'data/inventory.json', updatedInv, invData.sha, branch,
        `Інвентар: сесія день ${entry.day}`);
    }

    if (npcChanges) {
      const npcData = fileMap['data/npcs.json'];
      const updatedNpcs = applyNpcChanges(npcData.data, npcChanges);
      await commitFile(apiBase, ghHeaders, 'data/npcs.json', updatedNpcs, npcData.sha, branch,
        `НПС: сесія день ${entry.day}`);
    }

    return json({ ok: true });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

async function commitFile(apiBase, headers, path, data, sha, branch, message) {
  const jsonStr = JSON.stringify(data, null, 2);
  const outBytes = new TextEncoder().encode(jsonStr);
  let binary = '';
  for (let i = 0; i < outBytes.length; i++) binary += String.fromCharCode(outBytes[i]);
  const encoded = btoa(binary);

  const res = await fetch(`${apiBase}/${path}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ message, content: encoded, sha, branch }),
  });
  if (!res.ok) throw new Error(`GitHub PUT ${path}: ${res.status}: ${await res.text()}`);
}

function applyInventoryChanges(inventory, changes) {
  const { add = [], remove = [], gold_delta = 0 } = changes;
  const removeNames = new Set(remove.map(n => n.toLowerCase()));
  const backpack = [
    ...(inventory.backpack || []).filter(item => !removeNames.has(item.name.toLowerCase())),
    ...add,
  ];
  const wallet = { ...inventory.wallet };
  if (gold_delta !== 0) wallet.gold = (wallet.gold || 0) + gold_delta;
  return { ...inventory, wallet, backpack };
}

function applyNpcChanges(npcs, changes) {
  const { add = [], update = [] } = changes;
  let result = [...npcs];
  for (const upd of update) {
    const idx = result.findIndex(n => n.id === upd.id);
    if (idx !== -1) result[idx] = { ...result[idx], ...upd };
  }
  for (const npc of add) {
    if (!result.find(n => n.id === npc.id)) result.push(npc);
  }
  return result;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
