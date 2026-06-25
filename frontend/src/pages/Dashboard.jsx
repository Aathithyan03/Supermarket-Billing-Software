import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, Package, AlertTriangle, Receipt, Users, ArrowUpRight } from 'lucide-react';
import api from '../api/client';
import { useSettings } from '../context/SettingsContext';

function StatCard({ icon: Icon, label, value, sub, tone = 'primary' }) {
  const toneClasses = {
    primary: 'bg-primary-800 text-white',
    accent: 'bg-accent-400 text-ink',
    white: 'bg-white text-primary-900 border border-sage-100',
  };
  return (
    <div className={`card p-5 ${toneClasses[tone] === toneClasses.white ? '' : ''}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-sage-500 font-medium">{label}</p>
          <p className="text-2xl font-display font-semibold text-primary-900 mt-1 font-mono-nums">{value}</p>
          {sub && <p className="text-xs text-sage-500 mt-1">{sub}</p>}
        </div>
        <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center">
          <Icon size={20} className="text-primary-800" />
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { formatMoney } = useSettings();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    api.get('/dashboard/summary')
      .then(({ data }) => { if (mounted) setSummary(data); })
      .catch(() => { if (mounted) setError('Could not load dashboard data.'); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  if (loading) {
    return <div className="text-sage-500 text-sm">Loading dashboard...</div>;
  }
  if (error) {
    return <div className="text-red-600 text-sm">{error}</div>;
  }

  const change = summary.sales_percent_change;
  const isUp = change !== null && change >= 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-primary-900">Dashboard</h1>
        <p className="text-sage-500 text-sm mt-1">Here's how your store is doing today.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Receipt}
          label="Today's Sales"
          value={formatMoney(summary.today_sales)}
          sub={
            change !== null
              ? `${isUp ? '+' : ''}${change}% vs yesterday`
              : `${summary.today_bill_count} bill(s) today`
          }
        />
        <StatCard icon={Package} label="Total Products" value={summary.total_products} sub="active in catalog" />
        <StatCard icon={AlertTriangle} label="Low Stock Alerts" value={summary.low_stock_count} sub="need restocking" />
        <StatCard icon={Users} label="Total Customers" value={summary.total_customers} sub="registered" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Low stock alerts */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-semibold text-primary-900">Low Stock Alerts</h2>
            <Link to="/inventory" className="text-sm text-primary-700 hover:underline flex items-center gap-1">
              View all <ArrowUpRight size={14} />
            </Link>
          </div>
          {summary.low_stock_products.length === 0 ? (
            <p className="text-sm text-sage-500 py-6 text-center">All products are well stocked. 🎉</p>
          ) : (
            <ul className="divide-y divide-sage-100">
              {summary.low_stock_products.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="text-sm font-medium text-primary-900">{p.name}</p>
                    <p className="text-xs text-sage-500">Threshold: {p.low_stock_threshold} {p.unit}</p>
                  </div>
                  <span className="badge-danger font-mono-nums">{p.quantity} {p.unit} left</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent billing history */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-semibold text-primary-900">Recent Billing History</h2>
            <Link to="/billing-history" className="text-sm text-primary-700 hover:underline flex items-center gap-1">
              View all <ArrowUpRight size={14} />
            </Link>
          </div>
          {summary.recent_bills.length === 0 ? (
            <p className="text-sm text-sage-500 py-6 text-center">No bills generated yet.</p>
          ) : (
            <ul className="divide-y divide-sage-100">
              {summary.recent_bills.map((b) => (
                <li key={b.id}>
                  <Link to={`/invoice/${b.id}`} className="flex items-center justify-between py-2.5 hover:bg-sage-100/50 rounded-lg px-2 -mx-2 transition-colors">
                    <div>
                      <p className="text-sm font-medium text-primary-900 font-mono-nums">{b.bill_number}</p>
                      <p className="text-xs text-sage-500">{b.customer_name || 'Walk-in customer'} · {new Date(b.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    <span className="text-sm font-semibold text-primary-900 font-mono-nums">{formatMoney(b.total_amount)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
