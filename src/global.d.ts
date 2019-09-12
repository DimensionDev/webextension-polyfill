declare module 'realms-shim' {
    export interface Realm<GlobalObject extends object = typeof globalThis> {
        readonly global: GlobalObject
        evaluate(sourceText: string): unknown
        [Symbol.toStringTag]: 'Realm'
    }
    export interface RealmConstructor {
        new (): never
        (): never
        makeCompartment<GlobalObject extends object = typeof globalThis>(): Realm<GlobalObject>
        makeRootRealm<GlobalObject extends object = typeof globalThis>(options?: {
            transforms: {
                rewrite: (context: { endowments: unknown; src: string }) => {}
            }[]
            sloppyGlobals: boolean
            shims: unknown[]
        }): Realm<GlobalObject>
    }
    const Realm: RealmConstructor
    export default Realm
}

interface Window {
    webkit?: {
        messageHandlers?: Record<string, { postMessage(message: any): void }>
    }
}
