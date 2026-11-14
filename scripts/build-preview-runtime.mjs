// Build trusted preview dependencies from this checkout's npm lock, never from a project.
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {mkdir, copyFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'browser-sidecar', '.preview-runtime');
await mkdir(output, {recursive: true});
for (const [entry, name] of [['react', 'react'], ['react/jsx-runtime', 'react-jsx-runtime'],
  ['react-dom/client', 'react-dom-client'], ['three', 'three']]) {
  const source = entry === 'three' ? {entryPoints: [path.join(path.dirname(require.resolve(entry)), 'three.module.js')]} : {
    stdin: {contents: `import value from ${JSON.stringify(entry)};export default value;export const {${
      Object.keys(require(entry)).filter(key => /^[a-zA-Z_$][\w$]*$/.test(key) && key !== 'default').join(',')
    }}=value;`, resolveDir: root},
  };
  await build({...source, outfile: path.join(output, name + '.js'),
    bundle: true, format: 'esm', platform: 'browser', minify: true,
    define: {'process.env.NODE_ENV': '"production"'},
    plugins: entry === 'react' ? [] : [{name: 'shared-react', setup(builder) {
      builder.onResolve({filter: /^react$/}, () => ({path: 'shared-react', namespace: 'preview'}));
      builder.onLoad({filter: /.*/, namespace: 'preview'}, () => ({
        contents: 'import React from "/@presence/react.js";module.exports=React;', loader: 'js'}));
      builder.onResolve({filter: /^\/@presence\//}, args => ({path: args.path, external: true}));
    }}]});
}
await copyFile(require.resolve('@esbuild/win32-x64/esbuild.exe'), path.join(output, 'esbuild.exe'));
for (const name of ['react', 'react-dom', 'esbuild']) {
  await copyFile(path.join(path.dirname(require.resolve(name + '/package.json')), name === 'esbuild' ? 'LICENSE.md' : 'LICENSE'),
    path.join(output, name + '-LICENSE'));
}
await copyFile(path.join(path.dirname(require.resolve('three')), '..', 'LICENSE'), path.join(output, 'three-LICENSE'));
await writeFile(path.join(output, 'versions.json'), JSON.stringify(Object.fromEntries(
  ['react', 'react-dom', 'esbuild'].map(name => [name, require(name + '/package.json').version])), null, 2) + '\n');
