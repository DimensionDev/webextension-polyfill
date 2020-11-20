import type { EventBasedChannel } from 'async-call-rpc'

export class SamePageDebugChannel extends EventTarget implements EventBasedChannel {
    static server = document.createElement('a')
    static client = document.createElement('a')
    constructor(private actor: 'server' | 'client') {
        super()
        SamePageDebugChannel[actor].addEventListener('targetEventChannel', (e) => {
            const detail = (e as MessageEvent).data
            this.dispatchEvent(new MessageEvent('message', { data: detail }))
        })
    }
    on(cb: (data: any) => void) {
        const f = (e: any) => cb(e.data)
        this.addEventListener('message', f)
        return () => this.removeEventListener('message', f)
    }
    send(data: any): void {
        SamePageDebugChannel[this.actor === 'client' ? 'server' : 'client'].dispatchEvent(
            new MessageEvent('targetEventChannel', { data }),
        )
    }
}
