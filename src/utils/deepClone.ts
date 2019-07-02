export function deepClone<T>(obj: T): T {
    // todo: change another impl plz.
    return JSON.parse(JSON.stringify(obj))
}
