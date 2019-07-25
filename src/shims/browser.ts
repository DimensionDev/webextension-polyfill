import { Host } from '../RPC'
import { createEventListener } from '../utils/LocalMessages'
import { createRuntimeSendMessage, sendMessageWithResponse } from './browser.message'
import { Manifest } from '../Extensions'
import { getIDFromBlobURL } from './URL.create+revokeObjectURL'
/**
 * Create a new `browser` object.
 * @param extensionID - Extension ID
 * @param manifest - Manifest of the extension
 */
export function BrowserFactory(extensionID: string, manifest: Manifest): browser {
    const implementation: Partial<browser> = {
        downloads: NotImplementedProxy<typeof browser.downloads>({
            download: binding(extensionID, 'browser.downloads.download')({
                param(options) {
                    let { url, filename } = options
                    if (getIDFromBlobURL(url)) {
                        url = `holoflows-blob://${extensionID}/${getIDFromBlobURL(url)!}`
                    }
                    PartialImplemented(options, 'filename', 'url')
                    const arg1 = { url, filename: filename || '' }
                    return [arg1]
                },
                returns() {
                    return 0
                },
            }),
        }),
        runtime: NotImplementedProxy<typeof browser.runtime>({
            getURL(path) {
                return `holoflows-extension://${extensionID}/${path}`
            },
            getManifest() {
                return JSON.parse(JSON.stringify(manifest))
            },
            onMessage: createEventListener(extensionID, 'browser.runtime.onMessage'),
            sendMessage: createRuntimeSendMessage(extensionID),
        }),
        tabs: NotImplementedProxy<typeof browser.tabs>({
            async executeScript(tabID, details) {
                PartialImplemented(details, 'code', 'file', 'runAt')
                await Host['browser.tabs.executeScript'](extensionID, tabID === undefined ? -1 : tabID, details)
                return []
            },
            create: binding(extensionID, 'browser.tabs.create')(),
            async remove(tabID) {
                let t: number[]
                if (!Array.isArray(tabID)) t = [tabID]
                else t = tabID
                await Promise.all(t.map(x => Host['browser.tabs.remove'](extensionID, x)))
            },
            query: binding(extensionID, 'browser.tabs.query')(),
            update: binding(extensionID, 'browser.tabs.update')(),
            async sendMessage<T = any, U = object>(
                tabId: number,
                message: T,
                options?: { frameId?: number | undefined } | undefined,
            ): Promise<void | U> {
                PartialImplemented(options)
                return sendMessageWithResponse(extensionID, extensionID, tabId, message)
            },
        }),
        storage: {
            local: Implements<typeof browser.storage.local>({
                clear: binding(extensionID, 'browser.storage.local.clear')(),
                remove: binding(extensionID, 'browser.storage.local.remove')(),
                set: binding(extensionID, 'browser.storage.local.set')(),
                get: binding(extensionID, 'browser.storage.local.get')({
                    /** Host not accepting { a: 1 } as keys */
                    param(keys) {
                        if (Array.isArray(keys)) return [keys as string[]]
                        if (typeof keys === 'object') {
                            if (keys === null) return [null]
                            return [Object.keys(keys)]
                        }
                        return [null]
                    },
                    returns(rtn, [key]): object {
                        if (Array.isArray(key)) return rtn
                        else if (typeof key === 'object' && key !== null) {
                            return { ...key, ...rtn }
                        }
                        return rtn
                    },
                }),
            }),
            sync: NotImplementedProxy(),
            onChanged: NotImplementedProxy(),
        },
        webNavigation: NotImplementedProxy<typeof browser.webNavigation>({
            onCommitted: createEventListener(extensionID, 'browser.webNavigation.onCommitted'),
        }),
        extension: NotImplementedProxy<typeof browser.extension>({
            getBackgroundPage() {
                return new Proxy(
                    {
                        location: new URL(
                            `holoflows-extension://${extensionID}/_generated_background_page.html`,
                        ) as Partial<Location>,
                    } as Partial<Window>,
                    {
                        get(_: any, key: any) {
                            if (_[key]) return _[key]
                            throw new TypeError('Not supported')
                        },
                    },
                ) as Window
            },
        }),
    }
    return NotImplementedProxy<browser>(implementation, false)
}
type browser = typeof browser

