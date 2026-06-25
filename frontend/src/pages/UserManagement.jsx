import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Plus, ShieldCheck, ShieldOff } from 'lucide-react';
import api, { getErrorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';

const EMPTY_FORM = { username: '', password: '', full_name: '', role: 'staff' };

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/auth/users');
      setUsers(data.users);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/auth/users', form);
      toast.success('Staff account created.');
      setModalOpen(false);
      setForm(EMPTY_FORM);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (u) => {
    if (u.id === currentUser.id) {
      toast.error('You cannot deactivate your own account.');
      return;
    }
    try {
      await api.patch(`/auth/users/${u.id}`, { is_active: u.is_active ? 0 : 1 });
      toast.success(`Account ${u.is_active ? 'deactivated' : 'activated'}.`);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-primary-900">Staff Accounts</h1>
          <p className="text-sage-500 text-sm mt-1">Manage who can access the billing system and their role.</p>
        </div>
        <button className="btn-primary" onClick={() => setModalOpen(true)}><Plus size={18} /> Add Staff</button>
      </div>

      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th>Last Login</th><th></th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center text-sage-500 py-8">Loading...</td></tr>
            ) : (
              users.map((u) => (
                <tr key={u.id}>
                  <td className="font-medium text-primary-900">{u.full_name}</td>
                  <td className="font-mono-nums text-sage-700">{u.username}</td>
                  <td><span className="badge-success capitalize">{u.role}</span></td>
                  <td>
                    <span className={u.is_active ? 'badge-success' : 'badge-danger'}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="text-sage-700 text-xs">{u.last_login ? new Date(u.last_login).toLocaleString() : 'Never'}</td>
                  <td>
                    <button
                      onClick={() => toggleActive(u)}
                      className={`p-2 rounded-lg ${u.is_active ? 'text-red-600 hover:bg-red-50' : 'text-primary-700 hover:bg-primary-50'}`}
                      title={u.is_active ? 'Deactivate' : 'Activate'}
                    >
                      {u.is_active ? <ShieldOff size={16} /> : <ShieldCheck size={16} />}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Staff Account">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Full Name *</label>
            <input className="input" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </div>
          <div>
            <label className="label">Username *</label>
            <input className="input" required minLength={3} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </div>
          <div>
            <label className="label">Password *</label>
            <input className="input" type="password" required minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div>
            <label className="label">Role</label>
            <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="staff">Staff (billing only)</option>
              <option value="admin">Admin (full access)</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Creating...' : 'Create Account'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
