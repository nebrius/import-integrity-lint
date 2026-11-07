// @ts-expect-error `export *` never forwards a default export, so this import is unresolvable
import def from './entry-star';

console.log(def);
