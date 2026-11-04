import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('@next/env').loadEnvConfig(process.cwd(), true);
const embedded = {
  base: process.env.AI_BASE_URL?.trim() || 'https://api.deepseek.com',
  model: process.env.AI_MODEL?.trim() || 'deepseek-flash',
  key: process.env.AI_API_KEY?.trim() || '',
};
if (process.env.PAGES_REQUIRE_KEY === 'true' && !embedded.key) {
  throw new Error('Set the AI_API_KEY repository secret before deploying Pages.');
}
if (embedded.key && (!embedded.base || !embedded.model)) throw new Error('Incomplete model configuration');
await mkdir('dist', { recursive: true });
// Intentionally public in the static deployment; never log these values.
await writeFile('dist/config.js', `export const embeddedConfig = ${JSON.stringify(embedded)};\n`);
for (const file of ['index.html', 'app.js', 'style.css']) await copyFile(`static/${file}`, `dist/${file}`);
for (const file of ['types', 'safety']) {
  const source = await readFile(`src/lib/${file}.ts`, 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020 } }).outputText.replace('"./types"', '"./types.js"');
  await writeFile(`dist/${file}.js`, js);
}
const ai = await readFile('src/lib/ai.ts', 'utf8');
const policy = ai.match(/const CHILD_POLICY = `([\s\S]*?)`;/)?.[1];
if (!policy) throw new Error('Cannot find child dialogue policy');
await writeFile('dist/policy.js', `export const policy = ${JSON.stringify(policy.replace('真实保存结果由服务端补充', '保存结果由网页补充'))};\n`);
await writeFile('dist/.nojekyll', '');
console.log('GitHub Pages files ready in dist/');
