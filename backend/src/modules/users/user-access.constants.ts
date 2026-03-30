export const STAFF_ASSIGNABLE_MODULE_KEYS = ["purchase"] as const;

export type StaffAssignableModuleKey = (typeof STAFF_ASSIGNABLE_MODULE_KEYS)[number];
