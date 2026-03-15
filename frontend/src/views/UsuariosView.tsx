import { useState, useEffect } from 'react'
import { UserPlus, Trash2, AlertCircle, Check, Shield } from 'lucide-react'
import { getUsers, updateUserRole, deactivateUser, getInvitations, createInvitation, deleteInvitation } from '../lib/api'
import type { User, Invitation, UserRole } from '../types'

const ROLE_LABELS: Record<string, string> = {
  root: 'Root',
  admin: 'Admin',
  confirmer: 'Confirmer',
  viewer: 'Viewer',
}

const ROLE_COLORS: Record<string, string> = {
  root: 'bg-amber-500/15 text-amber-400',
  admin: 'bg-blue-500/15 text-blue-400',
  confirmer: 'bg-emerald-500/15 text-emerald-400',
  viewer: 'bg-white/5 text-tertiary',
}

const ASSIGNABLE_ROLES: UserRole[] = ['admin', 'confirmer', 'viewer']

export function UsuariosView() {
  const [users, setUsers] = useState<User[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Invite form
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<UserRole>('viewer')
  const [inviting, setInviting] = useState(false)

  const fetchData = async () => {
    try {
      setLoading(true)
      const [u, i] = await Promise.all([getUsers(), getInvitations()])
      setUsers(u)
      setInvitations(i)
    } catch {
      setError('Error al cargar datos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const showSuccess = (msg: string) => {
    setSuccess(msg)
    setTimeout(() => setSuccess(''), 3000)
  }

  const handleRoleChange = async (userId: number, newRole: string) => {
    setError('')
    try {
      await updateUserRole(userId, newRole)
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole as UserRole } : u))
      showSuccess('Rol actualizado')
    } catch (err: any) {
      setError(err.message)
    }
  }

  const handleDeactivate = async (userId: number, userName: string) => {
    if (!confirm(`Desactivar a ${userName}?`)) return
    setError('')
    try {
      await deactivateUser(userId)
      setUsers(prev => prev.filter(u => u.id !== userId))
      showSuccess('Usuario desactivado')
    } catch (err: any) {
      setError(err.message)
    }
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    setInviting(true)
    setError('')
    try {
      const inv = await createInvitation(inviteEmail.trim(), inviteRole)
      setInvitations(prev => [inv, ...prev])
      setInviteEmail('')
      setInviteRole('viewer')
      showSuccess('Invitacion enviada')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setInviting(false)
    }
  }

  const handleDeleteInvitation = async (id: number) => {
    setError('')
    try {
      await deleteInvitation(id)
      setInvitations(prev => prev.filter(i => i.id !== id))
      showSuccess('Invitacion eliminada')
    } catch (err: any) {
      setError(err.message)
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-3">
        <div className="w-5 h-5 border-2 border-gold border-t-transparent rounded-full animate-spin" />
        <span className="text-secondary text-sm">Cargando usuarios...</span>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="font-headline text-3xl font-bold text-white">Usuarios</h1>
        <p className="text-secondary mt-1">Gestiona acceso y roles</p>
      </div>

      {/* Feedback */}
      {error && (
        <div className="flex items-center gap-2 p-3 mb-6 rounded-lg bg-red-500/10 border border-red-500/20">
          <AlertCircle size={16} className="text-red-400 shrink-0" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 p-3 mb-6 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <Check size={16} className="text-emerald-400 shrink-0" />
          <p className="text-sm text-emerald-400">{success}</p>
        </div>
      )}

      {/* Users Table */}
      <div className="rounded-xl border border-border bg-surface p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <Shield size={20} className="text-gold" />
          <h2 className="font-headline text-lg font-semibold text-white">Usuarios activos</h2>
          <span className="ml-auto text-xs text-tertiary">{users.length} usuarios</span>
        </div>

        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="flex items-center gap-4 p-3 rounded-lg bg-page border border-border">
              {u.picture ? (
                <img src={u.picture} alt={u.name} className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-border flex items-center justify-center">
                  <span className="text-xs text-secondary">{u.name?.[0]?.toUpperCase() || '?'}</span>
                </div>
              )}

              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{u.name || u.email}</p>
                <p className="text-xs text-tertiary truncate">{u.email}</p>
              </div>

              {u.role === 'root' ? (
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${ROLE_COLORS.root}`}>
                  {ROLE_LABELS.root}
                </span>
              ) : (
                <select
                  value={u.role}
                  onChange={(e) => handleRoleChange(u.id, e.target.value)}
                  className="bg-page border border-border rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-gold/50 transition-colors cursor-pointer"
                >
                  {ASSIGNABLE_ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              )}

              {u.role !== 'root' && (
                <button
                  onClick={() => handleDeactivate(u.id, u.name || u.email)}
                  className="p-1.5 rounded-md text-tertiary hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                  title="Desactivar usuario"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Invitations */}
      <div className="rounded-xl border border-border bg-surface p-6">
        <div className="flex items-center gap-3 mb-4">
          <UserPlus size={20} className="text-gold" />
          <h2 className="font-headline text-lg font-semibold text-white">Invitaciones</h2>
        </div>

        {/* Invite form */}
        <form onSubmit={handleInvite} className="flex items-end gap-3 mb-6">
          <div className="flex-1">
            <label className="block text-xs text-tertiary uppercase tracking-wider mb-1.5">Email</label>
            <input
              type="email"
              placeholder="usuario@gmail.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
              className="w-full bg-page border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-tertiary focus:outline-none focus:border-gold/50 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs text-tertiary uppercase tracking-wider mb-1.5">Rol</label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as UserRole)}
              className="bg-page border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold/50 transition-colors cursor-pointer"
            >
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={inviting}
            className="flex items-center gap-2 px-5 py-2.5 bg-gold/20 text-gold rounded-lg hover:bg-gold/30 transition-colors disabled:opacity-40 cursor-pointer"
          >
            <UserPlus size={14} />
            {inviting ? 'Invitando...' : 'Invitar'}
          </button>
        </form>

        {/* Pending invitations */}
        {invitations.length > 0 ? (
          <div className="space-y-2">
            {invitations.map((inv) => (
              <div key={inv.id} className="flex items-center gap-4 p-3 rounded-lg bg-page border border-border">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-mono">{inv.email}</p>
                  <p className="text-xs text-tertiary">
                    {inv.usedAt ? 'Usada' : 'Pendiente'} — {new Date(inv.createdAt).toLocaleDateString('es-CU')}
                  </p>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${ROLE_COLORS[inv.role] || ROLE_COLORS.viewer}`}>
                  {ROLE_LABELS[inv.role] || inv.role}
                </span>
                <button
                  onClick={() => handleDeleteInvitation(inv.id)}
                  className="p-1.5 rounded-md text-tertiary hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                  title="Eliminar invitacion"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-tertiary">No hay invitaciones pendientes</p>
        )}
      </div>
    </div>
  )
}
