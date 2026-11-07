import { relative } from 'node:path';

import type { AnalyzedPackageInfo } from '../../types/analyzed.js';
import { exitWithInternalError } from '../../util/error.js';
import {
  createRule,
  getESMInfo,
  getLocFromRange,
  isTypeOnly,
  registerUpdateListener,
} from '../util.js';

type Options = [];
type MessageIds = 'noCycles';

// Maximum number of nodes rendered in the displayed cycle path before we
// truncate the middle. Long cycles are unreadable past this point and the
// truncated form is more informative anyway.
const CYCLE_PATH_DISPLAY_CAP = 8;

// Strongly-connected component data, computed once per package via Tarjan's
// algorithm and cached. An edge `u → v` is part of a cycle iff `u === v` and
// `selfLoops.has(u)`, or `u !== v` and `sccId.get(u) === sccId.get(v)`. SCC
// membership is an intrinsic property of the import graph, so the result is
// independent of the order in which files are linted.
type SccData = {
  sccId: Map<string, number>;
  selfLoops: Set<string>;
};

const sccCaches = new Map<string, SccData>();

registerUpdateListener((root) => {
  sccCaches.delete(root);
});

// This is only used in tests, since update listeners aren't guaranteed to be
// called on each run. Name preserved for backward compatibility with existing
// test imports.
export function _testOnlyResetCycleMap() {
  sccCaches.clear();
}

// Returns the resolved file paths of all first-party, non-type import and
// reexport edges originating from `filePath`. The list intentionally excludes
// dynamic imports (which are runtime-only and are not considered cyclic by
// this rule) and matches the edge set used by the previous DFS.
function getOutgoingEdges(
  filePath: string,
  packageInfo: AnalyzedPackageInfo
): string[] {
  const fileDetails = packageInfo.files.get(filePath);
  if (!fileDetails || fileDetails.fileType !== 'code') {
    return [];
  }
  const edges: string[] = [];
  for (const importEntry of [
    ...fileDetails.singleImports,
    ...fileDetails.singleReexports,
    ...fileDetails.barrelImports,
    ...fileDetails.barrelReexports,
    ...fileDetails.sideEffectImports,
  ]) {
    if (
      // Type imports/reexports are erased at compile time, so they cannot
      // participate in runtime cycles
      isTypeOnly(importEntry) ||
      importEntry.resolvedModuleType !== 'firstPartyCode'
    ) {
      continue;
    }
    edges.push(importEntry.resolvedModulePath);
  }
  return edges;
}

