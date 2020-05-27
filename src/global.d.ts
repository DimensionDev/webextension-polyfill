interface Window {
    webkit?: {
        messageHandlers?: Record<string, { postMessage(message: any): void }>
    }
}
