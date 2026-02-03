# ADR-001: Cloud Hosting Selection

## Status

Proposed

## Context

We need to deploy a SQLite-based SaaS application (Photo Client Messenger) for approximately 50 users. The application uses:

- Express.js backend with TypeScript
- React PWA frontend
- SQLite database (better-sqlite3)
- Session-based authentication stored in SQLite
- AI integrations (Anthropic Claude, Groq Whisper)

Key requirements:
- Persistent disk storage for SQLite
- HTTPS for PWA support
- Cost-effective for small user base
- Simple deployment workflow
- Portable architecture (avoid vendor lock-in)

## Decision

Use **Railway** with persistent volumes for deployment.

## Rationale

### Why Railway

| Factor | Assessment |
|--------|------------|
| SQLite Support | Persistent volumes, zero config |
| Cost | ~$5/month (usage-based) |
| Complexity | Git push deploys |
| HTTPS | Automatic, free |
| Migration Path | Standard Dockerfile, portable |

Railway's pricing model:
- Trial: $5 one-time credit (no credit card required)
- Hobby: $5/month after trial

### Alternatives Considered

**Fly.io**
- Pros: More features, global edge deployment
- Cons: Overkill for 50 users, more complex setup with Litefs/Litestream
- Decision: Rejected - unnecessary complexity

**Render**
- Pros: Good developer experience
- Cons: More expensive ($7-14/month), free tier has no persistent disk
- Decision: Rejected - cost and no SQLite support on free tier

**VPS (DigitalOcean, Linode, etc.)**
- Pros: Cheaper ($3-5/month), full control
- Cons: DevOps burden (updates, security, backups, monitoring)
- Decision: Rejected - $2/month savings not worth DevOps overhead

**Kubernetes / Container Orchestration**
- Pros: Enterprise-grade scalability
- Cons: Massive complexity for a 50-user app
- Decision: Rejected - enterprise astronaut architecture

## Consequences

### Positive
- Simple deployment: `git push` or `railway up`
- SQLite works out of the box with volumes
- Standard Dockerfile means easy migration if needed
- $5/month fits bootstrap budget

### Negative
- Single region deployment (acceptable for 50 users)
- No built-in database replication
- Requires separate backup strategy (R2)

### Risks
- Railway is a smaller company - monitor for service changes
- Volume storage limits (currently generous)

## Migration Triggers

Revisit this decision when:
- 1000+ concurrent users (SQLite write lock bottleneck)
- Multi-region requirement (SQLite doesn't replicate)
- Database exceeds 10GB (backup/restore slowdown)

Until these triggers occur, this architecture is appropriate.
