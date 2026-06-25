import { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, RefreshCcw } from 'lucide-react';
import api from '../api/client';

const TYPE_CONFIG = {
  in: { label: 'Stock In', icon: ArrowUpCircle, className: 'text-primary-700' },
  out: { label: 'Stock Out', icon: ArrowDownCircle, className: 'text-red-600' },
  sale: { label: 'Sale', icon: ArrowDownCircle, className: 'text-accent-500' },
  adjustment: { label: 'Adjustment', icon: RefreshCcw, className: 'text-sage-700' },
};

export default function Inventory() {
  const [alerts, setAlerts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [typeFilter, setTypeFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (type = '') => {
    setLoading(true);
    try {
      const [alertsRes, movementsRes] = await Promise.all([
        api.get('/inventory/alerts'),
        api.get('/inventory/movements', { params: type ? { type, limit: 100 } : { limit: 100 } }),
      ]);
      setAlerts(alertsRes.data.alerts);
      setMovements(movementsRes.data.movements);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(typeFilter); }, [load, typeFilter]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-primary-900">Inventory</h1>
        <p className="text-sage-500 text-sm mt-1">Stock movement history and low stock alerts.</p>
      </div>

      {alerts.length > 0 && (
        <div className="card p-5 border-accent-200 bg-accent-50">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={18} className="text-accent-500" />
            <h2 className="font-display font-semibold text-primary-900">Low Stock Alerts ({alerts.length})</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {alerts.map((a) => (
              <div key={a.id} className="bg-white rounded-lg px-3 py-2.5 border border-accent-200">
                <p className="text-sm font-medium text-primary-900">{a.name}</p>
                <p className="text-xs text-sage-500">
                  <span className="font-mono-nums font-semibold text-red-600">{a.quantity} {a.unit}</span> left · threshold {a.low_stock_threshold}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="flex items-center justify-between p-4 border-b border-sage-100">
          <h2 className="font-display font-semibold text-primary-900">Stock Movement History</h2>
          <select className="input w-auto py-1.5 text-sm" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All types</option>
            <option value="in">Stock In</option>
            <option value="out">Stock Out</option>
            <option value="sale">Sale</option>
            <option value="adjustment">Adjustment</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr><th>Date</th><th>Product</th><th>Type</th><th>Qty</th><th>Reason</th><th>By</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center text-sage-500 py-8">Loading...</td></tr>
              ) : movements.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-sage-500 py-8">No stock movements yet.</td></tr>
              ) : (
                movements.map((m) => {
                  const cfg = TYPE_CONFIG[m.type] || TYPE_CONFIG.adjustment;
                  return (
                    <tr key={m.id}>
                      <td className="text-sage-700 text-xs">{new Date(m.created_at).toLocaleString()}</td>
                      <td className="font-medium text-primary-900">{m.product_name}</td>
                      <td>
                        <span className={`flex items-center gap-1.5 ${cfg.className}`}>
                          <cfg.icon size={14} /> {cfg.label}
                        </span>
                      </td>
                      <td className="font-mono-nums">{m.quantity} {m.unit}</td>
                      <td className="text-sage-700 text-sm">{m.reason || '—'}</td>
                      <td className="text-sage-700 text-sm">{m.user_name || '—'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
