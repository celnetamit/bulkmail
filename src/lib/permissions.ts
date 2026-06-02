export type Role = 'ADMIN' | 'MANAGER' | 'USER';

export type Capability =
  | 'manage_users'
  | 'manage_settings'
  | 'manage_ai_agents'
  | 'manage_teams'
  | 'view_resource_analytics'
  | 'view_audit_trail'
  | 'use_agents'
  | 'execute_worker_actions'
  | 'manage_own_lists'
  | 'manage_own_campaigns'
  | 'manage_own_templates'
  | 'manage_own_contacts';

const ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  ADMIN: [
    'manage_users',
    'manage_settings',
    'manage_ai_agents',
    'manage_teams',
    'view_resource_analytics',
    'view_audit_trail',
    'use_agents',
    'execute_worker_actions',
    'manage_own_lists',
    'manage_own_campaigns',
    'manage_own_templates',
    'manage_own_contacts',
  ],
  MANAGER: [
    'manage_teams',
    'view_resource_analytics',
    'use_agents',
    'execute_worker_actions',
    'manage_own_lists',
    'manage_own_campaigns',
    'manage_own_templates',
    'manage_own_contacts',
  ],
  USER: [
    'use_agents',
    'manage_own_lists',
    'manage_own_campaigns',
    'manage_own_templates',
    'manage_own_contacts',
  ],
};

export function hasCapability(role: Role | string, capability: Capability) {
  const normalizedRole = (role || 'USER').toString().toUpperCase() as Role;
  return ROLE_CAPABILITIES[normalizedRole]?.includes(capability) || false;
}

export function getCapabilities(role: Role | string) {
  const normalizedRole = (role || 'USER').toString().toUpperCase() as Role;
  return ROLE_CAPABILITIES[normalizedRole] || ROLE_CAPABILITIES.USER;
}

