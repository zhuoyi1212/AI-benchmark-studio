const internalProjectNames = [
  /^\[E2E\](?:\s|$)/i,
  /^AUTO DEMO(?:\s|·|$)/i,
  /^快速模式复用验证(?:\s|$)/,
];

export function isInternalValidationProject(project: { name: string }): boolean {
  const name = project.name.trim();
  return internalProjectNames.some((pattern) => pattern.test(name));
}
