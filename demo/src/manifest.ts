/**
 * Print the demo's tool manifest as JSON: every application, its groups, its
 * tools with their input schemas, and the lifecycle steps and release decisions each declares. The
 * documentation site runs this during its sync step and renders the result
 * as the tool reference, so the reference can never drift from the code.
 *
 *   pnpm --dir demo manifest > tools.json
 */
import { manifest } from './server.js';

process.stdout.write(`${JSON.stringify(manifest(), null, 2)}\n`);
