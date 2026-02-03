# ADR-002: SQLite Persistence Strategy

## Status

Proposed

## Context

SQLite is our database choice (see earlier project decisions). For cloud deployment, we need a strategy for:

1. **Persistence** - SQLite data must survive container restarts and redeploys
2. **Disaster Recovery** - Protection against data loss
3. **Consistency** - Backups must be transactionally consistent

## Decision

Use **Railway persistent volumes** for runtime persistence, combined with **daily Cloudflare R2 backups** for disaster recovery.

## Implementation

### Persistent Volumes

Railway configuration mounts a volume at `/app/data`:
- `app.db` - Main application database
- `sessions.db` - Session storage

Volume persists across:
- Container restarts
- Application redeploys
- Railway platform updates

### Backup Strategy

**Tool:** `server/backup.ts`

**Schedule:** Daily at 3am UTC

**Process:**
1. Use SQLite's `.backup` API for consistent snapshot
2. Upload to Cloudflare R2 bucket
3. Retain backups with timestamp naming

**R2 Benefits:**
- 10GB free tier (more than sufficient)
- S3-compatible API
- No egress fees

### Environment Variables

```bash
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY=<access-key>
R2_SECRET_KEY=<secret-key>
R2_BUCKET=photo-messenger-backups
```

## Rationale

### Why Volumes + R2 (not Litestream/Litefs)

**Litestream** (continuous replication to S3)
- Pros: Near-zero RPO (Recovery Point Objective)
- Cons: Added complexity, another running process
- Decision: Overkill for 50 users with daily activity

**Litefs** (distributed SQLite)
- Pros: Multi-region replication
- Cons: Significant complexity, Fly.io ecosystem
- Decision: Not needed for single-region deployment

**Daily R2 Backups**
- Pros: Simple, free, sufficient for use case
- Cons: Up to 24-hour data loss in disaster
- Decision: Acceptable trade-off for simplicity

### Recovery Point Objective (RPO)

- **Maximum data loss:** 24 hours
- **Acceptable because:** Daily backup captures all meaningful business data
- **Mitigation:** Users can re-enter recent messages if needed

### Recovery Time Objective (RTO)

- **Target:** < 30 minutes
- **Process:** Download latest backup from R2, restore to new volume
- **Tested:** Part of deployment verification checklist

## Consequences

### Positive
- Zero additional cost (R2 free tier)
- Simple backup script, easy to verify
- No additional runtime processes
- Portable to any S3-compatible storage

### Negative
- Up to 24-hour data loss in catastrophic failure
- Manual restore process (could be automated)
- No point-in-time recovery

### Future Improvements (if needed)

1. **Reduce RPO:** Increase backup frequency to every 6 hours
2. **Automated restore:** Script to restore from R2 to fresh Railway volume
3. **Continuous replication:** Add Litestream if RPO < 1 hour needed

## Verification

- [ ] Backup script runs successfully
- [ ] Backup appears in R2 bucket
- [ ] Downloaded backup can be opened with SQLite
- [ ] Restore process documented and tested
