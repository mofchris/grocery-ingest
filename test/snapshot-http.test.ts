import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { downloadSnapshot } from '../src/sources/snapshot.ts';

test('downloadSnapshot streams 200 and preserves cache on conditional 304', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'grocery-ingest-http-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let requests = 0;
  const server = createServer((request, response) => {
    requests++;
    if (request.headers['if-none-match'] === '"v1"') {
      response.writeHead(304, { ETag: '"v1"' });
      response.end();
      return;
    }
    response.writeHead(200, {
      'Content-Type': 'application/zip', ETag: '"v1"', 'Last-Modified': 'Thu, 24 Apr 2025 00:00:00 GMT',
    });
    response.end(Buffer.from('fixture zip bytes'));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const url = `http://127.0.0.1:${address.port}/snapshot.zip`;

  const first = await downloadSnapshot(url, join(directory, 'snapshot.zip'));
  assert.equal(first.status, 'downloaded');
  assert.equal(first.httpStatus, 200);
  assert.equal(first.bytesDownloaded, 17);
  assert.equal(await readFile(first.path!, 'utf8'), 'fixture zip bytes');

  const second = await downloadSnapshot(url, join(directory, 'snapshot.zip'), { etag: first.etag, lastModified: first.lastModified });
  assert.equal(second.status, 'not_modified');
  assert.equal(second.httpStatus, 304);
  assert.equal(second.bytesDownloaded, 0);
  assert.equal(await readFile(first.path!, 'utf8'), 'fixture zip bytes');
  assert.equal(requests, 2);
});

test('downloadSnapshot replaces an existing cache file after a changed 200 response', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'grocery-ingest-replace-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const destination = join(directory, 'snapshot.zip');
  await writeFile(destination, 'old bytes');
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/zip', ETag: '"v2"' });
    response.end('new bytes');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const result = await downloadSnapshot(`http://127.0.0.1:${address.port}/snapshot.zip`, destination, { etag: '"v1"' });
  assert.equal(result.status, 'downloaded');
  assert.equal(await readFile(destination, 'utf8'), 'new bytes');
});

// Mirrors the real USDA setup: two load-balanced nginx backends, same bytes, different ETags.
test('downloadSnapshot sends every known ETag and reports a stable sha256 across backends', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'grocery-ingest-etags-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let backend = 0;
  const server = createServer((request, response) => {
    const etag = backend++ % 2 === 0 ? '"backend-a"' : '"backend-b"';
    const sent = String(request.headers['if-none-match'] ?? '').split(',').map((value) => value.trim());
    if (sent.includes(etag)) {
      response.writeHead(304, { ETag: etag });
      response.end();
      return;
    }
    response.writeHead(200, { 'Content-Type': 'application/zip', ETag: etag });
    response.end(Buffer.from('identical bytes'));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const url = `http://127.0.0.1:${address.port}/snapshot.zip`;

  const a = await downloadSnapshot(url, join(directory, 'snapshot.zip'));
  const b = await downloadSnapshot(url, join(directory, 'snapshot.zip'), { knownEtags: [a.etag!] });
  assert.equal(b.status, 'downloaded');
  assert.notEqual(b.etag, a.etag);
  assert.equal(b.sha256, a.sha256);
  const third = await downloadSnapshot(url, join(directory, 'snapshot.zip'), { knownEtags: [a.etag!, b.etag!] });
  const fourth = await downloadSnapshot(url, join(directory, 'snapshot.zip'), { knownEtags: [a.etag!, b.etag!] });
  assert.equal(third.status, 'not_modified');
  assert.equal(fourth.status, 'not_modified');
});
