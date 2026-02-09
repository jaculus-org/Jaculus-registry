import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { green } from 'ansis';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.tar.gz': 'application/gzip',
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderDirectoryListing(pathname: string, entries: fs.Dirent[]): string {
  const normalizedPath = pathname.endsWith('/') ? pathname : `${pathname}/`;
  const parent =
    normalizedPath === '/' ? null : path.posix.dirname(normalizedPath.replace(/\/$/, '')) || '/';

  const items = entries.slice().sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  const links = items
    .map((entry) => {
      const slash = entry.isDirectory() ? '/' : '';
      const href = encodeURIComponent(entry.name) + slash;
      const label = escapeHtml(entry.name + slash);
      return `<li><a href="${href}">${label}</a></li>`;
    })
    .join('');

  const parentLink = parent
    ? `<li><a href="${parent.endsWith('/') ? parent : parent + '/'}">../</a></li>`
    : '';

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Index of ${escapeHtml(normalizedPath)}</title>
  </head>
  <body>
    <h1>Index of ${escapeHtml(normalizedPath)}</h1>
    <ul>
      ${parentLink}
      ${links}
    </ul>
  </body>
</html>`;
}

function streamFile(filePath: string, res: http.ServerResponse) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME_TYPES[ext] ?? 'application/octet-stream';

  res.statusCode = 200;
  res.setHeader('Content-Type', mime);

  const stream = fs.createReadStream(filePath);
  stream.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'ENOENT') {
      res.statusCode = 404;
      res.end('Not found');
    } else {
      console.error('Error reading file:', err);
      res.statusCode = 500;
      res.end('Internal server error');
    }
  });
  stream.pipe(res);
}

export async function serveFolder(fsPath: string, port: number) {
  return new Promise<void>((resolve, reject) => {
    const root = path.resolve(fsPath);

    const server = http.createServer(async (req, res) => {
      // Basic CORS
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
      }

      if (!req.url) {
        res.statusCode = 400;
        res.end('Bad request');
        return;
      }

      const base = `http://${req.headers.host ?? 'localhost'}`;
      const url = new URL(req.url, base);
      const pathname = decodeURIComponent(url.pathname);

      if (pathname.includes('\0')) {
        res.statusCode = 400;
        res.end('Bad request');
        return;
      }

      const target = path.normalize(path.join(root, pathname));

      // Prevent directory traversal
      if (!target.startsWith(root)) {
        res.statusCode = 403;
        res.end('Forbidden');
        return;
      }

      try {
        const stat = await fs.promises.stat(target);

        if (stat.isDirectory()) {
          // Ensure directories end with '/'
          if (!pathname.endsWith('/')) {
            res.statusCode = 301;
            res.setHeader('Location', `${pathname}/`);
            res.end();
            return;
          }

          const entries = await fs.promises.readdir(target, {
            withFileTypes: true,
          });
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(renderDirectoryListing(pathname, entries));
        } else {
          streamFile(target, res);
        }
      } catch (err) {
        const errnoErr = err as NodeJS.ErrnoException;
        if (errnoErr.code === 'ENOENT') {
          res.statusCode = 404;
          res.end('Not found');
        } else {
          console.error('Request error:', err);
          res.statusCode = 500;
          res.end('Internal server error');
        }
      }
    });

    const onListening = () => {
      const addr = server.address();
      const portInfo = typeof addr === 'object' && addr && 'port' in addr ? addr.port : port;
      console.log(`Serving ${fsPath} at ${green(`http://localhost:${portInfo}`)} (Ctrl+C to stop)`);
    };

    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };

    const onSigint = () => {
      console.log('\nReceived Ctrl+C (SIGINT), shutting down server…');
      server.close(() => {
        console.log('Server stopped.');
        cleanup();
        resolve();
      });
    };

    const cleanup = () => {
      process.removeListener('SIGINT', onSigint);
      server.removeListener('listening', onListening);
      server.removeListener('error', onError);
    };

    server.on('listening', onListening);
    server.on('error', onError);
    process.on('SIGINT', onSigint);

    server.listen(port);
  });
}
