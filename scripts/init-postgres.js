const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for Postgres initialization.');
}

const sqlPath = path.join(process.cwd(), 'prisma', 'postgres-init.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');
const patchPath = path.join(process.cwd(), 'prisma', 'postgres-schema-patches.sql');
const patchSql = fs.existsSync(patchPath) ? fs.readFileSync(patchPath, 'utf8') : '';
const uploadMigrationPath = path.join(process.cwd(), 'prisma', 'migrations', '20260602120000_image_upload_limits', 'migration.sql');
const uploadMigrationSql = fs.existsSync(uploadMigrationPath) ? fs.readFileSync(uploadMigrationPath, 'utf8') : '';

const pool = new Pool({ connectionString: databaseUrl });

(async () => {
  try {
    await pool.query(sql);
    if (patchSql) {
      await pool.query(patchSql);
    }
    if (uploadMigrationSql) {
      await pool.query(uploadMigrationSql);
    }
    console.log('Postgres schema ready');
  } finally {
    await pool.end();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
