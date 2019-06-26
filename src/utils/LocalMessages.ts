import { Host } from '../RPC'
type WebExtensionID = string
type webNavigationOnCommittedArgs = Parameters<Host['browser.webNavigation.onCommitted']>
type onMessageArgs = Parameters<Host['onMessage']>
export const LocalMessageChannel = {
    onCommittedHandler: new Map<WebExtensionID, (...args: webNavigationOnCommittedArgs[]) => void>(),
    onMessageHandler: new Map<WebExtensionID, (...args: onMessageArgs[]) => void>(),
    dispatchCommitted(...args: webNavigationOnCommittedArgs) {
        for (const [key, fns] of this.onCommittedHandler) {
        }
    },
    dispatchMessage(...args: onMessageArgs) {},
}
