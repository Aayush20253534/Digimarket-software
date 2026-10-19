// Reserved for BullMQ processes beginning with recurring tasks and notifications.
// No queue consumer is started in Module 1. Worker infrastructure is a future milestone.
export const workerModuleStatus = "not-started" as const;
