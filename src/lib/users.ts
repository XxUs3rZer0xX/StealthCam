import { promises as fs } from 'fs';
import path from 'path';

// Persistent user store. Previously users lived in a module-level object, which
// meant every server restart (or dev hot-reload) wiped all accounts — then the
// first login silently re-created the account with whatever password was typed,
// so the two devices could never agree on credentials. Persisting to a small
// JSON file (gitignored) makes a password stable: set once, works forever.
//
// Shape: { "<userId>": { id, username, password(bcrypt hash) } }

const USERS_FILE = path.join(process.cwd(), 'users.json');

export interface StoredUser {
  id: string;
  username: string;
  password: string; // bcrypt hash
}

// Serialize writes so two near-simultaneous registrations don't clobber.
let writeChain: Promise<void> = Promise.resolve();

async function readAll(): Promise<Record<string, StoredUser>> {
  try {
    const raw = await fs.readFile(USERS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, StoredUser>) : {};
  } catch {
    return {};
  }
}

/** Find a user by their (case-sensitive) username, or null. */
export async function findUserByUsername(username: string): Promise<StoredUser | null> {
  const all = await readAll();
  return Object.values(all).find((u) => u.username === username) || null;
}

/** Persist a new user. */
export function createUser(user: StoredUser): Promise<void> {
  writeChain = writeChain
    .then(async () => {
      const all = await readAll();
      all[user.id] = user;
      await fs.writeFile(USERS_FILE, JSON.stringify(all, null, 2), 'utf8');
    })
    .catch((err) => {
      console.error('users write error:', err);
    });
  return writeChain;
}
