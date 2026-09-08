import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Calculate deterministic port based on project name using @gkucmierz/dport SHA-256 algorithm.
 * Follows Rule 3.3: Mathematical Precision with explicit BigInt coercion.
 *
 * @param {string} name - Project identifier or name
 * @param {object} [options] - Optional configuration { offset: number }
 * @returns {number} Deterministic port in range [1024, 65535]
 */
export function getDeterministicPort(name, options = {}) {
  const maxPorts = 65535;
  const systemPorts = 1024;
  const availablePorts = maxPorts - systemPorts;

  const hash = crypto.createHash('sha256').update(name).digest('hex');
  const hashInt = BigInt('0x' + hash);
  const port = Number((hashInt % BigInt(availablePorts)) + BigInt(systemPorts));

  const offset = options.offset || 0;
  return port + offset;
}

/**
 * Sanitize a project name into a clean RFC 1123 compliant subdomain label.
 * Removes npm scope (e.g. @gkucmierz/), non-alphanumerics, and leading/trailing dashes.
 *
 * @param {string} name - Raw project name
 * @returns {string} Sanitized subdomain string
 */
export function sanitizeSubdomain(name) {
  return name
    .toLowerCase()
    .replace(/^@[^/]+\//, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

/**
 * Read the "name" field from package.json in the current working directory.
 *
 * @returns {string|null} Package name if present and valid, otherwise null.
 */
export function readCurrentPackageName() {
  try {
    const pkgPath = path.resolve(process.cwd(), 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg && typeof pkg.name === 'string' && pkg.name.trim()) {
        return pkg.name.trim();
      }
    }
  } catch {
    // Non-fatal fallback if package.json cannot be read or parsed
  }
  return null;
}
