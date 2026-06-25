import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Search, Plus, Minus, Trash2, ScanLine, UserPlus, X } from 'lucide-react';
import api, { getErrorMessage } from '../api/client';
import { useSettings } from '../context/SettingsContext';
import Modal from '../components/Modal';

export default function POS() {
  const { formatMoney, settings } = useSettings();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [cart, setCart] = useState([]); // [{ product, quantity }]
  const [discountPercent, setDiscountPercent] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [checkingOut, setCheckingOut] = useState(false);

  const [customer, setCustomer] = useState(null);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState([]);
  const [newCustomerForm, setNewCustomerForm] = useState({ name: '', phone: '' });

  const searchInputRef = useRef(null);

  // Barcode scanners typically act like fast keyboard input ending in Enter.
  // Searching-as-you-type also covers manual lookups by name.
  const runSearch = useCallback(async (term) => {
    if (!term.trim()) { setResults([]); return; }
    setSearching(true);
    try {
      const { data } = await api.get('/products', { params: { search: term, limit: 10 } });
      setResults(data.products);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => runSearch(query), 250);
    return () => clearTimeout(t);
  }, [query, runSearch]);

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  const addToCart = (product) => {
    if (product.quantity <= 0) {
      toast.error(`${product.name} is out of stock.`);
      return;
    }
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        if (existing.quantity + 1 > product.quantity) {
          toast.error(`Only ${product.quantity} ${product.unit} of ${product.name} available.`);
          return prev;
        }
        return prev.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
    setQuery('');
    setResults([]);
    searchInputRef.current?.focus();
  };

  const handleBarcodeEnter = async (e) => {
    if (e.key !== 'Enter' || !query.trim()) return;
    e.preventDefault();
    try {
      const { data } = await api.get('/products', { params: { barcode: query.trim() } });
      if (data.products.length > 0) {
        addToCart(data.products[0]);
      } else if (results.length > 0) {
        addToCart(results[0]);
      } else {
        toast.error('No product found for that search/barcode.');
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const updateQuantity = (productId, delta) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.product.id !== productId) return item;
        const newQty = item.quantity + delta;
        if (newQty <= 0) return item;
        if (newQty > item.product.quantity) {
          toast.error(`Only ${item.product.quantity} ${item.product.unit} available.`);
          return item;
        }
        return { ...item, quantity: newQty };
      })
    );
  };

  const removeFromCart = (productId) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  // Live calculation — mirrors backend logic so the cashier sees the real total before checkout
  const subtotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const taxAmount = cart.reduce((sum, item) => sum + item.product.price * item.quantity * (item.product.tax_percent / 100), 0);
  const discountAmount = (subtotal + taxAmount) * (Number(discountPercent || 0) / 100);
  const totalAmount = subtotal + taxAmount - discountAmount;

  const handleCheckout = async () => {
    if (cart.length === 0) {
      toast.error('Cart is empty. Add products before checking out.');
      return;
    }
    setCheckingOut(true);
    try {
      const { data } = await api.post('/bills', {
        customer_id: customer?.id,
        items: cart.map((item) => ({ product_id: item.product.id, quantity: item.quantity })),
        discount_percent: Number(discountPercent || 0),
        payment_method: paymentMethod,
      });
      toast.success(`Bill ${data.bill_number} generated successfully.`);
      setCart([]);
      setDiscountPercent(0);
      setCustomer(null);
      setPaymentMethod('cash');
      navigate(`/invoice/${data.bill_id}`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setCheckingOut(false);
    }
  };

  // ---- Customer search/create within POS ----
  useEffect(() => {
    if (!customerModalOpen) return;
    const t = setTimeout(async () => {
      if (!customerSearch.trim()) { setCustomerResults([]); return; }
      try {
        const { data } = await api.get('/customers', { params: { search: customerSearch } });
        setCustomerResults(data.customers);
      } catch {
        // ignore
      }
    }, 300);
    return () => clearTimeout(t);
  }, [customerSearch, customerModalOpen]);

  const handleCreateCustomer = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post('/customers', newCustomerForm);
      setCustomer({ id: data.id, name: newCustomerForm.name, phone: newCustomerForm.phone });
      setCustomerModalOpen(false);
      setNewCustomerForm({ name: '', phone: '' });
      toast.success('Customer added and selected.');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-primary-900">Billing / POS</h1>
        <p className="text-sage-500 text-sm mt-1">Search or scan products to build the cart.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: search + results */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card p-4">
            <div className="relative">
              <ScanLine size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-sage-500" />
              <input
                ref={searchInputRef}
                className="input pl-10"
                placeholder="Scan barcode or search product name..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleBarcodeEnter}
                autoFocus
              />
            </div>

            {query && (
              <div className="mt-3 max-h-72 overflow-y-auto divide-y divide-sage-100">
                {searching ? (
                  <p className="text-sm text-sage-500 py-3 text-center">Searching...</p>
                ) : results.length === 0 ? (
                  <p className="text-sm text-sage-500 py-3 text-center">No products match.</p>
                ) : (
                  results.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => addToCart(p)}
                      className="w-full flex items-center justify-between py-2.5 px-2 hover:bg-primary-50 rounded-lg text-left transition-colors"
                    >
                      <div>
                        <p className="text-sm font-medium text-primary-900">{p.name}</p>
                        <p className="text-xs text-sage-500 font-mono-nums">
                          {p.barcode || 'no barcode'} · {p.quantity} {p.unit} in stock
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-primary-900 font-mono-nums">{formatMoney(p.price)}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Cart table */}
          <div className="card overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Price</th>
                  <th>Qty</th>
                  <th>Line Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {cart.length === 0 ? (
                  <tr><td colSpan={5} className="text-center text-sage-500 py-10">Cart is empty. Search above to add items.</td></tr>
                ) : (
                  cart.map((item) => {
                    const lineTotal = item.product.price * item.quantity * (1 + item.product.tax_percent / 100);
                    return (
                      <tr key={item.product.id}>
                        <td className="font-medium text-primary-900">{item.product.name}</td>
                        <td className="font-mono-nums">{formatMoney(item.product.price)}</td>
                        <td>
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => updateQuantity(item.product.id, -1)} className="p-1 rounded bg-sage-100 hover:bg-sage-200">
                              <Minus size={14} />
                            </button>
                            <span className="w-8 text-center font-mono-nums">{item.quantity}</span>
                            <button onClick={() => updateQuantity(item.product.id, 1)} className="p-1 rounded bg-sage-100 hover:bg-sage-200">
                              <Plus size={14} />
                            </button>
                          </div>
                        </td>
                        <td className="font-mono-nums font-medium">{formatMoney(lineTotal)}</td>
                        <td>
                          <button onClick={() => removeFromCart(item.product.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg">
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: bill summary (the "receipt") */}
        <div className="lg:col-span-1">
          <div className="card sticky top-6">
            <div className="receipt-edge" />
            <div className="p-5 space-y-4">
              <h2 className="font-display font-semibold text-primary-900">Bill Summary</h2>

              {/* Customer */}
              <div>
                {customer ? (
                  <div className="flex items-center justify-between bg-primary-50 rounded-lg px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-primary-900">{customer.name}</p>
                      {customer.phone && <p className="text-xs text-sage-500">{customer.phone}</p>}
                    </div>
                    <button onClick={() => setCustomer(null)} className="text-sage-500 hover:text-red-600">
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setCustomerModalOpen(true)} className="btn-secondary w-full text-sm">
                    <UserPlus size={16} /> Add customer (optional)
                  </button>
                )}
              </div>

              <div className="space-y-2 text-sm border-t border-sage-100 pt-3">
                <div className="flex justify-between text-sage-700">
                  <span>Subtotal</span>
                  <span className="font-mono-nums">{formatMoney(subtotal)}</span>
                </div>
                <div className="flex justify-between text-sage-700">
                  <span>Tax</span>
                  <span className="font-mono-nums">{formatMoney(taxAmount)}</span>
                </div>
                <div className="flex justify-between items-center text-sage-700">
                  <span>Discount %</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    className="input w-20 py-1 text-right font-mono-nums"
                    value={discountPercent}
                    onChange={(e) => setDiscountPercent(e.target.value)}
                  />
                </div>
                <div className="flex justify-between text-sage-700">
                  <span>Discount Amount</span>
                  <span className="font-mono-nums">- {formatMoney(discountAmount)}</span>
                </div>
              </div>

              <div className="flex justify-between items-center border-t border-sage-200 pt-3">
                <span className="font-display font-semibold text-primary-900">Total</span>
                <span className="font-display font-bold text-xl text-primary-900 font-mono-nums">{formatMoney(totalAmount)}</span>
              </div>

              <div>
                <label className="label">Payment Method</label>
                <select className="input" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="upi">UPI</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <button className="btn-accent w-full text-base py-3" onClick={handleCheckout} disabled={checkingOut || cart.length === 0}>
                {checkingOut ? 'Processing...' : 'Generate Bill'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Customer quick-add/select modal */}
      <Modal open={customerModalOpen} onClose={() => setCustomerModalOpen(false)} title="Select Customer" maxWidth="max-w-sm">
        <div className="space-y-4">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-sage-500" />
            <input className="input pl-9" placeholder="Search by name or phone" value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} />
          </div>

          {customerResults.length > 0 && (
            <ul className="max-h-40 overflow-y-auto divide-y divide-sage-100 border border-sage-100 rounded-lg">
              {customerResults.map((c) => (
                <li key={c.id}>
                  <button
                    className="w-full text-left px-3 py-2 hover:bg-primary-50 text-sm"
                    onClick={() => { setCustomer(c); setCustomerModalOpen(false); setCustomerSearch(''); }}
                  >
                    {c.name} {c.phone ? `· ${c.phone}` : ''}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-sage-100 pt-4">
            <p className="text-sm font-medium text-primary-900 mb-2">Or add a new customer</p>
            <form onSubmit={handleCreateCustomer} className="space-y-3">
              <input className="input" placeholder="Customer name" required value={newCustomerForm.name} onChange={(e) => setNewCustomerForm({ ...newCustomerForm, name: e.target.value })} />
              <input className="input" placeholder="Phone (optional)" value={newCustomerForm.phone} onChange={(e) => setNewCustomerForm({ ...newCustomerForm, phone: e.target.value })} />
              <button type="submit" className="btn-primary w-full">Add & Select</button>
            </form>
          </div>
        </div>
      </Modal>
    </div>
  );
}
