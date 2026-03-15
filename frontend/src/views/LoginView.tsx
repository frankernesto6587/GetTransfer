import { useEffect, useState } from 'react'
import { AlertCircle } from 'lucide-react'

const ERROR_MESSAGES: Record<string, string> = {
  no_invitation: 'No tienes invitacion. Contacta al administrador.',
  account_disabled: 'Tu cuenta ha sido desactivada.',
  token_failed: 'Error de autenticacion con Google. Intenta de nuevo.',
  no_code: 'Error en el flujo de autenticacion. Intenta de nuevo.',
}

export function LoginView() {
  const [error, setError] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const errorCode = params.get('error')
    if (errorCode) {
      setError(ERROR_MESSAGES[errorCode] || `Error: ${errorCode}`)
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  return (
    <div className="min-h-screen bg-page flex items-center justify-center">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-gold flex items-center justify-center">
            <span className="font-headline text-2xl font-bold text-page">G</span>
          </div>
          <span className="font-headline text-2xl font-semibold tracking-wide text-white">
            GETTRANSFER
          </span>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-border bg-surface p-8">
          <h2 className="text-lg font-semibold text-white text-center mb-2">Iniciar sesion</h2>
          <p className="text-sm text-secondary text-center mb-6">
            Accede con tu cuenta de Google autorizada
          </p>

          {error && (
            <div className="flex items-start gap-2 p-3 mb-6 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <a
            href="/api/auth/google"
            className="flex items-center justify-center gap-3 w-full px-4 py-3 rounded-lg bg-white text-gray-800 font-medium text-sm hover:bg-gray-100 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
              <path d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.166 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
            Entrar con Google
          </a>
        </div>

        <p className="text-xs text-tertiary text-center mt-6">
          Solo cuentas autorizadas por invitacion
        </p>
      </div>
    </div>
  )
}
