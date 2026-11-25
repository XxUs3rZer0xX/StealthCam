import { promises as fs } from 'fs';
import path from 'path';

// Persistent store of a user's phone push tokens (FCM registration tokens),
// keyed by userId. One user can have several devices, so each maps to a set of
// tokens with the time we last saw them. Kept in a small JSON file next to the
// project (gitignored) so it survives across the socket server and API routes.
//
// Shape: { "<userId>": { "<fcmToken>": <lastSeenMs> } }

const TOKENS_FILE = path.join(process.cwd(), 'push-tokens.json');

type TokenStore = Record<string, Record<string, number>>;

// Serialize read-modify-write so concurrent registrations don't clobber each
// other. Home-scale traffic, so a simple in-process promise chain is plenty.
let writeChain: Promise<void> = Promise.resolve();

async function readStore(): Promise<TokenStore> {
  try {
    const raw = await fs.readFile(TOKENS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as TokenStore) : {};
  } catch {
    return {};
  }
}

async function writeStore(store: TokenStore): Promise<void> {
  await fs.writeFile(TOKENS_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function mutate(fn: (store: TokenStore) => void): Promise<void> {
  writeChain = writeChain.then(async () => {
    const store = await readStore();
    fn(store);
    await writeStore(store);
  }).catch((err) => {
    console.error('pushTokens write error:', err);
  });
  return writeChain;
}

/** Record (or refresh) a push token for a user. */
export function addToken(userId: string, token: string): Promise<void> {
  if (!userId || !token) return Promise.resolve();
  return mutate((store) => {
    store[userId] = store[userId] || {};
    store[userId][token] = Date.now();
  });
}

/** Forget specific tokens for a user (on logout, or when FCM says they're dead). */
export function removeTokens(userId: string, tokens: string[]): Promise<void> {
  if (!userId || tokens.length === 0) return Promise.resolve();
  return mutate((store) => {
    const bag = store[userId];
    if (!bag) return;
    for (const t of tokens) delete bag[t];
    if (Object.keys(bag).length === 0) delete store[userId];
  });
}

/** All current push tokens for a user. */
export async function getTokens(userId: string): Promise<string[]> {
  if (!userId) return [];
  const store = await readStore();
  return Object.keys(store[userId] || {});
}
