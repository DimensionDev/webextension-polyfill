export class SamePageDebugChannel {
    static server = document.createElement('a')
    static client = document.createElement('a')
    constructor(private actor: 'server' | 'client') {
        SamePageDebugChannel[actor].addEventListener('targetEventChannel', e => {
            const detail = (e as CustomEvent).detail
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
        SamePageDebugChannel[this.actor === 'client' ? 'server' : 'client'].dispatchEvent(
            new CustomEvent('targetEventChannel', { detail: data }),
        )
    }
}
