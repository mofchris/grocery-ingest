import { PassThrough } from 'node:stream';

import type { RawFood } from '../products/types.ts';

export async function* readBrandedFoods(path: string): AsyncGenerator<RawFood> {
  const yauzl = await import('yauzl');
  const { parser: makeParser } = (await import('stream-json')).default;
  const { pick } = (await import('stream-json/filters/Pick.js')).default;
  const { streamArray } = (await import('stream-json/streamers/StreamArray.js')).default;
  const zip = await new Promise<import('yauzl').ZipFile>((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true }, (error, file) => error || !file ? reject(error ?? new Error('Unable to open ZIP')) : resolve(file));
  });
  try {
    const entry = await new Promise<import('yauzl').Entry>((resolve, reject) => {
      const onEntry = (candidate: import('yauzl').Entry) => {
        if (/\.json$/i.test(candidate.fileName) && !candidate.fileName.endsWith('/')) resolve(candidate);
        else zip.readEntry();
      };
      zip.once('error', reject);
      zip.on('entry', onEntry);
      zip.once('end', () => reject(new Error('Snapshot ZIP contains no JSON file')));
      zip.readEntry();
    });
    const entryStream = await new Promise<NodeJS.ReadableStream>((resolve, reject) => {
      zip.openReadStream(entry, (error, stream) => error || !stream ? reject(error ?? new Error('Unable to read ZIP entry')) : resolve(stream));
    });
    const output = new PassThrough({ objectMode: true });
    const parser = makeParser();
    const picker = pick({ filter: 'BrandedFoods' });
    const array = streamArray();
    entryStream.pipe(parser).pipe(picker).pipe(array).pipe(output);
    for await (const item of output as AsyncIterable<{ value: RawFood }>) yield item.value;
  } finally {
    zip.close();
  }
}
