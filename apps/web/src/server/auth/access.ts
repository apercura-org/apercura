/**
 * Organization roles and what each one may do (Better Auth access control).
 *
 * - owner: everything, including the team, opening the agenda and the audit log.
 * - practitioner: their agenda and their public page.
 * - assistant: the agenda only; no page edits, no security settings.
 *
 * Platform administrators are not an organization role: see `user.isPlatformAdmin`.
 * Pure module, safe to import from tests and client code.
 */
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/organization/access";

export const statements = {
	...defaultStatements,
	agenda: ["read", "write", "open"],
	page: ["read", "update"],
	security: ["read", "update"],
	audit: ["read"],
} as const;

export const ac = createAccessControl(statements);

export const owner = ac.newRole({
	organization: ["update", "delete"],
	member: ["create", "update", "delete"],
	invitation: ["create", "cancel"],
	agenda: ["read", "write", "open"],
	page: ["read", "update"],
	security: ["read", "update"],
	audit: ["read"],
});

export const practitioner = ac.newRole({
	agenda: ["read", "write"],
	page: ["read", "update"],
});

export const assistant = ac.newRole({
	agenda: ["read", "write"],
});

export const roles = { owner, practitioner, assistant };

export type OrganizationRole = keyof typeof roles;

export const ORGANIZATION_ROLES = Object.keys(roles) as OrganizationRole[];

type Statements = typeof statements;

/** A permission request, e.g. `{ agenda: ["write"] }`. */
export type Permissions = { [Resource in keyof Statements]?: Statements[Resource][number][] };

/**
 * Whether a stored member role grants every requested permission. Better Auth
 * stores several roles comma-separated; unknown roles grant nothing.
 */
export function roleCan(storedRole: string, permissions: Permissions): boolean {
	const requested = Object.entries(permissions).filter(([, actions]) => actions?.length);
	if (requested.length === 0) {
		return false;
	}
	return storedRole
		.split(",")
		.map((name) => name.trim())
		.some((name) => {
			if (!Object.hasOwn(roles, name)) {
				return false;
			}
			return roles[name as OrganizationRole].authorize(permissions as never).success;
		});
}
