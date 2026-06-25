import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Plus, Search, Pencil, Trash2, PackagePlus, Barcode } from 'lucide-react';
import api, { getErrorMessage } from '../api/client';
import { useSettings } from '../context/SettingsContext';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';

const EMPTY_FORM = {
  name: '', category_id: '', barcode: '', price: '', cost_price: '',
  tax_percent: '', quantity: '', unit: 'pcs', low_stock_threshold: '10',
};

export default function Products() {
  const { formatMoney, settings } = useSettings();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [stockModalProduct, setStockModalProduct] = useState(null);
  const [stockForm, setStockForm] = useState({ type: 'in', quantity: '', reason: '' });

  const loadProducts = useCallback(async (searchTerm = '') => {
    setLoading(true);
    try {
      const { data } = await api.get('/products', { params: { search: searchTerm, limit: 200 } });
      setProducts(data.products);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCategories = useCallback(async () => {
    try {
      const { data } = await api.get('/products/categories/all');
      setCategories(data.categories);
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => { loadProducts(); loadCategories(); }, [loadProducts, loadCategories]);

  useEffect(() => {
    const t = setTimeout(() => loadProducts(search), 350);
    return () => clearTimeout(t);
  }, [search, loadProducts]);

  const openAddModal = () => {
    setEditingProduct(null);
    setForm({ ...EMPTY_FORM, tax_percent: settings.default_tax_percent || '0' });
    setModalOpen(true);
  };

  const openEditModal = (product) => {
    setEditingProduct(product);
    setForm({
      name: product.name,
      category_id: product.category_id || '',
      barcode: product.barcode || '',
      price: product.price,
      cost_price: product.cost_price,
      tax_percent: product.tax_percent,
      quantity: product.quantity,
      unit: product.unit,
      low_stock_threshold: product.low_stock_threshold,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        category_id: form.category_id || null,
        price: Number(form.price),
        cost_price: Number(form.cost_price || 0),
        tax_percent: Number(form.tax_percent || 0),
        quantity: Number(form.quantity || 0),
        low_stock_threshold: Number(form.low_stock_threshold || 10),
      };
      if (editingProduct) {
        await api.put(`/products/${editingProduct.id}`, payload);
        toast.success('Product updated successfully.');
      } else {
        await api.post('/products', payload);
        toast.success('Product added successfully.');
      }
      setModalOpen(false);
      loadProducts(search);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/products/${deleteTarget.id}`);
      toast.success('Product removed.');
      setDeleteTarget(null);
      loadProducts(search);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const handleStockSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.patch(`/products/${stockModalProduct.id}/stock`, {
        type: stockForm.type,
        quantity: Number(stockForm.quantity),
        reason: stockForm.reason || undefined,
      });
      toast.success('Stock updated.');
      setStockModalProduct(null);
      setStockForm({ type: 'in', quantity: '', reason: '' });
      loadProducts(search);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-primary-900">Products</h1>
          <p className="text-sage-500 text-sm mt-1">Manage your catalog, pricing, and stock.</p>
        </div>
        <button className="btn-primary" onClick={openAddModal}>
          <Plus size={18} /> Add Product
        </button>
      </div>

      <div className="relative max-w-md">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-sage-500" />
        <input
          className="input pl-10"
          placeholder="Search by name or barcode..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Product</th>
              <th>Category</th>
              <th>Barcode</th>
              <th>Price</th>
              <th>Stock</th>
              <th>Tax %</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center text-sage-500 py-8">Loading products...</td></tr>
            ) : products.length === 0 ? (
              <tr><td colSpan={7} className="text-center text-sage-500 py-8">No products found.</td></tr>
            ) : (
              products.map((p) => (
                <tr key={p.id}>
                  <td className="font-medium text-primary-900">{p.name}</td>
                  <td className="text-sage-700">{p.category_name || '—'}</td>
                  <td className="font-mono-nums text-sage-700 text-xs">{p.barcode || '—'}</td>
                  <td className="font-mono-nums">{formatMoney(p.price)}</td>
                  <td>
                    <span className={p.is_low_stock ? 'badge-danger font-mono-nums' : 'badge-success font-mono-nums'}>
                      {p.quantity} {p.unit}
                    </span>
                  </td>
                  <td className="font-mono-nums text-sage-700">{p.tax_percent}%</td>
                  <td>
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => setStockModalProduct(p)} className="p-2 text-primary-700 hover:bg-primary-50 rounded-lg" title="Adjust stock">
                        <PackagePlus size={16} />
                      </button>
                      <button onClick={() => openEditModal(p)} className="p-2 text-primary-700 hover:bg-primary-50 rounded-lg" title="Edit">
                        <Pencil size={16} />
                      </button>
                      <button onClick={() => setDeleteTarget(p)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg" title="Delete">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Product Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingProduct ? 'Edit Product' : 'Add Product'} maxWidth="max-w-lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Product Name *</label>
            <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Category</label>
              <select className="input" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
                <option value="">— None —</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Barcode</label>
              <div className="relative">
                <Barcode size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-sage-500" />
                <input className="input pl-9" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Selling Price *</label>
              <input className="input" type="number" min="0" step="0.01" required value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            </div>
            <div>
              <label className="label">Cost Price</label>
              <input className="input" type="number" min="0" step="0.01" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} />
            </div>
            <div>
              <label className="label">Tax %</label>
              <input className="input" type="number" min="0" step="0.01" value={form.tax_percent} onChange={(e) => setForm({ ...form, tax_percent: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">{editingProduct ? 'Current Stock' : 'Opening Stock'}</label>
              <input
                className="input"
                type="number"
                min="0"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                disabled={!!editingProduct}
                title={editingProduct ? 'Use the stock adjust action to change quantity' : ''}
              />
            </div>
            <div>
              <label className="label">Unit</label>
              <input className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="pcs, kg, ltr" />
            </div>
            <div>
              <label className="label">Low Stock At</label>
              <input className="input" type="number" min="0" value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })} />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Saving...' : editingProduct ? 'Save Changes' : 'Add Product'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Stock Adjust Modal */}
      <Modal open={!!stockModalProduct} onClose={() => setStockModalProduct(null)} title={`Adjust Stock — ${stockModalProduct?.name || ''}`} maxWidth="max-w-sm">
        <form onSubmit={handleStockSubmit} className="space-y-4">
          <div>
            <label className="label">Movement Type</label>
            <select className="input" value={stockForm.type} onChange={(e) => setStockForm({ ...stockForm, type: e.target.value })}>
              <option value="in">Stock In (received)</option>
              <option value="out">Stock Out (damaged/returned)</option>
              <option value="adjustment">Set Exact Quantity</option>
            </select>
          </div>
          <div>
            <label className="label">{stockForm.type === 'adjustment' ? 'New Quantity' : 'Quantity'}</label>
            <input className="input" type="number" min="1" required value={stockForm.quantity} onChange={(e) => setStockForm({ ...stockForm, quantity: e.target.value })} />
          </div>
          <div>
            <label className="label">Reason (optional)</label>
            <input className="input" value={stockForm.reason} onChange={(e) => setStockForm({ ...stockForm, reason: e.target.value })} placeholder="e.g. New shipment, damaged goods" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setStockModalProduct(null)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Saving...' : 'Update Stock'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Remove Product"
        message={`Are you sure you want to remove "${deleteTarget?.name}"? It will no longer appear in billing, but past invoices are kept intact.`}
        confirmLabel="Remove"
        danger
      />
    </div>
  );
}
