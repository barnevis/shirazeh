// Static fixture server for the browser spikes. Serves the fixtures directory
// under several mounts so each spike can exercise subpath deployment, target
// CSP policies and a throttled stylesheet against the exact same files:
//   /spike/assets/              baseline deployment subpath
//   /spike-csp/assets/          subpath + a plausible target CSP (default-src 'self')
//   /spike-throttled/assets/    subpath + stylesheets delayed to simulate a slow network
//   /pkg/                       the kit root, so fixtures import the real contracts
import { createReadStream, realpathSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// The roots are resolved through realpath once, so the containment check below
// compares like-for-like resolved paths and can detect a symlink that points
// outside the served directory.
const ROOT = realpathSync(fileURLToPath(new URL('../..', import.meta.url)));
const FIXTURES = realpathSync(fileURLToPath(new URL('fixtures', import.meta.url)));

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

const CSP = "default-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'";
const STYLESHEET_DELAY_MS = 700;

// Every mount resolves paths inside one of the two allowed roots. The candidate
// is realpath-resolved and re-checked against its (also resolved) root, so a
// traversal (../ or an encoded variant) or a symlink pointing outside the
// served directory can never escape it. relative() never returns an absolute
// path, so containing rel (not ".."-prefixed) is a complete containment check.
function isWithin(root, candidate) {
  let resolved;
  try {
    resolved = realpathSync(candidate);
  } catch {
    return false;
  }
  const rel = relative(root, resolved);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`));
}

function fileFor(urlPath) {
  if (urlPath.startsWith('/spike/assets/')) {
    return { root: FIXTURES, path: fileURLToPath(new URL(`./${urlPath.slice('/spike/assets/'.length)}`, new URL(`file://${FIXTURES}/`))), headers: {} };
  }
  if (urlPath.startsWith('/spike-csp/assets/')) {
    return { root: FIXTURES, path: fileURLToPath(new URL(`./${urlPath.slice('/spike-csp/assets/'.length)}`, new URL(`file://${FIXTURES}/`))), headers: { 'Content-Security-Policy': CSP } };
  }
  if (urlPath.startsWith('/spike-throttled/assets/')) {
    return {
      root: FIXTURES,
      path: fileURLToPath(new URL(`./${urlPath.slice('/spike-throttled/assets/'.length)}`, new URL(`file://${FIXTURES}/`))),
      headers: {},
      delayMs: STYLESHEET_DELAY_MS,
    };
  }
  if (urlPath.startsWith('/pkg/')) {
    return { root: ROOT, path: fileURLToPath(new URL(`./${urlPath.slice('/pkg/'.length)}`, new URL(`file://${ROOT}/`))), headers: {} };
  }
  return null;
}

export async function startSpikeServer(port = 0) {
  const counters = {};
  const server = createServer((req, res) => {
    let pathname;
    try {
      pathname = new URL(req.url, 'http://localhost').pathname;
    } catch {
      res.writeHead(400).end('bad request');
      return;
    }
    counters[pathname] = (counters[pathname] ?? 0) + 1;
    // Path resolution must never escape the handler: a traversal, a symlink
    // escape, or a malformed/percent-encoded URL is answered with a 404
    // instead of crashing the request.
    let target;
    try {
      target = fileFor(pathname);
      if (!target || !isWithin(target.root, target.path)) throw new Error('path outside the served root');
    } catch {
      res.writeHead(404).end('not found');
      return;
    }
    const respond = () => {
      stat(target.path).then(
        (info) => {
          if (!info.isFile()) throw new Error('not a file');
          const type = CONTENT_TYPES[target.path.slice(target.path.lastIndexOf('.'))] ?? 'application/octet-stream';
          // Cacheable like a real deployment, so the spike measures real caching
          // behavior (a fresh link with the same href must not refetch).
          res.writeHead(200, {
            'Content-Type': type,
            'Cache-Control': 'public, max-age=3600',
            ...target.headers,
          });
          createReadStream(target.path).pipe(res);
        },
        () => res.writeHead(404).end('not found'),
      );
    };
    // The throttled mount delays stylesheets to reproduce the slow-network
    // moment between an element being inserted and its style being applied.
    if (target.delayMs && target.path.endsWith('.css')) {
      setTimeout(respond, target.delayMs);
    } else {
      respond();
    }
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  const { port: boundPort } = server.address();
  return { base: `http://127.0.0.1:${boundPort}`, counters, close: () => new Promise((resolve) => server.close(resolve)) };
}
