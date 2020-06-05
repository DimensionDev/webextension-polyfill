import { AsyncCall } from 'async-call-rpc'
import { FrameworkMayInvokeMethods, ThisSideImplementation, FrameworkImplementation } from '../RPCs/framework-rpc'
import { SamePageDebugChannel } from '../RPCs/SamePageDebugChannel'
import { useInternalStorage } from '../internal'
import { isDebug, parseDebugModeURL } from './isDebugMode'
import { debugModeURLRewrite } from './url-rewrite'

const log: <T>(rt: T) => (...args: any[]) => Promise<T> = (rt) => async (...args) => {
    console.log('Mocked Host', ...args)
    return rt!
}
const myTabID: any = parseInt(new URLSearchParams(location.search).get('id') ?? (~~(Math.random() * 100) as any))

const tabsQuery = new BroadcastChannel('query-tabs')
tabsQuery.addEventListener('message', (e) => {
    if (e.origin !== location.origin) console.warn(e.origin, location.origin)
    if (e.data === 'req') tabsQuery.postMessage({ id: myTabID })
})
function queryTabs() {
    return new Promise<number[]>((resolve) => {
        const id = new Set<number>()
        tabsQuery.addEventListener('message', (e) => {
            if (e.data?.id) id.add(e.data.id)
        })
        tabsQuery.postMessage('req')
        setTimeout(() => resolve([...id]), 300)
    })
}

class CrossPageDebugChannel {
    broadcast = new BroadcastChannel('webext-polyfill-debug')
    constructor() {
        this.broadcast.addEventListener('message', (e) => {
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
const origFetch = fetch
interface MockedLocalService {
    onMessage: FrameworkMayInvokeMethods['onMessage']
    onCommitted: FrameworkMayInvokeMethods['browser.webNavigation.onCommitted']
}
const loadedTab: number[] = []
if (isDebug) {
    const mockHost = AsyncCall<MockedLocalService>(
        {
            onMessage: ThisSideImplementation.onMessage,
            onCommitted: ThisSideImplementation['browser.webNavigation.onCommitted'],
        } as MockedLocalService,
        {
            key: 'mock',
            log: false,
            messageChannel: new CrossPageDebugChannel(),
        },
    )
    setTimeout(() => {
        const obj = parseDebugModeURL('', { id: myTabID } as any)
        // webNavigation won't sent holoflows-extension pages.
        if (obj.src.startsWith('holoflows-')) return
        mockHost.onCommitted({ tabId: myTabID, url: obj.src })
    }, 2000)
    const host: FrameworkImplementation = {
        'URL.createObjectURL': log(void 0),
        'URL.revokeObjectURL': log(void 0),
        'browser.downloads.download': log(void 0),
        async sendMessage(e, t, tt, m, mm) {
            mockHost.onMessage(e, t, m, mm, { id: myTabID })
        },
        'browser.storage.local.clear': log(void 0),
        async 'browser.storage.local.get'(extensionID, k) {
            return (await useInternalStorage(extensionID)).debugModeStorage || {}
        },
        'browser.storage.local.remove': log(void 0),
        async 'browser.storage.local.set'(extensionID, d) {
            useInternalStorage(extensionID, (o) => (o.debugModeStorage = Object.assign({}, o.debugModeStorage, d)))
        },
        async 'browser.tabs.create'(extensionID, options) {
            if (!options.url) throw new TypeError('need a url')
            const a = document.createElement('a')
            a.href = debugModeURLRewrite(extensionID, options.url)
            const param = new URLSearchParams()
            param.set('url', options.url)
            param.set('type', options.url.startsWith('holoflows-extension://') ? 'p' : 'm')
            const id = ~~(Math.random() * 100)
            param.set('id', id.toString())
            a.href = '/?' + param
            a.innerText = 'browser.tabs.create: Please click to open it: ' + options.url
            a.target = '_blank'
            a.style.color = 'white'
            document.body.appendChild(a)
            loadedTab.push(id)
            return { id } as any
        },
        'browser.tabs.query': () => queryTabs().then((x) => x.map((id) => ({ id } as any))),
        'browser.tabs.remove': log(void 0),
        'browser.tabs.update': log({} as browser.tabs.Tab),
        async fetch(extensionID, r) {
            const req = await origFetch(debugModeURLRewrite(extensionID, r.url))
            if (req.ok)
                return {
                    data: { content: await req.text(), mimeType: '', type: 'text' },
                    status: 200,
                    statusText: 'ok',
                }
            return { data: { content: '', mimeType: '', type: 'text' }, status: 404, statusText: 'Not found' }
        },
        async eval(eid, string) {
            const x = eval
            try {
                x(string)
            } catch (e) {
                console.log(string)
                console.error(e)
                throw e
            }
        },
    }
    AsyncCall(host, {
        key: '',
        log: false,
        messageChannel: new SamePageDebugChannel('server'),
    })
}
