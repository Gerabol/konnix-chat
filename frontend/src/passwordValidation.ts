export const PASSWORD_RULES = {
  minLength: 8,
  maxLength: 128,
}

export function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_RULES.minLength) return `A senha deve ter pelo menos ${PASSWORD_RULES.minLength} caracteres`
  if (password.length > PASSWORD_RULES.maxLength) return `A senha deve ter no máximo ${PASSWORD_RULES.maxLength} caracteres`
  return null
}
