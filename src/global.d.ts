declare module 'realms-shim' {
    interface RealmOptions {
        transform?: 'inherit' | ((...args: any[]) => void)
        isDirectEval?: 'inherit' | ((...args: any[]) => void)
        intrinsics?: 'inherit'
        thisValue?: object
    }
    export default class Realm<GlobalObject extends object = typeof globalThis> {
        constructor(options?: RealmOptions)
        readonly global: GlobalObject
        readonly thisValue: unknown
        readonly stdlib: unknown
        readonly intrinsics: unknown;
        [Symbol.toStringTag]: 'Realm'
        init(): void
        evaluate(sourceText: string): unknown
        // not in spec
        static makeCompartment(): unknown
        static makeRootRealm(b?: unknown): Realm
    }
}

interface Window {
    webkit?: {
        messageHandlers?: Record<string, { postMessage(message: any): void }>
    }
}
