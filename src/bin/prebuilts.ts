import fs from 'fs'
import path from 'path'
import { exec } from './prebuilt'

const [extensionID, dir] = process.argv.slice(2)

function jsFiles(dirPath: string, collected: string[] = []) {
    const files = fs.readdirSync(dirPath)
    files.forEach(file => {
        if (fs.statSync(dirPath + '/' + file).isDirectory()) {
            collected = jsFiles(dirPath + '/' + file, collected)
        } else if (file.endsWith('.js')) {
            collected.push(path.join(process.cwd(), dirPath, '/', file))
        }
    })
    return collected
}
const baseDir = path.resolve(process.cwd(), dir)

for (const each of jsFiles(dir)) {
    const extension = extensionID + '/' + path.relative(baseDir, each)
    console.log('Prebuilt for', each, '...')
    exec(extension, each)
}
