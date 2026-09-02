import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { buildAuthConfig } from "@/auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // Keyed on VERCEL, not NODE_ENV: a local production build serves plain
  // http, where Secure cookies would be dropped by Safari.
  ...buildAuthConfig({ secureCookies: Boolean(process.env.VERCEL) }),
});