// Iterative Tarjan's strongly-connected-components algorithm. Iterative form
// is required because the import graph in large repos (e.g. the VS Code
// codebase) is deep enough to overflow the JS call stack with the recursive
// formulation.
function computeSccs(packageInfo: AnalyzedPackageInfo): SccData {
  const sccId = new Map<string, number>();
  const selfLoops = new Set<string>();

  // Tarjan bookkeeping
  const index = new Map<string, number>();
  const lowLink = new Map<string, number>();
  const onStack = new Set<string>();
  const sccStack: string[] = [];
  let nextIndex = 0;
  let nextSccId = 0;

  type Frame = { node: string; edges: string[]; edgeIdx: number };
  const workStack: Frame[] = [];

  const pushNode = (v: string) => {
    index.set(v, nextIndex);
    lowLink.set(v, nextIndex);
    nextIndex++;
    sccStack.push(v);
    onStack.add(v);
    workStack.push({
      node: v,
      edges: getOutgoingEdges(v, packageInfo),
      edgeIdx: 0,
    });
  };

  for (const filePath of packageInfo.files.keys()) {
    if (index.has(filePath)) {
      continue;
    }
    const fileDetails = packageInfo.files.get(filePath);
    if (!fileDetails || fileDetails.fileType !== 'code') {
      continue;
    }
    pushNode(filePath);

    while (workStack.length > 0) {
      const frame = workStack[workStack.length - 1];
      const v = frame.node;

      if (frame.edgeIdx < frame.edges.length) {
        const w = frame.edges[frame.edgeIdx++];

        // A self-edge does not enlarge the SCC v sits in (Tarjan only links
        // through stack neighbors), but it does mean the edge itself is part
        // of a cycle. Track it separately.
        if (w === v) {
          selfLoops.add(v);
          continue;
        }

        const wDetails = packageInfo.files.get(w);
        if (!wDetails || wDetails.fileType !== 'code') {
          continue;
        }

        if (!index.has(w)) {
          // Tree edge: descend into w
          pushNode(w);
        } else if (onStack.has(w)) {
          // Back-edge: w is an ancestor in the current DFS, update v's lowlink
          const vLow = lowLink.get(v);
          const wIndex = index.get(w);
          /* istanbul ignore if */
          if (vLow === undefined || wIndex === undefined) {
            exitWithInternalError('Tarjan low/index missing for stacked nodes');
          }
          lowLink.set(v, Math.min(vLow, wIndex));
        }
        // else: cross-edge into a previously-completed SCC, ignored
      } else {
        // Finished exploring all edges from v
        workStack.pop();

        if (lowLink.get(v) === index.get(v)) {
          // v is the root of a new SCC; pop everything above it
          const id = nextSccId++;
          let popped: string | undefined;
          do {
            popped = sccStack.pop();
            /* istanbul ignore if */
            if (popped === undefined) {
              exitWithInternalError(
                'Tarjan SCC stack unexpectedly empty while popping component'
              );
            }
            onStack.delete(popped);
            sccId.set(popped, id);
          } while (popped !== v);
        }

        // Propagate v's lowlink up to the parent (the recursive equivalent of
        // `lowlink[parent] = min(lowlink[parent], lowlink[v])` after returning)
        if (workStack.length > 0) {
          const parent = workStack[workStack.length - 1];
          const parentLow = lowLink.get(parent.node);
          const vLow = lowLink.get(v);
          /* istanbul ignore if */
          if (parentLow === undefined || vLow === undefined) {
            exitWithInternalError(
              'Tarjan lowlink missing while propagating to parent'
            );
          }
          lowLink.set(parent.node, Math.min(parentLow, vLow));
        }
      }
    }
  }

  return { sccId, selfLoops };
}

function getSccData(packageInfo: AnalyzedPackageInfo): SccData {
  let scc = sccCaches.get(packageInfo.packageRootDir);
  if (!scc) {
    scc = computeSccs(packageInfo);
    sccCaches.set(packageInfo.packageRootDir, scc);
  }
  return scc;
}

function isEdgeInCycle(u: string, v: string, scc: SccData): boolean {
  if (u === v) {
    return scc.selfLoops.has(u);
  }
  const idU = scc.sccId.get(u);
  if (idU === undefined) {
    return false;
  }
  return idU === scc.sccId.get(v);
}

// Recovers a representative cycle path `[u, v, ..., u]` for an edge `u → v`
// known to be part of a cycle. Uses BFS within the shared SCC, so the
// recovered path is a shortest cycle through the edge. Returns undefined for
// the unexpected case where the path could not be found (treated as
// best-effort; the rule still reports the violation, just with a fallback
// message).
function findCyclePath(
  u: string,
  v: string,
  packageInfo: AnalyzedPackageInfo,
  scc: SccData
): string[] | undefined {
  // Self-edge: the cycle is u → u directly
  if (u === v) {
    return [u, u];
  }

  const targetSccId = scc.sccId.get(u);
  /* istanbul ignore if */
  if (targetSccId === undefined || targetSccId !== scc.sccId.get(v)) {
    return undefined;
  }

  // BFS from v looking for u, restricted to nodes in the same SCC. Since u
  // and v share an SCC, a path is guaranteed to exist and the BFS is bounded
  // by the SCC's size.
  const visited = new Set<string>([v]);
  const parents = new Map<string, string>();
  const queue: string[] = [v];

  search: while (queue.length > 0) {
    const current = queue.shift();
    /* istanbul ignore if */
    if (current === undefined) {
      break;
    }
    for (const next of getOutgoingEdges(current, packageInfo)) {
      if (visited.has(next)) {
        continue;
      }
      if (scc.sccId.get(next) !== targetSccId) {
        continue;
      }
      visited.add(next);
      parents.set(next, current);
      if (next === u) {
        break search;
      }
      queue.push(next);
    }
  }

  /* istanbul ignore if */
  if (!parents.has(u)) {
    return undefined;
  }

  // Reconstruct path v → ... → u, then prepend u to form the closed cycle.
  const pathFromV: string[] = [u];
  let cursor = u;
  while (cursor !== v) {
    const p = parents.get(cursor);
    /* istanbul ignore if */
    if (p === undefined) {
      exitWithInternalError(`Could not reconstruct cycle path for ${u} → ${v}`);
    }
    pathFromV.unshift(p);
    cursor = p;
  }
  return [u, ...pathFromV];
}

