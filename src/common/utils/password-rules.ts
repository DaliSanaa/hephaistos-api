const PASSWORD_RE = /^(?=.*[A-Z])(?=.*\d).{8,}$/;

export function isStrongPassword(password: string): boolean {
  return PASSWORD_RE.test(password);
}

export const PASSWORD_RULES_MESSAGE =
  'Password must be at least 8 characters with one uppercase letter and one number';
