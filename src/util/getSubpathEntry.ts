import { splitPathIntoSegments } from './files.js';

// The keys passed to getSubpathEntry are package and repo root directories, so
// the set of distinct keys is small and bounded. Splitting is a pure function
// of the key string, so the segments are memoized for the life of the process.
const keySegmentsCache = new Map<string, string[]>();
function getKeySegments(path: string) {
  let segments = keySegmentsCache.get(path);
  if (!segments) {
    segments = splitPathIntoSegments(path);
    keySegmentsCache.set(path, segments);
  }
  return segments;
}

// Finds the entry in `data` whose key is the longest directory prefix of
// `filePath`. Prefixes are compared one whole path segment at a time, so a key
// of `/a/b` does not match a file at `/a/bc/d.ts`.
export function getSubpathEntry<T>({
  filePath,
  data,
}: {
  filePath: string;
  data: Map<string, T>;
}) {
  const filePathSegments = splitPathIntoSegments(filePath);
  let longestMatch: T | undefined;
  let longestMatchLength = -1;
  for (const [path, value] of data) {
    const pathSegments = getKeySegments(path);
    // A key that isn't longer than the current best can't win, so skip the
    // segment comparison entirely
    if (pathSegments.length <= longestMatchLength) {
      continue;
    }
    let isMatch = true;
    for (let i = 0; i < pathSegments.length; i++) {
      if (filePathSegments[i] !== pathSegments[i]) {
        isMatch = false;
        break;
      }
    }
    if (isMatch) {
      longestMatch = value;
      longestMatchLength = pathSegments.length;
    }
  }
  return longestMatch;
}
