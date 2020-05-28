declare class Realm {
    constructor()
    readonly globalThis: typeof globalThis
    import(specifier: string): Promise<object>
}
interface Window {
    webkit?: {
        messageHandlers?: Record<string, { postMessage(message: any): void }>
    }
}
