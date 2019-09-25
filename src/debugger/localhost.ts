import { AsyncCall } from '@holoflows/kit/es'
import { Host, ThisSideImplementation, SamePageDebugChannel } from '../RPC'
import { useInternalStorage } from '../internal'
import { getResourceAsync } from '../utils/Resources'
import { isDebug } from './isDebugMode'

const log: <T>(rt?: T) => (...args: any[]) => T = rt => (...args) => {
    console.log('Mocked Host', ...args)
    return rt!
}

class CrossPageDebugChannel {
    constructor() {
        window.addEventListener('message', e => {
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
        window.postMessage(data, location.origin)
    }
}

if (isDebug) {
    const mockHost = AsyncCall<{ onMessage: ThisSideImplementation['onMessage'] }>(
        {
            onMessage: ThisSideImplementation.onMessage,
        } as { onMessage: ThisSideImplementation['onMessage'] },
        {
            key: 'mock',
            log: true,
            messageChannel: new CrossPageDebugChannel(),
        },
    )
    const host: Host = {
        'URL.createObjectURL': log(),
        'URL.revokeObjectURL': log(),
        'browser.downloads.download': log(),
        async sendMessage(e, t, tt, m, mm) {
            mockHost.onMessage(e, t, m, mm, { id: new URLSearchParams(location.search).get('id')! })
        },
        'browser.storage.local.clear': log(),
        async 'browser.storage.local.get'(e, k) {
            return (await useInternalStorage(e)).debugModeStorage || {}
        },
        'browser.storage.local.remove': log(),
        async 'browser.storage.local.set'(e, d) {
            useInternalStorage(e, o => (o.debugModeStorage = Object.assign({}, o.debugModeStorage, d)))
        },
        async 'browser.tabs.create'(e, o) {
            if (!o.url) throw new TypeError('need a url')
            const a = document.createElement('a')
            a.href = o.url
            return { id: Math.random() } as any
        },
        'browser.tabs.query': log(),
        'browser.tabs.remove': log(),
        'browser.tabs.update': log(),
        async fetch(e, r) {
            const h = await getResourceAsync(e, {}, r.url)
            if (h) return { data: { content: h, mimeType: '', type: 'text' }, status: 200, statusText: 'ok' }
            return { data: { content: '', mimeType: '', type: 'text' }, status: 404, statusText: 'Not found' }
        },
    }
    AsyncCall(host, {
        key: '',
        log: true,
        messageChannel: new SamePageDebugChannel(),
    })
}
