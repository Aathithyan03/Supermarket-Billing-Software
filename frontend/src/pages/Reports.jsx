import { useEffect, useState, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import api from '../api/client';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';

export default function Reports() {
  const { formatMoney, settings } = useSettings();
  const { isAdmin } = useAuth();
  const [period, setPeriod] = useState('daily');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (p) => {
    setLoading(true);
    try {
      const { data } = await api.get('/reports/sales', { params: { period: p } });
      setReport(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(period); }, [period, load]);

  const handleExport = (format) => {
    const token = localStorage.getItem('token');
    const url = `${import.meta.env.VITE_API_URL || '/api'}/reports/export/${format}?period=${period}`;
    // Use fetch + blob so the Authorization header is sent (plain links can't carry it)
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.blob())
      .then((blob) => {
        const link = document.createElement('a');
        link.href = window.URL.createObjectURL(blob);
        link.download = `sales-report.${format === 'excel' ? 'xlsx' : 'pdf'}`;
        link.click();
      });
  };

  if (loading || !report) {
    return <div className="text-sage-500 text-sm">Loading reports...</div>;
  }

  const chartData = report.daily_breakdown.map((d) => ({
    day: new Date(d.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    revenue: d.revenue,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-primary-900">Reports</h1>
          <p className="text-sage-500 text-sm mt-1">Sales performance, best sellers, and profit.</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="input w-auto" value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="daily">Today</option>
            <option value="weekly">Last 7 Days</option>
            <option value="monthly">Last 30 Days</option>
          </select>
          <button className="btn-secondary" onClick={() => handleExport('excel')}>
            <FileSpreadsheet size={16} /> Excel
          </button>
          <button className="btn-secondary" onClick={() => handleExport('pdf')}>
            <FileText size={16} /> PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-5">
          <p className="text-sm text-sage-500">Revenue</p>
          <p className="text-2xl font-display font-semibold text-primary-900 font-mono-nums mt-1">{formatMoney(report.revenue)}</p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-sage-500">Bills Generated</p>
          <p className="text-2xl font-display font-semibold text-primary-900 font-mono-nums mt-1">{report.bill_count}</p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-sage-500">Tax Collected</p>
          <p className="text-2xl font-display font-semibold text-primary-900 font-mono-nums mt-1">{formatMoney(report.tax_collected)}</p>
        </div>
        {isAdmin && (
          <div className="card p-5">
            <p className="text-sm text-sage-500">Gross Profit</p>
            <p className="text-2xl font-display font-semibold text-primary-900 font-mono-nums mt-1">{formatMoney(report.gross_profit)}</p>
            <p className="text-xs text-sage-500 mt-1">{report.profit_margin_percent}% margin</p>
          </div>
        )}
      </div>

      <div className="card p-5">
        <h2 className="font-display font-semibold text-primary-900 mb-4">Revenue Trend</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f0" />
              <XAxis dataKey="day" tick={{ fontSize: 12, fill: '#56716a' }} />
              <YAxis tick={{ fontSize: 12, fill: '#56716a' }} />
              <Tooltip formatter={(value) => formatMoney(value)} />
              <Bar dataKey="revenue" fill="#0F4C3A" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <h2 className="font-display font-semibold text-primary-900 mb-4">Best-Selling Products</h2>
          {report.best_sellers.length === 0 ? (
            <p className="text-sm text-sage-500 py-6 text-center">No sales in this period yet.</p>
          ) : (
            <ul className="divide-y divide-sage-100">
              {report.best_sellers.map((p, i) => (
                <li key={p.product_name} className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-primary-50 text-primary-800 text-xs font-semibold flex items-center justify-center">{i + 1}</span>
                    <span className="text-sm font-medium text-primary-900">{p.product_name}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold font-mono-nums">{p.units_sold} sold</p>
                    <p className="text-xs text-sage-500 font-mono-nums">{formatMoney(p.revenue)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-5">
          <h2 className="font-display font-semibold text-primary-900 mb-4">Payment Method Breakdown</h2>
          {report.payment_breakdown.length === 0 ? (
            <p className="text-sm text-sage-500 py-6 text-center">No data for this period.</p>
          ) : (
            <ul className="divide-y divide-sage-100">
              {report.payment_breakdown.map((p) => (
                <li key={p.payment_method} className="flex items-center justify-between py-2.5">
                  <span className="text-sm font-medium text-primary-900 uppercase">{p.payment_method}</span>
                  <div className="text-right">
                    <p className="text-sm font-semibold font-mono-nums">{formatMoney(p.total)}</p>
                    <p className="text-xs text-sage-500">{p.count} bill(s)</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
