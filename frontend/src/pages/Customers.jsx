import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Plus, Search, Pencil, Eye, Star } from 'lucide-react';
import api, { getErrorMessage } from '../api/client';
import { useSettings } from '../context/SettingsContext';
import Modal from '../components/Modal';

const EMPTY_FORM = { name: '', phone: '', email: '', address: '' };

export default function Customers() {
  const { formatMoney } = useSettings();
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [historyCustomer, setHistoryCustomer] = useState(null);
  const [historyBills, setHistoryBills] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const load = useCallback(async (term = '') => {
    setLoading(true);
    try {
      const { data } = await api.get('/customers', { params: { search: term } });
      setCustomers(data.customers);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setTimeout(() => load(search), 350);
    return () => clearTimeout(t);
  }, [search, load]);

  const openAdd = () => { setEditing(null); setForm(EMPTY_FORM); setModalOpen(true); };
  const openEdit = (c) => {
    setEditing(c);
    setForm({ name: c.name, phone: c.phone || '', email: c.email || '', address: c.address || '' });
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editing) {
        await api.put(`/customers/${editing.id}`, form);
        toast.success('Customer updated.');
      } else {
        await api.post('/customers', form);
        toast.success('Customer added.');
      }
      setModalOpen(false);
      load(search);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const openHistory = async (c) => {
    setHistoryCustomer(c);
    setHistoryLoading(true);
    try {
      const { data } = await api.get(`/customers/${c.id}/history`);
      setHistoryBills(data.bills);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setHistoryLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-primary-900">Customers</h1>
          <p className="text-sage-500 text-sm mt-1">Track customer details, history, and loyalty.</p>
        </div>
        <button className="btn-primary" onClick={openAdd}><Plus size={18} /> Add Customer</button>
      </div>

      <div className="relative max-w-md">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-sage-500" />
        <input className="input pl-10" placeholder="Search by name or phone..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Name</th><th>Phone</th><th>Orders</th><th>Total Spent</th><th>Loyalty Points</th><th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center text-sage-500 py-8">Loading customers...</td></tr>
            ) : customers.length === 0 ? (
              <tr><td colSpan={6} className="text-center text-sage-500 py-8">No customers found.</td></tr>
            ) : (
              customers.map((c) => (
                <tr key={c.id}>
                  <td className="font-medium text-primary-900">{c.name}</td>
                  <td className="font-mono-nums text-sage-700">{c.phone || '—'}</td>
                  <td className="font-mono-nums">{c.total_orders}</td>
                  <td className="font-mono-nums">{formatMoney(c.total_spent)}</td>
                  <td>
                    <span className="badge-warning font-mono-nums flex items-center gap-1 w-fit">
                      <Star size={12} /> {c.loyalty_points}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => openHistory(c)} className="p-2 text-primary-700 hover:bg-primary-50 rounded-lg" title="Purchase history">
                        <Eye size={16} />
                      </button>
                      <button onClick={() => openEdit(c)} className="p-2 text-primary-700 hover:bg-primary-50 rounded-lg" title="Edit">
                        <Pencil size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Customer' : 'Add Customer'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Name *</label>
            <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className="label">Address</label>
            <textarea className="input" rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!historyCustomer} onClose={() => setHistoryCustomer(null)} title={`Purchase History — ${historyCustomer?.name || ''}`} maxWidth="max-w-lg">
        {historyLoading ? (
          <p className="text-sm text-sage-500">Loading...</p>
        ) : historyBills.length === 0 ? (
          <p className="text-sm text-sage-500">No purchases yet.</p>
        ) : (
          <ul className="divide-y divide-sage-100">
            {historyBills.map((b) => (
              <li key={b.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-sm font-medium text-primary-900 font-mono-nums">{b.bill_number}</p>
                  <p className="text-xs text-sage-500">{new Date(b.created_at).toLocaleString()}</p>
                </div>
                <span className="text-sm font-semibold font-mono-nums">{formatMoney(b.total_amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  );
}
