import { starFn } from '../star-impl';
import { nsFn } from '../ns-impl';
import { barrelFn } from '../barrel-impl';
import { chainFn } from '../chain-mid';
import { chainOther } from '../chain-impl';
import type { KType } from '../k';
import type { KType as KStarType } from '../kstar';
import type { kns } from '../kns';
import * as m from '../m';

const k: KType = { x: 1 };
const kStar: KStarType = { x: 2 };
const kNs: kns.KType = { x: 3 };
console.log(starFn, nsFn, barrelFn, chainFn, chainOther, k, kStar, kNs, m);
