module.exports = {
  apps : [{
    name   : "reader",
    script : "server/index.ts",
    interpreter: "./node_modules/.bin/tsx",
    cwd    : "/home/bandit/dev/SECInsightHub/",
    env    : {
      "NODE_ENV": "development",
      "DATABASE_URL": "postgres://neondb_owner:npg_QJNYf71gACVW@localhost:5432/neondb",
    }

  }]
}
