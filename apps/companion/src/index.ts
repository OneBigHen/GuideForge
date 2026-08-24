export { CompanionDatabase } from './db.js';
export {
  ARGON2_OPTIONS,
  SecretBox,
  hashCredential,
  isArgon2idHash,
  sha256Hex,
  verifyCredential,
} from './security.js';
export {
  assertTransportConfig,
  buildServer,
  defaultDataDir,
  isLoopbackHost,
  isSessionActive,
  startCompanion,
} from './server.js';
