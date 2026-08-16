import "server-only";

type DatabaseErrorLike = {
  code?: string;
  message: string;
};

export class RepositoryError extends Error {
  readonly operation: string;
  readonly code?: string;

  constructor(operation: string, cause: DatabaseErrorLike) {
    super(`Database operation failed: ${operation}`);
    this.name = "RepositoryError";
    this.operation = operation;
    this.code = cause.code;
    this.cause = cause;
  }
}

export function throwRepositoryError(operation: string, error: DatabaseErrorLike): never {
  throw new RepositoryError(operation, error);
}
