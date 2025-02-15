import type { IncomingMessage } from "node:http";
import * as bcrypt from "bcrypt";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware, organization } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { db } from "../db";
import * as schema from "../db/schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: schema,
  }),

  emailAndPassword: {
    enabled: true,

    password: {
      async hash(password) {
        return bcrypt.hashSync(password, 10);
      },
      async verify({ hash, password }) {
        return bcrypt.compareSync(password, hash);
      },
    },
  },
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path.startsWith("/sign-up")) {
        const newSession = ctx.context.newSession;
        await db
          .update(schema.users_temp)
          .set({
            role: "admin",
          })
          .where(eq(schema.users_temp.id, newSession?.user?.id || ""));
      }
    }),
  },
  user: {
    modelName: "users_temp",
    additionalFields: {
      role: {
        type: "string",
      },
      ownerId: {
        type: "string",
      },
    },
  },
  plugins: [organization()],
});

export const validateRequest = async (request: IncomingMessage) => {
  const session = await auth.api.getSession({
    headers: new Headers({
      cookie: request.headers.cookie || "",
    }),
  });

  if (!session?.session || !session.user) {
    return {
      session: null,
      user: null,
    };
  }

  if (session?.user) {
    if (session?.user.role === "user") {
      const owner = await db.query.member.findFirst({
        where: eq(schema.member.userId, session.user.id),
        with: {
          organization: true,
        },
      });

      if (owner) {
        session.user.ownerId = owner.organization.ownerId;
      }
    } else {
      session.user.ownerId = session?.user?.id || "";
    }
  }

  return session;
};
