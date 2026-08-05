/**
 * Action/resource RBAC for GuideForge.
 *
 * Roles are scoped to an organization (memberships) or workspace
 * (workspace_members). Permissions are (action, resourceType) pairs resolved
 * against a user's effective roles.
 */
export const ROLES = [
  'organization-owner',
  'administrator',
  'library-manager',
  'author',
  'reviewer',
  'publisher',
  'operator',
  'auditor',
  'integration-service',
] as const;

export type Role = (typeof ROLES)[number];

export type Action =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'review'
  | 'approve'
  | 'publish'
  | 'sign'
  | 'audit'
  | 'manage-members'
  | 'collaborate';

export type ResourceType = 'guide' | 'workspace' | 'organization' | 'release' | 'source';

export interface Permission {
  action: Action;
  resource: ResourceType;
}

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  'organization-owner': all(),
  administrator: all(),
  'library-manager': [
    p('create', 'guide'),
    p('read', 'guide'),
    p('update', 'guide'),
    p('delete', 'guide'),
    p('create', 'source'),
    p('read', 'source'),
    p('collaborate', 'guide'),
    p('create', 'workspace'),
    p('manage-members', 'organization'),
  ],
  author: [
    p('create', 'guide'),
    p('read', 'guide'),
    p('update', 'guide'),
    p('create', 'source'),
    p('read', 'source'),
    p('review', 'guide'),
    p('collaborate', 'guide'),
  ],
  reviewer: [p('read', 'guide'), p('review', 'guide'), p('read', 'source')],
  publisher: [
    p('read', 'guide'),
    p('approve', 'guide'),
    p('publish', 'release'),
    p('read', 'release'),
  ],
  operator: [p('read', 'guide'), p('read', 'release')],
  auditor: [p('read', 'guide'), p('audit', 'organization'), p('read', 'release')],
  'integration-service': [p('read', 'guide'), p('update', 'guide'), p('read', 'release')],
};

function p(action: Action, resource: ResourceType): Permission {
  return { action, resource };
}

function all(): Permission[] {
  return (
    [
      'create',
      'read',
      'update',
      'delete',
      'review',
      'approve',
      'publish',
      'sign',
      'audit',
      'manage-members',
      'collaborate',
    ] as Action[]
  ).flatMap((action) =>
    (['guide', 'workspace', 'organization', 'release', 'source'] as ResourceType[]).map(
      (resource) => ({ action, resource }),
    ),
  );
}

export function hasPermission(
  roles: readonly Role[],
  action: Action,
  resource: ResourceType,
): boolean {
  return roles.some((role) => {
    const perms = ROLE_PERMISSIONS[role];
    return perms.some((perm) => perm.action === action && perm.resource === resource);
  });
}

export function requirePermission(
  roles: readonly Role[],
  action: Action,
  resource: ResourceType,
): void {
  if (!hasPermission(roles, action, resource)) {
    throw new PermissionDeniedError(`missing permission ${action}:${resource}`);
  }
}

export class PermissionDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermissionDeniedError';
  }
}
