/**
 * Check if the current location matches. Used in manifest.json parser
 * @param location Current location
 * @param matches
 * @param exclude_matches
 * @param include_globs
 * @param exclude_globs
 */
export function matchingURL(
    location: URL,
    matches: string[],
    exclude_matches: string[],
    include_globs: string[],
    exclude_globs: string[],
    about_blank?: boolean,
) {
    let result = false
    // ? We eval matches first then eval mismatches
    for (const item of matches) if (matches_matcher(item, location, about_blank)) result = true
    for (const item of exclude_matches) if (matches_matcher(item, location)) result = false
    if (include_globs.length) console.warn('include_globs not supported yet.')
    if (exclude_globs.length) console.warn('exclude_globs not supported yet.')
    return result
}
/**
 * Supported protocols
 */
const supportedProtocols: readonly string[] = [
    'http:',
    'https:',
    // "ws:",
    // "wss:",
    // "ftp:",
    // "data:",
    // "file:"
]
function matches_matcher(_: string, location: URL, about_blank?: boolean) {
    if (location.toString() === 'about:blank' && about_blank) return true
    if (_ === '<all_urls>') {
        if (supportedProtocols.includes(location.protocol)) return true
        return false
    }
    const [rule, wildcardProtocol] = normalizeURL(_)
    if (rule.port !== '') return false
    if (!protocol_matcher(rule.protocol, location.protocol, wildcardProtocol)) return false
    if (!host_matcher(rule.host, location.host)) return false
    if (!path_matcher(rule.pathname, location.pathname, location.search)) return false
    return true
}
/**
 * NormalizeURL
 * @param _ - URL defined in manifest
 */
function normalizeURL(_: string): [URL, boolean] {
    if (_.startsWith('*://')) return [new URL(_.replace(/^\*:/, 'https:')), true]
    return [new URL(_), false]
}
function protocol_matcher(matcherProtocol: string, currentProtocol: string, wildcardProtocol: boolean) {
    // ? only `http:` and `https:` is supported currently
    if (!supportedProtocols.includes(currentProtocol)) return false
    // ? if wanted protocol is "*:", match everything
    if (wildcardProtocol) return true
    if (matcherProtocol === currentProtocol) return true
    return false
}
function host_matcher(matcherHost: string, currentHost: string) {
    // ? %2A is *
    if (matcherHost === '%2A') return true
    if (matcherHost.startsWith('%2A.')) {
        const part = matcherHost.replace(/^%2A/, '')
        if (part === currentHost) return false
        return currentHost.endsWith(part)
    }
    return matcherHost === currentHost
}
function path_matcher(matcherPath: string, currentPath: string, currentSearch: string) {
    if (!matcherPath.startsWith('/')) return false
    if (matcherPath === '/*') return true
    // ? '/a/b/c' matches '/a/b/c#123' but not '/a/b/c?123'
    if (matcherPath === currentPath && currentSearch === '') return true
    // ? '/a/b/*' matches everything startsWith '/a/b/'
    if (matcherPath.endsWith('*') && currentPath.startsWith(matcherPath.slice(undefined, -1))) return true
    if (matcherPath.indexOf('*') === -1) return matcherPath === currentPath
    console.warn('Not supported path matcher in manifest.json', matcherPath)
    return true
}
