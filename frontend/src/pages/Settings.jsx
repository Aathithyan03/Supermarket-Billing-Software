import { useState } from 'react';
import toast from 'react-hot-toast';
import { Save, KeyRound } from 'lucide-react';
import api, { getErrorMessage } from '../api/client';
import { useSettings } from '../context/SettingsContext';

export default function Settings() {
  const { settings, refresh } = useSettings();
  const [form, setForm] = useState({
    store_name: settings.store_name || '',
    store_address: settings.store_address || '',
    store_phone: settings.store_phone || '',
    currency_symbol: settings.currency_symbol || 'Rs.',
    default_tax_percent: settings.default_tax_percent || '0',
    invoice_prefix: settings.invoice_prefix || 'INV',
    low_stock_default_threshold: settings.low_stock_default_threshold || '10',
  });
  const [saving, setSaving] = useState(false);

  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pwSaving, setPwSaving] = useState(false);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/settings', form);
      await refresh();
      toast.success('Settings saved successfully.');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      toast.error('New password and confirmation do not match.');
      return;
    }
    setPwSaving(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword: pwForm.currentPassword,
        newPassword: pwForm.newPassword,
      });
      toast.success('Password updated successfully.');
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setPwSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold text-primary-900">Settings</h1>
        <p className="text-sage-500 text-sm mt-1">Configure store details used across bills and reports.</p>
      </div>

      <form onSubmit={handleSave} className="card p-6 space-y-4">
        <h2 className="font-display font-semibold text-primary-900">Store Configuration</h2>
        <div>
          <label className="label">Store Name</label>
          <input className="input" value={form.store_name} onChange={(e) => setForm({ ...form, store_name: e.target.value })} />
        </div>
        <div>
          <label className="label">Store Address</label>
          <input className="input" value={form.store_address} onChange={(e) => setForm({ ...form, store_address: e.target.value })} />
        </div>
        <div>
          <label className="label">Store Phone</label>
          <input className="input" value={form.store_phone} onChange={(e) => setForm({ ...form, store_phone: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Currency Symbol</label>
            <input className="input" value={form.currency_symbol} onChange={(e) => setForm({ ...form, currency_symbol: e.target.value })} />
          </div>
          <div>
            <label className="label">Default Tax % (new products)</label>
            <input className="input" type="number" min="0" step="0.01" value={form.default_tax_percent} onChange={(e) => setForm({ ...form, default_tax_percent: e.target.value })} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Invoice Number Prefix</label>
            <input className="input" value={form.invoice_prefix} onChange={(e) => setForm({ ...form, invoice_prefix: e.target.value })} />
          </div>
          <div>
            <label className="label">Default Low Stock Threshold</label>
            <input className="input" type="number" min="0" value={form.low_stock_default_threshold} onChange={(e) => setForm({ ...form, low_stock_default_threshold: e.target.value })} />
          </div>
        </div>
        <div className="flex justify-end pt-2">
          <button type="submit" className="btn-primary" disabled={saving}>
            <Save size={16} /> {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>

      <form onSubmit={handlePasswordChange} className="card p-6 space-y-4">
        <h2 className="font-display font-semibold text-primary-900 flex items-center gap-2">
          <KeyRound size={18} /> Change Your Password
        </h2>
        <div>
          <label className="label">Current Password</label>
          <input className="input" type="password" required value={pwForm.currentPassword} onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">New Password</label>
            <input className="input" type="password" required minLength={6} value={pwForm.newPassword} onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })} />
          </div>
          <div>
            <label className="label">Confirm New Password</label>
            <input className="input" type="password" required minLength={6} value={pwForm.confirmPassword} onChange={(e) => setPwForm({ ...pwForm, confirmPassword: e.target.value })} />
          </div>
        </div>
        <div className="flex justify-end pt-2">
          <button type="submit" className="btn-primary" disabled={pwSaving}>{pwSaving ? 'Updating...' : 'Update Password'}</button>
        </div>
      </form>
    </div>
  );
}
