import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const pkg = require(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json')) as {
  version?: string;
};

export const PACKAGE_VERSION = pkg.version ?? '0.0.0';
