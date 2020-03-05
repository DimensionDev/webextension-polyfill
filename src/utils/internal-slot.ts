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
        const obj = Object.create(
            previous,
            PatchThisOfDescriptors(traps.descriptorsModifier?.(current, desc) ?? desc, original),
        )
        cacheMap.set(current, obj)
        return obj
    }, {})
    const next = traps.nextObject || Object.create(null)
    Object.defineProperties(
        next,
        PatchThisOfDescriptors(traps.descriptorsModifier?.(next, ownDescriptor) ?? ownDescriptor, original),
    )
    Object.setPrototypeOf(next, newProto)
    return next
}

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
 * @param desc PropertyDescriptor
 * @param native The native object
 */
function PatchThisOfDescriptorToNative(desc: PropertyDescriptor, native: object) {
    const { get, set, value } = desc
    if (get) desc.get = () => get.apply(native)
    if (set) desc.set = (val: any) => set.apply(native, val)
    if (value && typeof value === 'function') {
        const desc2 = Object.getOwnPropertyDescriptors(value)
        desc.value = function() {
            if (new.target) return Reflect.construct(value, arguments, new.target)
            return Reflect.apply(value, native, arguments)
        }
        delete desc2.arguments
        delete desc2.caller
        delete desc2.callee
        Object.defineProperties(desc.value, desc2)
        try {
            // ? For unknown reason this fail for some objects on Safari.
            value.prototype && Object.setPrototypeOf(desc.value, value.prototype)
        } catch {}
    }
}
function PatchThisOfDescriptors(desc: Record<string, PropertyDescriptor>, native: object): typeof desc {
    const _ = Object.entries(desc).map(([x, y]) => [x, { ...y }] as const)
    _.forEach(x => PatchThisOfDescriptorToNative(x[1], native))
    return Object.fromEntries(_)
}
