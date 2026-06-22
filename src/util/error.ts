import type { TSESTree } from '@typescript-eslint/utils';

type SourceDetails = {
  filePath: string;
  fileContents?: string;
  range: TSESTree.Node['range'];
};

// Oxlint does this incredibly stupid thing where it swallows all exceptions
// and attempts to keep running. This means plugins that legitimately throw an
// exception because they are in a state where they cannot process files, like
// sometimes happens in this plugin, means they're forced to continue running
// in a broken state and giving invalid output. Or worse, it breaks internal
// caching and causes performance to slow to a crawl. So we have to force it to
// exit with an error code instead of doing the normal thing of throwing an
// exception.

/* istanbul ignore next */
class InternalError extends Error {
  constructor(message: string, sourceDetails?: SourceDetails) {
    let formattedMessage = `Internal error: ${message}. This is a bug, please report the message and the stack trace to the maintainer at https://github.com/nebrius/import-integrity-lint/issues`;
    if (sourceDetails) {
      if (sourceDetails.fileContents) {
        formattedMessage += `\n\nIn ${sourceDetails.filePath}:\n\n${sourceDetails.fileContents.substring(sourceDetails.range[0], sourceDetails.range[1])}\n`;
      } else {
        formattedMessage += `\n\nIn ${sourceDetails.filePath}\n`;
      }
    }
    super(formattedMessage);
  }
}

/* istanbul ignore next */
export function exitWithError(message: string): never {
  console.error(message);
  process.exit(1);
}

/* istanbul ignore next */
export function exitWithException(error: unknown): never {
  if (error instanceof Error) {
    console.error(error.message);
    console.error(error.stack);
  } else {
    console.error(String(error));
  }
  process.exit(1);
}

/**
 * An error reporting function that adds special formatting for internal errors,
 * including printing out what file and AST node was being processed when the
 * error occured
 */
/* istanbul ignore next */
export function exitWithInternalError(
  message: string,
  sourceDetails?: SourceDetails
): never {
  const error = new InternalError(message, sourceDetails);
  console.error(error.message);
  console.error(error.stack);
  process.exit(1);
}
