import { FrameworkRPC } from '../RPCs/framework-rpc'
import { hasValidUserInteractive } from '../utils/UserInteractive'

export function openEnhanced(extensionID: string): typeof open {
    return (url = 'about:blank', target?: string, features?: string, replace?: boolean) => {
        if (!hasValidUserInteractive()) return null
        if ((target && target !== '_blank') || features || replace)
            console.warn('Unsupported open', url, target, features, replace)
        FrameworkRPC['browser.tabs.create'](extensionID, {
            active: true,
            url,
        })
        return null
    }
}

export function closeEnhanced(extensionID: string): typeof close {
    return () => {
        if (!hasValidUserInteractive()) return
        FrameworkRPC['browser.tabs.query'](extensionID, { active: true }).then(i =>
            FrameworkRPC['browser.tabs.remove'](extensionID, i[0].id!),
        )
    }
}
