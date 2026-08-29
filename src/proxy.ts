export { auth as proxy } from "@/auth";

// Which routes run the auth check. Add the app's protected paths here.
export const config = {
  matcher: ["/dashboard/:path*"],
};
