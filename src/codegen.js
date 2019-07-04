const fs = require('fs')
const files = new Set()

for (const each of JSON.parse(
    fs
        .readFileSync('./extension/precache-manifest.js', 'utf-8')
        .replace(/(.+)concat\(/, '')
        .replace(/\);$/, ''),
).map(x => x.url.replace(/^\//, ''))) {
    files.add(each)
}

const manifest = require('./extension/manifest.json')
for (const each of manifest.content_scripts) {
    for (const file of each.js) files.add(file)
}

for (const each of manifest.background.scripts) {
    files.add(each)
}

const codegen = Array.from(files)
    .map((url, index) => {
        return `// @ts-ignore
import $${index} from './extension/${url}'
resources['${url}'] = $${index}`
    })
    .join('\n')

const template = fs.readFileSync('./index_ci.ts', 'utf-8').replace("'inject point'", codegen)
fs.writeFileSync('index.ts', template)
