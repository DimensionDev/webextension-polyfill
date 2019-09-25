import { AsyncCall } from '@holoflows/kit/es'
import { Host, ThisSideImplementation, SamePageDebugChannel } from '../RPC'
import { useInternalStorage } from '../internal'
import { getResourceAsync } from '../utils/Resources'
import { isDebug } from './isDebugMode'
import { debugModeURLRewrite } from './url-rewrite'

const log: <T>(rt: T) => (...args: any[]) => Promise<T> = rt => async (...args) => {
    console.log('Mocked Host', ...args)
    return rt!
}

class CrossPageDebugChannel {
    broadcast = new BroadcastChannel('webext-polyfill-debug')
    constructor() {
        this.broadcast.addEventListener('message', e => {
            if (e.origin !== location.origin) console.warn(e.origin, location.origin)
            const detail = e.data
            for (const f of this.listener) {
                try {
                    f(detail)
                } catch {}
            }
        })
    }
    private listener: Array<(data: unknown) => void> = []
    on(_: string, cb: (data: any) => void): void {
        this.listener.push(cb)
    }
    emit(_: string, data: any): void {
        this.broadcast.postMessage(data)
    }
}

if (isDebug) {
    const mockHost = AsyncCall<{ onMessage: ThisSideImplementation['onMessage'] }>(
        {
            onMessage: ThisSideImplementation.onMessage,
        } as { onMessage: ThisSideImplementation['onMessage'] },
        {
            key: 'mock',
            log: false,
            messageChannel: new CrossPageDebugChannel(),
        },
    )
    const host: Host = {
        'URL.createObjectURL': log(void 0),
        'URL.revokeObjectURL': log(void 0),
        'browser.downloads.download': log(void 0),
        async sendMessage(e, t, tt, m, mm) {
            mockHost.onMessage(e, t, m, mm, { id: new URLSearchParams(location.search).get('id')! })
        },
        'browser.storage.local.clear': log(void 0),
        async 'browser.storage.local.get'(extensionID, k) {
            return (await useInternalStorage(extensionID)).debugModeStorage || {}
        },
        'browser.storage.local.remove': log(void 0),
        async 'browser.storage.local.set'(extensionID, d) {
            useInternalStorage(extensionID, o => (o.debugModeStorage = Object.assign({}, o.debugModeStorage, d)))
        },
        async 'browser.tabs.create'(extensionID, options) {
            if (!options.url) throw new TypeError('need a url')
            const a = document.createElement('a')
            a.href = debugModeURLRewrite(extensionID, options.url)
            const param = new URLSearchParams()
            param.set('url', options.url)
            param.set('type', options.url.startsWith('holoflows-extension://') ? 'p' : 'm')
            a.href = '/debug?' + param
            a.innerText = 'browser.tabs.create: ' + options.url
            a.target = '_blank'
            a.style.color = 'white'
            document.body.appendChild(a)
            return { id: Math.random() } as any
        },
        'browser.tabs.query': log([]),
        'browser.tabs.remove': log(void 0),
        'browser.tabs.update': log({} as browser.tabs.Tab),
        async fetch(extensionID, r) {
            const h = await getResourceAsync(extensionID, {}, r.url)
            if (h) return { data: { content: h, mimeType: '', type: 'text' }, status: 200, statusText: 'ok' }
            return { data: { content: '', mimeType: '', type: 'text' }, status: 404, statusText: 'Not found' }
        },
    }
    AsyncCall(host, {
        key: '',
        log: false,
        messageChannel: new SamePageDebugChannel(),
    })
}
