import { isDebug } from '../debugger/isDebugMode'
import { debugModeURLRewrite } from '../debugger/url-rewrite'

export function rewriteWorker(extensionID: string) {
    if (!isDebug) return
    const originalWorker = window.Worker
    window.Worker = new Proxy(originalWorker, {
        construct(target, args, newTarget) {
            args[0] = debugModeURLRewrite(extensionID, args[0])
            return Reflect.construct(target, args, newTarget)
        },
    })
}