function renderCyclePath(
  packageRootDir: string,
  cycle: string[] | undefined
): string {
  /* istanbul ignore if */
  if (!cycle || cycle.length === 0) {
    return '<cycle path unavailable>';
  }
  const toLabel = (filePath: string) =>
    relative(packageRootDir, filePath) || filePath;

  if (cycle.length <= CYCLE_PATH_DISPLAY_CAP + 1) {
    return cycle.map(toLabel).join(' → ');
  }

  // Truncate: keep first half and last half of the display cap, indicate the
  // omitted middle. The path always starts and ends at the same file (the
  // current rule's anchor), so the head/tail bias is informative.
  const headSize = Math.ceil(CYCLE_PATH_DISPLAY_CAP / 2);
  const tailSize = Math.floor(CYCLE_PATH_DISPLAY_CAP / 2);
  const head = cycle.slice(0, headSize);
  const tail = cycle.slice(cycle.length - tailSize);
  const omitted = cycle.length - head.length - tail.length;
  return [
    ...head.map(toLabel),
    `... ${String(omitted)} more file${omitted === 1 ? '' : 's'} ...`,
    ...tail.map(toLabel),
  ].join(' → ');
}

export const noCycle = createRule<Options, MessageIds>({
  name: 'no-cycle',
  meta: {
    docs: {
      description: 'Ensures that there are no cycles in imports/reexports',
    },
    schema: [],
    fixable: undefined,
    type: 'problem',
    messages: {
      noCycles: 'Imports/reexports cannot form a cycle: {{cyclePath}}',
    },
  },
  defaultOptions: [],
  create(context) {
    const esmInfo = getESMInfo(context);

    // No package info means this file wasn't found as part of the package,
    // e.g. because it's ignored
    /* istanbul ignore if */
    if (!esmInfo) {
      return {};
    }

    const { fileInfo, packageInfo } = esmInfo;
    /* istanbul ignore if */
    if (fileInfo.fileType !== 'code') {
      return {};
    }

    const scc = getSccData(packageInfo);

    // Dedupe by target so multiple imports of the same file produce one
    // report, matching the previous rule's behavior.
    const reportedTargets = new Set<string>();

    // We intentionally skip dynamic imports because they are always safe to
    // import in a cycle, since they're guaranteed to happen after the entire
    // file is done loading (and thus can't cause a deadlock), but they're the
    // only type of import this is true of. Side effect imports can still cause
    // deadlock issues though, especially if they modify globalThis.
    for (const importEntry of [
      ...fileInfo.singleImports,
      ...fileInfo.singleReexports,
      ...fileInfo.barrelImports,
      ...fileInfo.barrelReexports,
      ...fileInfo.sideEffectImports,
    ]) {
      if (
        isTypeOnly(importEntry) ||
        importEntry.resolvedModuleType !== 'firstPartyCode'
      ) {
        continue;
      }
      const target = importEntry.resolvedModulePath;
      if (reportedTargets.has(target)) {
        continue;
      }
      if (!isEdgeInCycle(context.filename, target, scc)) {
        continue;
      }
      reportedTargets.add(target);
      const cycle = findCyclePath(context.filename, target, packageInfo, scc);
      context.report({
        messageId: 'noCycles',
        loc: getLocFromRange(context, importEntry.statementNodeRange),
        data: {
          cyclePath: renderCyclePath(packageInfo.packageRootDir, cycle),
        },
      });
    }

    return {};
  },
});
