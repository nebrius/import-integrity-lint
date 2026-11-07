export const nodefaultNsOwn = 1;
// Named `default`, so a bare `export *` of this file does not forward it
export * as default from './nodefault-impl';
