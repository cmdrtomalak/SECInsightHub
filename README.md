Set up local SEC Report viewer

```
npm install --save-dev drizzle-kit

sudo -u postgres psql -d neondb

GRANT USAGE, CREATE ON SCHEMA public TO neondb_owner;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO
neondb_owner;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO neondb_owner;

npx drizzle-kit generate
npx drizzle-kit push

export DATABASE_URL=postgres://neondb_owner:npg_QJNYf71gACVW@localhost:5432/neondb; npm run dev
```
