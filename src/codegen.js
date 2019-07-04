const fs = require('fs')
const codegen = JSON.parse(
    fs
        .readFileSync('./extension/precache-manifest.js', 'utf-8')
        .replace(/(.+)concat\(/, '')
        .replace(/\);$/, ''),
)
    .map(x => x.url)
    .map((url, index) => {
        return `// @ts-ignore
import $${index} from './extension${url}'
resources['${url.replace(/^\//, '')}'] = $${index}`
    })
    .join('\n')

const template = fs.readFileSync('./index_ci.ts', 'utf-8').replace("'inject point'", codegen)
fs.writeFileSync('index.ts', template)
