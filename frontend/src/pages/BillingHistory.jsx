import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Eye } from 'lucide-react';
import api from '../api/client';
import { useSettings } from '../context/SettingsContext';

export default function BillingHistory() {
  const { formatMoney } = useSettings();
  const [bills, setBills] = useState([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const limit = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/bills', { params: { from: from || undefined, to: to || undefined, page, limit } });
      setBills(data.bills);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }, [from, to, page]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-primary-900">Billing History</h1>
        <p className="text-sage-500 text-sm mt-1">All generated invoices.</p>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="label">From</label>
          <input type="date" className="input w-auto" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" className="input w-auto" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
        </div>
        {(from || to) && (
          <button className="btn-secondary" onClick={() => { setFrom(''); setTo(''); setPage(1); }}>Clear</button>
        )}
      </div>

      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr><th>Bill No.</th><th>Date</th><th>Customer</th><th>Cashier</th><th>Payment</th><th>Total</th><th></th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center text-sage-500 py-8">Loading...</td></tr>
            ) : bills.length === 0 ? (
              <tr><td colSpan={7} className="text-center text-sage-500 py-8">No bills found for this period.</td></tr>
            ) : (
              bills.map((b) => (
                <tr key={b.id}>
                  <td className="font-mono-nums font-medium text-primary-900">{b.bill_number}</td>
                  <td className="text-sage-700 text-sm">{new Date(b.created_at).toLocaleString()}</td>
                  <td className="text-sage-700">{b.customer_name || 'Walk-in'}</td>
                  <td className="text-sage-700">{b.cashier_name || '—'}</td>
                  <td><span className="badge-success uppercase">{b.payment_method}</span></td>
                  <td className="font-mono-nums font-semibold">{formatMoney(b.total_amount)}</td>
                  <td>
                    <Link to={`/invoice/${b.id}`} className="p-2 inline-flex text-primary-700 hover:bg-primary-50 rounded-lg">
                      <Eye size={16} />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span className="text-sm text-sage-700 px-2">Page {page} of {totalPages}</span>
          <button className="btn-secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
