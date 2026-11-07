export const nodefaultSingleOwn = 1;
// Named `default`, so a bare `export *` of this file does not forward it
export { nodefaultImpl as default } from './nodefault-impl';
