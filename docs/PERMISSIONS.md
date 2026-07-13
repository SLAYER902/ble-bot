# Permissions and hierarchy

BLE Bot checks internal authorization and Discord permissions. A visible slash-command permission is not sufficient authority for sensitive operations.

Core setup requires View Audit Log, Manage Roles, and Manage Webhooks. Backup capture requires View Channel. The eventual moderation and ticket features additionally need the specific Discord permission for each action.

Discord hierarchy is authoritative: BLE Bot cannot manage a role equal to or above its highest role, cannot moderate a member above it, and cannot act against the guild owner. `/setup diagnostics` and `/security status` explain missing prerequisites rather than claiming full protection.
