/** Bounds the agent loop: e.g. search → empty → retry → answer. Prevents runaway tool loops. */
export const MAX_STEPS = 5;
/** Only the recent past is sent to the model; the full history stays in the DB and the UI. */
export const MAX_HISTORY_MESSAGES = 20;
export const MAX_USER_TEXT = 2000;
