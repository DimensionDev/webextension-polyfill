import { isDebug } from '../debugger/isDebugMode'
import { debugModeURLRewrite } from '../debugger/url-rewrite'

export function enhancedWorker(extensionID: string, originalWorker = window.Worker): typeof Worker {
    if (!isDebug) return originalWorker
    return new Proxy(originalWorker, {
        construct(target, args, newTarget) {
            args[0] = debugModeURLRewrite(extensionID, args[0])
            return Reflect.construct(target, args, newTarget)
        },
    })
}
