export class AIConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIConfigurationError";
  }
}

export class AIProviderError extends Error {
  readonly provider: string;
  readonly status: number | null;

  constructor(provider: string, message: string, status: number | null = null) {
    super(message);
    this.name = "AIProviderError";
    this.provider = provider;
    this.status = status;
  }
}

export class AIValidationError extends Error {
  readonly task: string;
  readonly schemaName: string;

  constructor(task: string, schemaName: string) {
    super(`AI response failed runtime validation for ${task}`);
    this.name = "AIValidationError";
    this.task = task;
    this.schemaName = schemaName;
  }
}
