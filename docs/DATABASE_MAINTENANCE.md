# Database Maintenance & Operations Guide

## Overview
Skyline Student Association uses a resilient SQL relational database architecture powered by **Knex.js** with support for SQLite in development and PostgreSQL in production.

## Database Migrations
Migrations are located in `/database/migrations` and run sequentially using timestamp versioning.

### Executing Migrations
```bash
npm run db:migrate --workspace=backend
```

## Schema & Tables Summary
| Table | Description | Key Indexes |
|---|---|---|
| `users` | Member and Admin accounts | `email` (unique), `role` |
| `events` | Association events and tickets | `category`, `date`, `status` |
| `event_registrations` | Ticket passes & check-in QR | `(event_id, status)`, `user_id` |
| `products` | Merchandise store items | `is_featured`, `stock_quantity` |
| `orders` | Store purchases & merchandise dues | `(user_id, status)` |
| `audit_logs` | Immutable security trail of admin ops | `created_at`, `action`, `entity_type` |
| `user_preferences` | Member email & notification settings | `user_id` (unique) |

## Database Backups
Automated JSON and SQL snapshots can be triggered via `backend/src/scripts/dbbackup.ts`.
