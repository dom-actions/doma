// Run: node --import tsx scripts/test-chat-markdown.ts
// Exercise the actual shared prepare + marked pipeline used by final and streaming replies.
// DOMPurify and browser-only final wrappers are deliberately outside these Node checks.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { resolve } from 'node:path';

const bundled = await build({
  stdin: {
    contents: `export { ChatMarkdownRenderer } from './src/services/chat/ChatMarkdownRenderer.ts';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  logLevel: 'silent',
  alias: { '@': resolve('src') },
  banner: {
    js: `import {createRequire} from 'node:module';const require=createRequire(${JSON.stringify(resolve('package.json'))});`,
  },
});
const { ChatMarkdownRenderer } = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`
);
const renderer = new ChatMarkdownRenderer();
const render = (source: string): string => renderer.renderMarkdownBlockHtml(source);
const links = (html: string) => Array.from(
  html.matchAll(/<a\b[^>]*\bhref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g),
  ([, href, text]) => ({ href, text }),
);
const plainText = (html: string) => html.replace(/<[^>]+>/g, '');
const url = 'https://x.com/NiallxYoung/status/2101485716286865803';
const marker = 'DOMA_POST_INTERRUPTION_READY_20261013';
let checks = 0;
function check(name: string, run: () => void) {
  run();
  checks++;
  console.log(`PASS ${name}`);
}

check('bare URL keeps its exact destination and following acceptance marker outside the link', () => {
  const html = render(`Title: X\nURL: ${url}\n${marker}`);
  assert.deepEqual(links(html), [{ href: url, text: url }]);
  assert.match(html, new RegExp(`</a><br>\\s*${marker}`));
  assert.match(html, /Title: X<br>URL:/);
});

check('a following Chinese line stays outside a bare URL and starts on a new line', () => {
  const html = render(`${url}\n本轮等待已完成。`);
  assert.deepEqual(links(html), [{ href: url, text: url }]);
  assert.match(html, /<\/a><br>\s*本轮等待已完成。/);
});

check('separate bare URL lines remain separate exact links', () => {
  const other = 'https://example.com/docs?topic=chat';
  const html = render(`${url}\n${other}`);
  assert.deepEqual(links(html), [{ href: url, text: url }, { href: other, text: other }]);
  assert.match(html, /<\/a><br>\s*<a\b/);
});

check('a bare URL between independent markdown links ends before the following line', () => {
  const bare = 'https://example.test/';
  const html = render(`[前文](https://previous.test/)\n${bare}\nMARKER\n[后文](https://next.test/)`);
  assert.deepEqual(links(html), [
    { href: 'https://previous.test/', text: '前文' },
    { href: bare, text: bare },
    { href: 'https://next.test/', text: '后文' },
  ]);
  assert.match(html, /<\/a><br>\s*MARKER/);
});

check('an ASCII soft wrap preserves the space between words', () => {
  assert.equal(plainText(render('Hello\nworld')), 'Hello world\n');
});

check('a Chinese soft wrap retains compact prose without an inserted space', () => {
  assert.equal(plainText(render('甲\n乙')), '甲乙\n');
});

check('existing markdown links are not double wrapped or retargeted', () => {
  const html = render(`[原文](${url})\n继续阅读`);
  assert.deepEqual(links(html), [{ href: url, text: '原文' }]);
  assert.ok(plainText(html).includes('原文继续阅读'));
});

check('a multiline markdown link destination keeps its label and exact single link', () => {
  const html = render('链接 [名称](\nhttps://example.com/\n)');
  assert.deepEqual(links(html), [{ href: 'https://example.com/', text: '名称' }]);
});

check('a URL in a multiline markdown label does not replace the actual destination', () => {
  const html = render('[\nhttps://example.com/\n](https://example.org/target)');
  assert.deepEqual(links(html), [{ href: 'https://example.org/target', text: 'https://example.com/' }]);
});

check('closed nested brackets before a label URL do not end the enclosing label', () => {
  const html = render('[说明 [子项] https://example.com/](https://example.org/target)');
  assert.deepEqual(links(html), [{
    href: 'https://example.org/target', text: '说明 [子项] https://example.com/',
  }]);
});

check('escaped label brackets keep the URL inside its enclosing markdown link', () => {
  const before = render('[说明 \\] https://example.com/](https://example.org/target)');
  assert.deepEqual(links(before), [{
    href: 'https://example.org/target', text: '说明 ] https://example.com/',
  }]);
  const after = render('[https://example.com/ \\[说明](https://example.org/target)');
  assert.deepEqual(links(after), [{
    href: 'https://example.org/target', text: 'https://example.com/ [说明',
  }]);
});

check('a URL in multiline image alt text remains an image with its original source', () => {
  const html = render('![\nhttps://example.com/\n](https://example.org/a.png)');
  assert.equal(links(html).length, 0);
  assert.match(html, /<img\b[^>]*src="https:\/\/example\.org\/a\.png"[^>]*alt="https:\/\/example\.com\/"/);
});

check('a URL inside a compound inline-code instruction remains literal code', () => {
  const html = render(`运行 \`fetch ${url}\` 后返回。`);
  assert.equal(links(html).length, 0);
  assert.ok(html.includes(`<code>fetch ${url}</code>`));
});

check('a multiline inline-code instruction keeps one code span without an autolink', () => {
  const html = render('`fetch https://example.com/\nnext`');
  assert.equal(links(html).length, 0);
  assert.equal((html.match(/<code>/g) ?? []).length, 1);
  assert.match(html, /<code>fetch https:\/\/example\.com\/[ ]?next<\/code>/);
});

check('matching double backtick code delimiters protect a multiline URL', () => {
  const html = render('``fetch https://example.com/\nnext``');
  assert.equal(links(html).length, 0);
  assert.equal((html.match(/<code>/g) ?? []).length, 1);
  assert.match(html, /<code>fetch https:\/\/example\.com\/ ?next<\/code>/);
});

const videoSeekUrl = 'doma://video/seek?seconds=125';
const assertVideoSeekButton = (source: string) => {
  const html = render(source);
  assert.match(html, /<button\b[^>]*data-doma-href="doma:\/\/video\/seek\?seconds=125"/);
};

check('an unmatched double backtick does not hide a following video seek link', () => {
  assertVideoSeekButton(`Type ${'``'} then click ${videoSeekUrl}`);
});

check('an unmatched single backtick does not hide a following video seek link', () => {
  assertVideoSeekButton(`Type ${'`'} then click ${videoSeekUrl}`);
});

check('a different delimiter length does not close an unmatched backtick run', () => {
  assertVideoSeekButton(`Type ${'``'} then click ${videoSeekUrl} ${'`'}`);
});

check('an unmatched longer run does not hide a later closed shorter code span', () => {
  const html = render(`Type ${'``'} then ${'`'}fetch ${videoSeekUrl} next${'`'}`);
  assert.match(html, /<code>fetch doma:\/\/video\/seek\?seconds=125 next<\/code>/);
  assert.doesNotMatch(html, /data-doma-href/);
});

check('a closed multiline code span protects a video seek URL despite a shorter inner run', () => {
  const html = render(`${'``'}fetch ${'`'} ${videoSeekUrl}\nnext${'``'}`);
  assert.match(html, /<code>fetch ` doma:\/\/video\/seek\?seconds=125 next<\/code>/);
  assert.doesNotMatch(html, /data-doma-href/);
});

check('a video seek URL after a closed code span remains an actionable link', () => {
  assertVideoSeekButton(`${'``'}fetch\nnext${'``'} then click ${videoSeekUrl}`);
});

check('an escaped backtick does not hide a following bare URL boundary', () => {
  const html = render(`\\\` ${url}\n${marker}`);
  assert.deepEqual(links(html), [{ href: url, text: url }]);
  assert.match(html, new RegExp(`</a><br>\\s*${marker}`));
});

check('the existing standalone URL codespan behavior keeps an exact link', () => {
  assert.deepEqual(links(render(`\`${url}\``)), [{ href: url, text: url }]);
});

check('fenced code preserves internal whitespace and does not autolink its URL', () => {
  const code = `const rows = [\n  1,\n    2,\n];\n// ${url}\n// ${marker}`;
  const html = render(`\`\`\`javascript\n${code}\n\`\`\``);
  assert.ok(html.includes(`<code class="language-javascript">${code}</code>`));
  assert.equal(links(html).length, 0);
});

check('headings remain separate markdown blocks', () => {
  const html = render('介绍\n## 小标题\n内容');
  assert.match(html, /<h2>小标题<\/h2>/);
  assert.ok(plainText(html).includes('介绍'));
  assert.ok(plainText(html).includes('内容'));
});

check('unordered and ordered lists retain their list structure', () => {
  const html = render('- 甲\n- 乙\n1. 丙\n2. 丁');
  assert.match(html, /<ul>/);
  assert.match(html, /<ol>/);
  assert.equal((html.match(/<li>/g) ?? []).length, 4);
});

check('GFM table header and body are still rendered as a table', () => {
  const html = render('| 项目 | 状态 |\n| --- | --- |\n| 请求 | 完成 |');
  assert.match(html, /<table>/);
  assert.match(html, /<th>项目<\/th>/);
  assert.match(html, /<td>完成<\/td>/);
});

console.log(`Chat markdown checks passed (${checks} groups; browser sanitization and visual layout not covered).`);
