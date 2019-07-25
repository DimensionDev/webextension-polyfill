import { Host } from '../RPC'
import { hasValidUserInteractive } from '../utils/UserInteractive'

export function openEnhanced(extensionID: string): typeof open {
    return (url = 'about:blank', target?: string, features?: string, replace?: boolean) => {
        if (!hasValidUserInteractive()) return null
        if ((target && target !== '_blank') || features || replace)
            console.warn('Unsupported open', url, target, features, replace)
        Host['browser.tabs.create'](extensionID, {
            active: true,
            url,
        })
        return null
    }
}

export function closeEnhanced(extensionID: string): typeof close {
    return () => {
        if (!hasValidUserInteractive()) return
        Host['browser.tabs.query'](extensionID, { active: true }).then(i =>
            Host['browser.tabs.remove'](extensionID, i[0].id!),
        )
    }
}
