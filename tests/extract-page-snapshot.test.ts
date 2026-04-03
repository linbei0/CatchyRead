import { JSDOM } from 'jsdom';
import { describe, expect, test } from 'vitest';

import { extractPageSnapshot } from '@/lib/extract/pageSnapshot';

const html = `
<!doctype html>
<html lang="zh-CN">
  <head>
    <title>如何用 Bun 构建 CLI</title>
  </head>
  <body>
    <header>
      <nav>首页 / 文章 / 登录</nav>
    </header>
    <main>
      <article>
        <h1>如何用 Bun 构建 CLI</h1>
        <p>这篇教程会带你从零开始搭一个命令行工具。</p>
        <p>先安装 Bun，然后初始化项目目录。</p>
        <pre><code class="language-bash">bun init
bun add commander</code></pre>
        <blockquote>注意：Windows 用户需要先更新终端编码。</blockquote>
      </article>
    </main>
    <footer>相关推荐 / 版权声明 / 广告</footer>
  </body>
</html>
`;

describe('extractPageSnapshot', () => {
  test('提取正文块并过滤导航与页脚噪音', () => {
    const dom = new JSDOM(html, { url: 'https://example.com/tutorial' });

    const snapshot = extractPageSnapshot(dom.window.document);

    expect(snapshot.title).toBe('如何用 Bun 构建 CLI');
    expect(snapshot.structuredBlocks.map((item) => item.type)).toEqual([
      'heading',
      'paragraph',
      'paragraph',
      'code',
      'quote'
    ]);
    expect(snapshot.structuredBlocks.some((item) => item.text.includes('首页'))).toBe(false);
    expect(snapshot.structuredBlocks.some((item) => item.text.includes('广告'))).toBe(false);
    expect(snapshot.structuredBlocks[3]?.sourceElementId).toBeTruthy();
  });
});
