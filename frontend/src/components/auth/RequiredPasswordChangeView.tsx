import { useState } from 'react'
import type { FormEvent } from 'react'
import { api, ApiError } from '../../api'
import type { User } from '../../api'
import { validatePassword } from '../../passwordValidation'

export function RequiredPasswordChangeView({
  onLogout,
  onCompleted,
}: {
  onLogout: () => void
  onCompleted: (user: User) => void
}) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const passwordError = validatePassword(password)
    if (passwordError) {
      setError(passwordError)
      return
    }
    if (password !== confirmation) {
      setError('As senhas não coincidem.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      onCompleted(await api.changeRequiredPassword(password, confirmation))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar a nova senha')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card-wrap">
        <div className="login-card required-password-card">
          <div className="brand">
            <div className="brand-signature">
              <img className="brand-logo" src="/icons/Konnix white.png" alt="Konnix" />
              <div className="brand-wordmark">
                <strong>Konnix</strong>
                <span>Chat</span>
              </div>
            </div>
            <h1>Defina uma nova senha</h1>
            <p>Sua senha foi redefinida por um administrador. Para continuar, escolha uma nova senha.</p>
          </div>
          <form onSubmit={submit} className="login-form">
            <label>
              Nova senha
              <span className="password-input-wrap">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((visible) => !visible)}
                >
                  {showPassword ? 'Ocultar' : 'Exibir'}
                </button>
              </span>
            </label>
            <label>
              Confirmar nova senha
              <span className="password-input-wrap">
                <input
                  type={showConfirmation ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowConfirmation((visible) => !visible)}
                >
                  {showConfirmation ? 'Ocultar' : 'Exibir'}
                </button>
              </span>
            </label>
            {error && <p className="form-error">{error}</p>}
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Salvando…' : 'Salvar nova senha'}
            </button>
            <button type="button" className="btn-ghost" onClick={onLogout} disabled={loading}>
              Sair
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
