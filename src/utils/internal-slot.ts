const cachedPropertyDescriptor = new WeakMap<typeof globalThis, Map<object, object>>()
/**
 * This function can clone a new object with custom descriptors but keep internal slot forwarding.
 * @param cachedPropertyDescriptor A WeakMap. Used to store previously cloned prototype.
 * @param original Original object
 * @param realm Target realm
 * @param traps Traps
 */
export function cloneObjectWithInternalSlot<T extends object>(
    original: T,
    realm: typeof globalThis,
    traps: {
        nextObject?: object
        designatedOwnDescriptors?: Record<string, PropertyDescriptor>
        descriptorsModifier?: (object: object, desc: Record<string, PropertyDescriptor>) => typeof desc
    },
) {
    const ownDescriptor = traps.designatedOwnDescriptors ?? Object.getOwnPropertyDescriptors(original)
    const prototypeChain = getPrototypeChain(original)
    if (!cachedPropertyDescriptor.has(realm)) cachedPropertyDescriptor.set(realm, new Map())
    const cacheMap = cachedPropertyDescriptor.get(realm)!
    const newProto = prototypeChain.reduceRight((previous, current) => {
        if (cacheMap.has(current)) return cacheMap.get(current)!
        const desc = Object.getOwnPropertyDescriptors(current)
        const nextDesc = PatchThisOfDescriptors(traps.descriptorsModifier?.(current, desc) ?? desc, original)
        const obj = Object.create(previous, nextDesc)
        cacheMap.set(current, obj)
        return obj
    }, {})
    const next = traps.nextObject || Object.create(null)
    const nextDesc = PatchThisOfDescriptors(traps.descriptorsModifier?.(next, ownDescriptor) ?? ownDescriptor, original)
    Object.defineProperties(next, nextDesc)
    Object.setPrototypeOf(next, newProto)
    return next
}

const toStringWeakMap = new WeakMap<Function, string>()
Object.defineProperties(toStringWeakMap, {
    get: { value: toStringWeakMap.get },
    set: { value: toStringWeakMap.set },
    has: { value: toStringWeakMap.has },
})
Function.prototype.toString = new Proxy(Function.prototype.toString, {
    apply(target, thisArg, args) {
        if (toStringWeakMap.has(thisArg)) return toStringWeakMap.get(thisArg)
        return Reflect.apply(target, thisArg, args)
    }
})

/**
 * Recursively get the prototype chain of an Object
 * @param o Object
 */
function getPrototypeChain(o: object, _: object[] = []): object[] {
    if (o === undefined || o === null) return _
    const y = Object.getPrototypeOf(o)
    if (y === null || y === undefined || y === Object.prototype || y === Function.prototype) return _
    return getPrototypeChain(y, [..._, y])
}
/**
 * Many native methods requires `this` points to a native object
 * Like `alert()`. If you call alert as `const w = { alert }; w.alert()`,
 * there will be an Illegal invocation.
 *
 * To prevent `this` binding lost, we need to rebind it.
 *
 * @param descriptor PropertyDescriptor
 * @param native The native object
 */
function PatchThisOfDescriptorToNative(descriptor: PropertyDescriptor, native: object) {
    const { get, set, value } = descriptor
    if (get) descriptor.get = () => get.apply(native)
    if (set) descriptor.set = (val: any) => set.apply(native, val)
    if (value && typeof value === 'function') {
        const nextDescriptor = Object.getOwnPropertyDescriptors(value)
        const f = {
            [value.name]: function () {
                if (new.target) return Reflect.construct(value, arguments, new.target)
                return Reflect.apply(value, native, arguments)
            },
        }[value.name]
        descriptor.value = f
        toStringWeakMap.set(f, value.toString())
        delete nextDescriptor.arguments
        delete nextDescriptor.caller
        delete nextDescriptor.callee
        Object.defineProperties(f, nextDescriptor)
        Object.setPrototypeOf(f, value.__proto__)
    }
}
function PatchThisOfDescriptors(desc: Record<string | symbol, PropertyDescriptor>, native: object): typeof desc {
    const _ = Object.entries(desc).map(([x, y]) => [x as string | symbol, { ...y }] as const)
    Object.getOwnPropertySymbols(desc).forEach((x) => _.push([x, { ...desc[x as any] }]))
    _.forEach((x) => PatchThisOfDescriptorToNative(x[1], native))
    return Object.fromEntries(_)
}
