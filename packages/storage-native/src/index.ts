/**
 * @guideforge/storage-native — Tauri filesystem + secure-store adapters.
 *
 * The desktop shell runs the SAME apps/web application; these adapters let
 * the web layer use native filesystem projects, secure credential storage,
 * and background workers when running inside Tauri. The interface mirrors the
 * browser AssetStore so the app code stays engine-neutral.
 */
import type { ContentHash } from '@guideforge/domain';

export interface NativeAssetStore {
  put(
    bytes: Uint8Array,
    mimeType: string,
    extension: string,
  ): Promise<{ hash: ContentHash; sizeBytes: number }>;
  get(hash: ContentHash): Promise<Uint8Array | null>;
}

/**
 * Native filesystem-backed content-addressed store.
 * `readFile`/`writeFile` are injected so this package stays testable outside
 * Tauri and the real Tauri plugin is wired in the desktop shell.
 */
export class NativeFsAssetStore implements NativeAssetStore {
  constructor(
    private readonly dir: string,
    private readonly io: {
      writeFile: (path: string, bytes: Uint8Array) => Promise<void>;
      readFile: (path: string) => Promise<Uint8Array>;
      sha256Hex: (bytes: Uint8Array) => Promise<string>;
    },
  ) {}

  async put(bytes: Uint8Array, _mimeType: string, _extension: string) {
    const hash = (await this.io.sha256Hex(bytes)) as ContentHash;
    await this.io.writeFile(`${this.dir}/${hash}`, bytes);
    return { hash, sizeBytes: bytes.length };
  }

  async get(hash: ContentHash): Promise<Uint8Array | null> {
    try {
      return await this.io.readFile(`${this.dir}/${hash}`);
    } catch {
      return null;
    }
  }
}

export interface SecureCredential {
  service: string;
  account: string;
  value: string;
}

/** Secure credential store abstraction (Tauri keychain / OS keyring). */
export interface CredentialStore {
  set(credential: SecureCredential): Promise<void>;
  get(service: string, account: string): Promise<string | null>;
  delete(service: string, account: string): Promise<void>;
}

/** In-memory credential store for tests and non-Tauri environments. */
export class MemoryCredentialStore implements CredentialStore {
  private readonly map = new Map<string, string>();

  set(c: SecureCredential): Promise<void> {
    this.map.set(`${c.service}:${c.account}`, c.value);
    return Promise.resolve();
  }

  get(service: string, account: string): Promise<string | null> {
    return Promise.resolve(this.map.get(`${service}:${account}`) ?? null);
  }

  delete(service: string, account: string): Promise<void> {
    this.map.delete(`${service}:${account}`);
    return Promise.resolve();
  }
}

export interface NativeProjectHandle {
  rootDir: string;
  assetStore: NativeAssetStore;
  credentials: CredentialStore;
}
