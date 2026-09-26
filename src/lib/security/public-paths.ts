/** Screens that render without a signed-in session. */
export function isPublicAppPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    pathname === "/activate" ||
    pathname.startsWith("/public/")
  );
}
