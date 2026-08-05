/**
 * Removes a configured base prefix from a pathname before route matching, so
 * route patterns stay written relative to the app's mount point.
 *
 * The prefix is only stripped when it lands on a path boundary: `/app` strips
 * from `/app/users` (→ `/users`) and from `/app` itself (→ `/`), but not from
 * `/application`, where `/app` is a coincidental character prefix rather than a
 * real segment. A pathname that does not start with the base is returned
 * untouched.
 *
 * It sits here because both routers read a browser's pathname — one as its only
 * target, one through `createBrowserHistory` — and a base that meant something
 * slightly different on each side is exactly the drift this package exists to
 * prevent. Pure string arithmetic, so it costs the charter nothing.
 */
export const stripBase = (pathname: string, base: string): string => {
  if (base && pathname.startsWith(base)) {
    const rest = pathname.slice(base.length)
    return rest.startsWith('/') || rest === '' ? rest || '/' : pathname
  }
  return pathname
}
