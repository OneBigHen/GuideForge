import { relations } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/** Organization */
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** User (local identity linked to OIDC subject) */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    oidcSubject: text('oidc_subject').notNull(),
    oidcIssuer: text('oidc_issuer').notNull(),
    email: text('email').notNull(),
    displayName: text('display_name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('users_oidc_unique').on(t.oidcIssuer, t.oidcSubject)],
);

/** Organization membership + role */
export const memberships = pgTable(
  'memberships',
  {
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.userId] })],
);

/** Workspace within an org */
export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] })],
);

/** Guide metadata (authoritative server copy mirrors the local snapshot) */
export const guides = pgTable(
  'guides',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    title: text('title').notNull(),
    lifecycleState: text('lifecycle_state').notNull().default('draft'),
    /** Yjs document name used by the collab service. */
    docName: text('doc_name').notNull(),
    schemaVersion: integer('schema_version').notNull().default(1),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('guides_workspace_idx').on(t.workspaceId)],
);

/** Review submissions */
export const reviews = pgTable('reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  guideId: uuid('guide_id')
    .notNull()
    .references(() => guides.id),
  requestedBy: uuid('requested_by')
    .notNull()
    .references(() => users.id),
  status: text('status').notNull().default('in-review'),
  contentHash: text('content_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
});

/** Approvals (immutable records; content change invalidates prior approvals) */
export const approvals = pgTable('approvals', {
  id: uuid('id').primaryKey().defaultRandom(),
  guideId: uuid('guide_id')
    .notNull()
    .references(() => guides.id),
  reviewId: uuid('review_id')
    .notNull()
    .references(() => reviews.id),
  approverId: uuid('approver_id')
    .notNull()
    .references(() => users.id),
  decision: text('decision').notNull(), // 'approved' | 'rejected'
  contentHash: text('content_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Append-only audit events */
export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull(),
    actorId: uuid('actor_id'),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id').notNull(),
    metadata: jsonb('metadata'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_org_idx').on(t.organizationId, t.occurredAt)],
);

/** Released (immutable) release metadata; signing lands Phase 07. */
export const releases = pgTable('releases', {
  id: uuid('id').primaryKey().defaultRandom(),
  guideId: uuid('guide_id')
    .notNull()
    .references(() => guides.id),
  status: text('status').notNull().default('active'),
  contentHash: text('content_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Short-lived collaboration room tickets (server-side ledger) */
export const roomTickets = pgTable('room_tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  guideId: uuid('guide_id')
    .notNull()
    .references(() => guides.id),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  used: integer('used').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const relationsMap = {
  guidesRelations: relations(guides, ({ one }) => ({
    workspace: one(workspaces, { fields: [guides.workspaceId], references: [workspaces.id] }),
  })),
};
