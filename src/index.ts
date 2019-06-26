import { registerWebExtension } from './Extensions'

registerWebExtension(
    'eofkdgkhfoebecmamljfaepckoecjhib',
    {
        name: 'My Extension',
        version: '1.0',
        manifest_version: 2,
        content_scripts: [
            {
                matches: ['<all_urls>'],
                js: ['/content-script.js'],
                match_about_blank: true,
            },
        ],
    },
    {
        '/content-script.js': `
console.log('Hello world from WebExtension environment!')
const hi = document.createElement('div')
hi.innerHTML = 'Ahhhhhhhhhh'
document.body.appendChild(hi)
console.log('here is my manifest', browser.runtime.getManifest())
window.hello = 'hi main frame'
`,
    },
)
console.log((window as any).browser, '<- No browser in the global')
console.log((window as any).hello, '<- No hello in the main')
