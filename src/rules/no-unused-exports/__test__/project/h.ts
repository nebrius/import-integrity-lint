import * as g from './g';
import { iFn } from './i';
import { join } from './k';
import { nodePath } from './m';

async function load() {
  return import('./o');
}

console.log(g, iFn, join, nodePath, load);
