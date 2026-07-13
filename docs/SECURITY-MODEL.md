# Security model

BLE Shield treats gateway events as observations, not proof of attribution. It waits through bounded jittered audit-log retries, scores candidate matches by action, target, and time, and leaves the actor unknown when confidence is inadequate.

Automatic containment requires all of the following: an attributable actor, configured confidence threshold, no guild-owner target, no applicable maintenance allowance, a non-monitor response mode, and a safe Discord hierarchy. Redis failure moves the guild to `DEGRADED` and disables automated containment.

Containment is intentionally narrow: it can remove a confirmed administrator role from a manageable actor or remove a confirmed webhook. It does not ban the owner, delete roles en masse, apply uncontrolled overwrite changes, or retry impossible hierarchy actions.

Every security event and decision is recorded in a durable incident timeline. Automation should be reviewed by trusted responders before recovery.
