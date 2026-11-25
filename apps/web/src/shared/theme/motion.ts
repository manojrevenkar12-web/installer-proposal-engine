// Motion tokens: one orchestrated entrance per page, and responses to the user's actions.
export const ease = [0.22, 1, 0.36, 1] as const;
export const duration = { quick: 0.18, settle: 0.42, reveal: 0.7 } as const;
export const stagger = { section: 0.09, fact: 0.06 } as const;
