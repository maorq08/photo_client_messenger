/**
 * SQLite Backup Script for Cloudflare R2
 *
 * This script creates a consistent backup of the SQLite database
 * and uploads it to Cloudflare R2 for disaster recovery.
 *
 * Prerequisites:
 *   npm install @aws-sdk/client-s3
 *
 * Environment Variables Required:
 * - R2_ENDPOINT: https://<account-id>.r2.cloudflarestorage.com
 * - R2_ACCESS_KEY: Your R2 access key
 * - R2_SECRET_KEY: Your R2 secret key
 * - R2_BUCKET: Bucket name (e.g., photo-messenger-backups)
 *
 * Usage:
 *   npx tsx server/backup.ts
 *
 * Recommended: Run daily via cron at 3am UTC
 *   0 3 * * * cd /app && npx tsx server/backup.ts >> /var/log/backup.log 2>&1
 */

import 'dotenv/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import Database from 'better-sqlite3';
import { readFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';

const dataDir = process.env.DATA_DIR || join(process.cwd(), 'data');
const dbPath = join(dataDir, 'app.db');
const sessionsDbPath = join(dataDir, 'sessions.db');

// Check required environment variables
const requiredEnvVars = ['R2_ENDPOINT', 'R2_ACCESS_KEY', 'R2_SECRET_KEY', 'R2_BUCKET'];
const missingVars = requiredEnvVars.filter(v => !process.env[v]);

if (missingVars.length > 0) {
  console.error('Missing required environment variables:', missingVars.join(', '));
  console.error('\nThis script is ready for use when you deploy to Railway.');
  console.error('Set up a Cloudflare R2 bucket and configure these environment variables.');
  process.exit(1);
}

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY!,
    secretAccessKey: process.env.R2_SECRET_KEY!,
  },
});

async function backupDatabase(sourcePath: string, name: string): Promise<void> {
  if (!existsSync(sourcePath)) {
    console.log(`Skipping ${name}: database file not found`);
    return;
  }

  const backupPath = `${sourcePath}.backup`;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const s3Key = `${name}/${timestamp}.db`;

  console.log(`Backing up ${name}...`);

  // Use SQLite's backup API for consistency
  const db = new Database(sourcePath, { readonly: true });
  try {
    db.backup(backupPath);
    console.log(`  Created local backup: ${backupPath}`);
  } finally {
    db.close();
  }

  // Upload to R2
  const fileContent = readFileSync(backupPath);
  await s3.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: s3Key,
    Body: fileContent,
    ContentType: 'application/x-sqlite3',
  }));
  console.log(`  Uploaded to R2: ${s3Key}`);

  // Clean up local backup
  unlinkSync(backupPath);
  console.log(`  Cleaned up local backup`);
}

async function main() {
  console.log(`\n=== SQLite Backup Started at ${new Date().toISOString()} ===\n`);

  try {
    await backupDatabase(dbPath, 'app');
    await backupDatabase(sessionsDbPath, 'sessions');
    console.log('\n=== Backup completed successfully ===\n');
  } catch (error) {
    console.error('\n=== Backup failed ===');
    console.error(error);
    process.exit(1);
  }
}

main();
