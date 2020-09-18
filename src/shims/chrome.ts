/**
 * This file is a reverse of webextension-polyfill.
 *
 * AKA, given a browser object, it implements Chrome-style Web Extension API.
 */
export function createChromeFromBrowser(_: typeof browser) {
    const chrome = {} as typeof browser
    for (const key in _) {
        // @ts-ignore
        const obj = (chrome[key] = {})
    }
    const bind = promiseToCallbackBased.bind(null, chrome)
    convertAll(chrome.downloads, _.downloads)
    convertAll(chrome.permissions, _.permissions)
    // @ts-ignore
    chrome.storage.local = {} as any
    convertAll(chrome.storage.local, _.storage.local)
    convertAll(chrome.tabs, _.tabs)
    chrome.runtime = _.runtime
    chrome.webNavigation = _.webNavigation
    chrome.extension = _.extension
    return chrome

    function convertAll(to: any, from: any) {
        for (const [k, v] of Object.entries(from)) to[k] = bind(v as any)
    }
}

function promiseToCallbackBased(chrome: { runtime: { lastError?: string | null } }, f: Function): any {
    return (...args: any[]) => {
        const [callback, ...rest] = [...args].reverse()
        let cb = typeof callback === 'function' ? callback : () => {}
        const success = onSuccess.bind(null, chrome, cb)
        const error = onError.bind(null, chrome, cb)
        if (typeof callback === 'function') f(...rest.reverse()).then(success, error)
        else f(...args).then(success, error)
    }
}
function onSuccess(chrome: any, callback: Function, data: unknown) {
    delete chrome.runtime.lastError
    return callback(data)
}
function onError(chrome: any, callback: Function, e: unknown) {
    let checked = false
    Object.defineProperty(chrome.runtime, 'lastError', {
        configurable: true,
        enumerable: true,
        get() {
            checked = true
            return { message: String(e) }
        },
        set(val) {},
    })
    try {
        callback()
    } finally {
        if (!checked) throw String(e)
        delete chrome.runtime.lastError
    }
}
