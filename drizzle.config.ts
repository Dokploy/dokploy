module.exports = {
  schema: "./packages/server/src/db/schema/org-teams.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: "postgres://dokploy:amukds4wi9001583845717ad2@localhost:5432/dokploy",
  },
};

