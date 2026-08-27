import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { getTypeScriptSettings } from '../../typescript.js';

it('Normalizes absolute rootDir/outDir into relative paths with a "./" prefix', () => {
  // Use an OS temp dir so we can place a tsconfig that points at machine-local
  // absolute paths without checking those paths into the repo.
  const tempDir = mkdtempSync(join(tmpdir(), 'import-integrity-ts-absolute-'));
  try {
    const absoluteSrc = join(tempDir, 'src');
    const absoluteDist = join(tempDir, 'dist');
    mkdirSync(absoluteSrc);
    writeFileSync(
      join(tempDir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          rootDir: absoluteSrc,
          outDir: absoluteDist,
        },
      })
    );

    const result = getTypeScriptSettings(tempDir, []);

    expect(result.mapping).toEqual({
      rootDir: './src',
      outDir: './dist',
    });
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
