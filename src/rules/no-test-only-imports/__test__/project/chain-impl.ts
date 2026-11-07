export const chainFn = 10;

// chain-mid.ts does not re-export this, so production never reaches it through
// the chain.ts barrel. Only the test imports it, thus a lint error.
export const chainOther = 10;
