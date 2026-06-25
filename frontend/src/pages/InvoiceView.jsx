import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Printer, ArrowLeft } from 'lucide-react';
import api from '../api/client';
import { useSettings } from '../context/SettingsContext';

export default function InvoiceView() {
  const { id } = useParams();
  const { formatMoney, settings } = useSettings();
  const [bill, setBill] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [printFormat, setPrintFormat] = useState('a4'); // 'a4' | 'thermal'

  useEffect(() => {
    let mounted = true;
    api.get(`/bills/${id}`).then(({ data }) => {
      if (mounted) { setBill(data.bill); setItems(data.items); }
    }).finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [id]);

  useEffect(() => {
    // Inject a dynamic @page rule so the print dialog defaults to the right paper size
    const styleEl = document.createElement('style');
    styleEl.id = 'dynamic-print-page-size';
    styleEl.textContent = printFormat === 'thermal'
      ? '@page { size: 80mm auto; margin: 2mm; }'
      : '@page { size: A4; margin: 12mm; }';
    document.head.appendChild(styleEl);
    document.body.classList.toggle('print-thermal', printFormat === 'thermal');
    return () => {
      document.head.removeChild(styleEl);
      document.body.classList.remove('print-thermal');
    };
  }, [printFormat]);

  if (loading) return <div className="text-sage-500 text-sm">Loading invoice...</div>;
  if (!bill) return <div className="text-red-600 text-sm">Invoice not found.</div>;

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between no-print flex-wrap gap-3">
        <Link to="/billing-history" className="flex items-center gap-2 text-sm text-primary-700 hover:underline">
          <ArrowLeft size={16} /> Back to billing history
        </Link>
        <div className="flex items-center gap-3">
          <select className="input py-1.5 text-sm w-auto" value={printFormat} onChange={(e) => setPrintFormat(e.target.value)}>
            <option value="a4">A4 / Letter</option>
            <option value="thermal">Thermal (80mm)</option>
          </select>
          <button onClick={() => window.print()} className="btn-primary">
            <Printer size={16} /> Print Bill
          </button>
        </div>
      </div>

      <div className="card p-8" id="invoice-print-area">
        <div className="text-center mb-6">
          <h1 className="font-display text-xl font-bold text-primary-900">{settings.store_name}</h1>
          {settings.store_address && <p className="text-sm text-sage-600">{settings.store_address}</p>}
          {settings.store_phone && <p className="text-sm text-sage-600">Ph: {settings.store_phone}</p>}
        </div>

        <div className="flex justify-between text-sm border-y border-sage-200 py-3 mb-4">
          <div>
            <p className="font-mono-nums font-semibold text-primary-900">{bill.bill_number}</p>
            <p className="text-sage-500">{new Date(bill.created_at).toLocaleString()}</p>
          </div>
          <div className="text-right">
            <p className="text-primary-900">{bill.customer_name || 'Walk-in customer'}</p>
            {bill.customer_phone && <p className="text-sage-500">{bill.customer_phone}</p>}
          </div>
        </div>

        <table className="w-full text-sm mb-4">
          <thead>
            <tr className="text-left text-xs uppercase text-sage-500 border-b border-sage-200">
              <th className="py-2">Item</th>
              <th className="py-2 text-right">Qty</th>
              <th className="py-2 text-right">Price</th>
              <th className="py-2 text-right">Tax</th>
              <th className="py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-sage-100">
                <td className="py-2">{item.product_name}</td>
                <td className="py-2 text-right font-mono-nums">{item.quantity}</td>
                <td className="py-2 text-right font-mono-nums">{formatMoney(item.unit_price)}</td>
                <td className="py-2 text-right font-mono-nums">{item.tax_percent}%</td>
                <td className="py-2 text-right font-mono-nums">{formatMoney(item.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="space-y-1.5 text-sm border-t border-sage-200 pt-3">
          <div className="flex justify-between text-sage-700">
            <span>Subtotal</span><span className="font-mono-nums">{formatMoney(bill.subtotal)}</span>
          </div>
          <div className="flex justify-between text-sage-700">
            <span>Tax</span><span className="font-mono-nums">{formatMoney(bill.tax_amount)}</span>
          </div>
          <div className="flex justify-between text-sage-700">
            <span>Discount ({bill.discount_percent}%)</span><span className="font-mono-nums">- {formatMoney(bill.discount_amount)}</span>
          </div>
          <div className="flex justify-between font-display font-bold text-lg text-primary-900 border-t border-sage-200 pt-2">
            <span>Total</span><span className="font-mono-nums">{formatMoney(bill.total_amount)}</span>
          </div>
        </div>

        <div className="mt-6 text-center text-xs text-sage-500 space-y-0.5">
          <p>Payment: {bill.payment_method.toUpperCase()} · Cashier: {bill.cashier_name || '—'}</p>
          <p>Thank you for shopping with us!</p>
        </div>
      </div>
    </div>
  );
}
