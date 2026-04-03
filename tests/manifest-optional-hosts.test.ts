import { describe, expect, test } from 'vitest';

// @ts-expect-error mjs module
import { createManifest } from '../scripts/manifest-config.mjs';

describe('manifest optional host permissions', () => {
  test('为运行时 provider 授权声明 optional_host_permissions', () => {
    const manifest = createManifest();

    expect(manifest.optional_host_permissions).toEqual(
      expect.arrayContaining(['https://*/*', 'http://*/*'])
    );
  });
});
