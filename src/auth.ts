import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [GitHub],
  callbacks: {
    // Routes matched by proxy.ts run this: logged-out users hitting a
    // protected path are redirected to the sign-in page. Adjust per app.
    authorized({ auth, request: { nextUrl } }) {
      if (nextUrl.pathname.startsWith("/dashboard")) return !!auth?.user;
      return true;
    },
  },
});
