import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Search, Package, Plus, Edit2, Trash2, Eye, Upload } from 'lucide-react';
import { 
  fetchProducts, 
  deleteProduct, 
  createProduct, 
  updateProduct,
  uploadProductImage,
  clearUploadedImage
} from '../store/slices/productSlice';
import { COLORS } from '../config';
import './Products.css';

const Products = () => {
  const dispatch = useDispatch();
  const { products, totalPages, currentPage, loading, uploadingImage, uploadedImage } = useSelector(state => state.products);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    stock: '',
    category: '',
    imageUrl: ''
  });
  const [imageFile, setImageFile] = useState(null);

  useEffect(() => {
    dispatch(fetchProducts({ page: 1 }));
  }, [dispatch]);

  useEffect(() => {
    if (uploadedImage) {
      setFormData(prev => ({
        ...prev,
        imageUrl: uploadedImage.url || uploadedImage.path
      }));
    }
  }, [uploadedImage]);

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      dispatch(uploadProductImage(file));
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    dispatch(fetchProducts({ page: 1, search: searchTerm, category: categoryFilter }));
  };

  const handleCategoryChange = (category) => {
    setCategoryFilter(category);
    dispatch(fetchProducts({ page: 1, search: searchTerm, category }));
  };

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) {
      dispatch(fetchProducts({ page, search: searchTerm, category: categoryFilter }));
    }
  };

  const handleOpenModal = (product = null) => {
    if (product) {
      setEditingProduct(product);
      setFormData({
        name: product.name,
        description: product.description || '',
        price: product.price.toString(),
        stock: product.stock.toString(),
        category: product.category,
        imageUrl: product.imageUrl || ''
      });
    } else {
      setEditingProduct(null);
      setFormData({
        name: '',
        description: '',
        price: '',
        stock: '',
        category: '',
        imageUrl: ''
      });
    }
    setImageFile(null);
    dispatch(clearUploadedImage());
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingProduct(null);
    setImageFile(null);
    dispatch(clearUploadedImage());
    setFormData({
      name: '',
      description: '',
      price: '',
      stock: '',
      category: '',
      imageUrl: ''
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const productData = {
      ...formData,
      price: parseFloat(formData.price),
      stock: parseInt(formData.stock)
    };

    if (editingProduct) {
      dispatch(updateProduct({ id: editingProduct._id, data: productData }));
    } else {
      dispatch(createProduct(productData));
    }
    handleCloseModal();
  };

  const handleDelete = (productId) => {
    if (window.confirm('Are you sure you want to delete this product?')) {
      dispatch(deleteProduct(productId));
    }
  };

  const categories = ['Water Cans', 'Bottles', 'Dispensers', 'Accessories', 'Other'];

  return (
    <div className="products-page">
      <div className="page-header">
        <h1>Products</h1>
        <p>Manage your water bottle inventory</p>
      </div>

      {/* Filters & Actions */}
      <div className="filters-bar">
        <form onSubmit={handleSearch} className="search-form">
          <div className="search-input-wrapper">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Search products..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button type="submit" className="search-btn">Search</button>
        </form>

        <div className="filter-group">
          <select 
            value={categoryFilter} 
            onChange={(e) => handleCategoryChange(e.target.value)}
          >
            <option value="">All Categories</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        <button className="add-btn" onClick={() => handleOpenModal()}>
          <Plus size={18} />
          Add Product
        </button>
      </div>

      {/* Products Grid */}
      <div className="products-grid">
        {loading ? (
          <div className="loading-state">Loading products...</div>
        ) : products.length > 0 ? (
          products.map(product => (
            <div key={product._id} className="product-card">
              <div className="product-image">
                {product.imageUrl ? (
                  <img src={product.imageUrl} alt={product.name} />
                ) : (
                  <div className="placeholder-image">
                    <Package size={40} />
                  </div>
                )}
                <span className={`stock-badge ${product.stock > 10 ? 'in-stock' : product.stock > 0 ? 'low-stock' : 'out-of-stock'}`}>
                  {product.stock > 10 ? 'In Stock' : product.stock > 0 ? 'Low Stock' : 'Out of Stock'}
                </span>
              </div>
              
              <div className="product-info">
                <span className="product-category">{product.category}</span>
                <h3>{product.name}</h3>
                <p className="product-description">{product.description}</p>
                
                <div className="product-meta">
                  <span className="product-price">₹{product.price}</span>
                  <span className="product-stock">{product.stock} units</span>
                </div>

                <div className="product-actions">
                  <button className="edit-btn" onClick={() => handleOpenModal(product)}>
                    <Edit2 size={16} />
                    Edit
                  </button>
                  <button className="delete-btn" onClick={() => handleDelete(product._id)}>
                    <Trash2 size={16} />
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="empty-state">
            <Package size={48} />
            <p>No products found</p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pagination">
          <button 
            className="page-btn"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
          >
            &lt;
          </button>
          
          <div className="page-numbers">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                className={`page-number ${currentPage === page ? 'active' : ''}`}
                onClick={() => handlePageChange(page)}
              >
                {page}
              </button>
            ))}
          </div>

          <button 
            className="page-btn"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            &gt;
          </button>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>{editingProduct ? 'Edit Product' : 'Add New Product'}</h2>
            
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Product Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  required
                />
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  rows={3}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Price (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData({...formData, price: e.target.value})}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Stock</label>
                  <input
                    type="number"
                    value={formData.stock}
                    onChange={(e) => setFormData({...formData, stock: e.target.value})}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({...formData, category: e.target.value})}
                  required
                >
                  <option value="">Select Category</option>
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Product Image</label>
                <div className="file-upload-wrapper">
                  <input
                    type="file"
                    id="product-image"
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    onChange={handleImageSelect}
                    disabled={uploadingImage}
                  />
                  <label htmlFor="product-image" className="file-upload-label">
                    {uploadingImage ? (
                      <>
                        <span className="spinner"></span>
                        Uploading...
                      </>
                    ) : uploadedImage ? (
                      <>
                        <span className="check-icon">✓</span>
                        Image uploaded
                      </>
                    ) : (
                      <>
                        <Upload size={20} />
                        Click to upload or drag & drop
                      </>
                    )}
                  </label>
                </div>
                {formData.imageUrl && (
                  <div className="image-preview">
                    <img src={formData.imageUrl} alt="Preview" />
                  </div>
                )}
              </div>

              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={handleCloseModal}>
                  Cancel
                </button>
                <button type="submit" className="submit-btn" disabled={!formData.imageUrl}>
                  {editingProduct ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Products;