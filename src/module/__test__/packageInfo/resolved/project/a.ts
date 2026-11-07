/* @ts-expect-error this isn't configured in tsconfig, but works in this project */
import { b1 } from '@/one/b';
/* @ts-expect-error this is allowed in Webpack et al, but not in pure TS projects */
import data from './one/c/data';
import type { D2 } from './two/d';
import { getD1 } from './two/d';
import { e1 } from './two/e';
import type { F1 } from './two/f';
import { getF1 } from './two/f';
import { join } from 'path';
import { resolve } from 'node:path';
import { parser } from 'typescript-eslint';
import { index } from '.';
/* @ts-expect-error this isn't configured in tsconfig, but works in this project */
import { b1 } from '@alias';
/* @ts-expect-error this isn't configured in tsconfig, but works in this project */
import { h } from '@hidden';
import type * as dTypes from './two/d';
import * as dValues from './two/d';

export type * from './two/f';
export * from './two/f';

console.log(b1);
console.log(h);
console.log(data);
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
console.log(getD1() as D2);
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
console.log(dValues.getD1() as dTypes.D2);
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
console.log(getF1() as F1);
console.log(e1);
console.log(join, resolve);
console.log(parser);
console.log(index);
