export const a1 = 10;
export const a2 = 10;

// This one is only imported in tests. That still counts as usage for this
// rule; flagging test-only usage is no-test-only-imports' job.
export const a3 = 10;

// This one is not imported, thus a lint error
export const a4 = 10;
