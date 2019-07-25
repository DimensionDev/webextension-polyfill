let lastUserActive = 0
let now = Date.now.bind(Date)
document.addEventListener(
    'click',
    () => {
        lastUserActive = now()
    },
    { capture: true, passive: true },
)
export function hasValidUserInteractive() {
    return now() - lastUserActive < 3000
}
