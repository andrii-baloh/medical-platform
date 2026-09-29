import NextAuth from "next-auth";
import Keycloak from "next-auth/providers/keycloak";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Keycloak({
    clientId: process.env.AUTH_KEYCLOAK_ID!,
    clientSecret: process.env.AUTH_KEYCLOAK_SECRET!,
    issuer: process.env.AUTH_KEYCLOAK_ISSUER!,
  })],
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  callbacks: {
    async jwt({ token, account }) {
      if (account?.access_token) token.accessToken = account.access_token;
      if (account?.expires_at) token.accessTokenExpires = account.expires_at;
      return token;
    },
    async session({ session }) {
      return session;
    },
  },
  trustHost: true,
});