function Implements<T>(implementation: T) {
    return implementation
}
function NotImplementedProxy<T = any>(implemented: Partial<T> = {}, final = true): T {
    return new Proxy(implemented, {
        get(target: any, key) {
            if (!target[key]) return final ? NotImplemented : NotImplementedProxy()
            return target[key]
        },
        apply() {
            return NotImplemented()
        },
    })
}
function NotImplemented(): any {
    return function() {
        throw new Error('Not implemented!')
    }
}
function PartialImplemented<T>(obj: T = {} as any, ...keys: (keyof T)[]) {
    const obj2 = { ...obj }
    keys.forEach(x => delete obj2[x])
    if (Object.keys(obj2).length) console.warn(`Not implemented options`, obj2, `at`, new Error().stack)
}

type HeadlessParameters<T extends (...args: any) => any> = T extends (extensionID: string, ...args: infer P) => any
    ? P
    : never
/**
 * Generate binding between Host and WebExtensionAPI
 *
 * ALL generics should be inferred. DO NOT write it manually.
 *
 * If you are writing options, make sure you add your function to `BrowserReference` to get type tips.
 *
 * @param extensionID - The extension ID
 * @param key - The API name in the type of `Host` AND `BrowserReference`
 */
function binding<
    /** Name of the API in the RPC binding */
    Key extends keyof BrowserReference,
    /** The definition of the WebExtensionAPI side */
    BrowserDef extends BrowserReference[Key],
    /** The definition of the Host side */
    HostDef extends Host[Key],
    /** Arguments of the browser side */
    BrowserArgs extends Parameters<BrowserDef>,
    /** Return type of the browser side */
    BrowserReturn extends PromiseOf<ReturnType<BrowserDef>>,
    /** Arguments type of the Host side */
    HostArgs extends HeadlessParameters<HostDef>,
    /** Return type of the Host side */
    HostReturn extends PromiseOf<ReturnType<HostDef>>
>(extensionID: string, key: Key) {
    /**
     * And here we split it into 2 function, if we join them together it will break the infer (but idk why)
     */
    return <
        /** Here we have to use generics with guard to ensure TypeScript will infer type on runtime */
        Options extends {
            /*
             * Here we write the type guard in the generic,
             * don't use two more generics to infer the return type of `param` and `returns`,
             * that will break the infer result.
             */
            param?: (...args: BrowserArgs) => HostArgs
            returns?: (returns: HostReturn, browser: BrowserArgs, host: HostArgs) => BrowserReturn
        }
    >(
        /**
         * Options. You can write the bridge between Host side and WebExtension side.
         */
        options: Options = {} as any,
    ) => {
        /**
         * Don't write these type alias in generics. will break. idk why again.
         */
        type HasParamFn = undefined extends Options['param'] ? false : true
        type HasReturnFn = undefined extends Options['returns'] ? false : true
        type ___Args___ = ReturnType<NonNullable<Options['param']>>
        type ___Return___ = ReturnType<NonNullable<Options['returns']>>
        /**
         * If there is a bridge function
         * - if its return type satisfied the requirement, return the `BrowserArgs` else return `never`
         *
         * return the `HostArgs` and let TypeScript check if it is satisfied.
         */
        type InferArgsResult = HasParamFn extends true
            ? ___Args___ extends BrowserArgs
                ? BrowserArgs
                : never
            : HostArgs
        /** Just like `InferArgsResult` */
        type InferReturnResult = HasReturnFn extends true
            ? ___Return___ extends BrowserReturn
                ? ___Return___
                : 'never rtn'
            : HostReturn
        const noop = <T>(x?: T) => x
        const noopArgs = (...args: any[]) => args
        const hostDefinition: (extensionID: string, ...args: HostArgs) => Promise<HostReturn> = Host[key] as any
        return ((async (...args: BrowserArgs): Promise<BrowserReturn> => {
            // ? Transform WebExtension API arguments to host arguments
            const hostArgs = (options.param || noopArgs)(...args) as HostArgs
            // ? execute
            const result = await hostDefinition(extensionID, ...hostArgs)
            // ? Transform host result to WebExtension API result
            const browserResult = (options.returns || noop)(result, args, hostArgs) as BrowserReturn
            return browserResult
        }) as unknown) as (...args: InferArgsResult) => Promise<InferReturnResult>
    }
}
/**
 * A reference table between Host and WebExtensionAPI
 *
 * key is in the host, result type is in the WebExtension.
 */
type BrowserReference = { [key in keyof typeof Host]: (...args: unknown[]) => Promise<unknown> } & {
    'browser.downloads.download': typeof browser.downloads.download
    'browser.tabs.create': typeof browser.tabs.create
}
type PromiseOf<T> = T extends Promise<infer U> ? U : never
