import { describe, expect, test } from 'vitest';

// @ts-expect-error mjs module for build config
import { createManifest } from '../scripts/manifest-config.mjs';

describe('createManifest', () => {
  test('阶段一后使用 activeTab + scripting，而不是全站常驻 content scripts', () => {
    const manifest = createManifest();

    expect(manifest.permissions).toEqual(expect.arrayContaining(['activeTab', 'scripting', 'storage', 'tabs']));
    expect(manifest.content_scripts).toBeUndefined();
    expect(manifest.host_permissions).toBeUndefined();
  });
});
