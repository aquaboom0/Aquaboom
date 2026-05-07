import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Search, Plus, Edit2, Trash2, Upload, ArrowUp, ArrowDown } from 'lucide-react';
import { 
  fetchBanners, 
  createBanner, 
  updateBanner, 
  deleteBanner, 
  uploadBannerImage,
  clearUploadedImage 
} from '../store/slices/bannerSlice';
import { COLORS } from '../config';
import './Posters.css';

const Posters = () => {
  const dispatch = useDispatch();
  const { banners, loading, error, uploadingImage, uploadedImage } = useSelector(state => state.banners);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingBanner, setEditingBanner] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    imageUrl: '',
    targetScreen: 'home',
    targetProductId: '',
    sortOrder: 0,
    isActive: true,
  });
  const [imageFile, setImageFile] = useState(null);

  useEffect(() => {
    dispatch(fetchBanners());
  }, [dispatch]);

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      dispatch(uploadBannerImage(file));
    }
  };

  useEffect(() => {
    if (uploadedImage) {
      setFormData(prev => ({
        ...prev,
        imageUrl: uploadedImage.url || uploadedImage.path
      }));
    }
  }, [uploadedImage]);

  const handleOpenModal = (banner = null) => {
    if (banner) {
      setEditingBanner(banner);
      setFormData({
        title: banner.title || '',
        imageUrl: banner.imageUrl || '',
        targetScreen: banner.targetScreen || 'home',
        targetProductId: banner.targetProductId || '',
        sortOrder: banner.sortOrder || 0,
        isActive: banner.isActive !== false,
      });
    } else {
      setEditingBanner(null);
      setFormData({
        title: '',
        imageUrl: '',
        targetScreen: 'home',
        targetProductId: '',
        sortOrder: 0,
        isActive: true,
      });
    }
    setImageFile(null);
    dispatch(clearUploadedImage());
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingBanner(null);
    setImageFile(null);
    dispatch(clearUploadedImage());
    setFormData({
      title: '',
      imageUrl: '',
      targetScreen: 'home',
      targetProductId: '',
      sortOrder: 0,
      isActive: true,
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!formData.title.trim()) {
      alert('Please enter a title');
      return;
    }

    if (!formData.imageUrl) {
      alert('Please upload an image');
      return;
    }

    if (editingBanner) {
      dispatch(updateBanner({ 
        bannerId: editingBanner._id, 
        data: formData 
      }));
    } else {
      dispatch(createBanner(formData));
    }
    handleCloseModal();
  };

  const handleDelete = (bannerId) => {
    if (window.confirm('Are you sure you want to delete this poster?')) {
      dispatch(deleteBanner(bannerId));
    }
  };

  const filteredBanners = banners.filter(banner =>
    banner.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const targetScreenOptions = [
    { value: 'home', label: 'Home' },
    { value: 'cart', label: 'Cart' },
    { value: 'orders', label: 'Orders' },
    { value: 'products', label: 'Products' },
  ];

  return (
    <div className="posters-page">
      <div className="page-header">
        <h1>Carousel Posters</h1>
        <p>Manage home screen carousel banners</p>
      </div>

      {error && (
        <div className="error-banner">
          {error}
        </div>
      )}

      {/* Filters & Actions */}
      <div className="filters-bar">
        <form onSubmit={(e) => e.preventDefault()} className="search-form">
          <div className="search-input-wrapper">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Search posters..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </form>

        <button className="add-btn" onClick={() => handleOpenModal()}>
          <Plus size={18} />
          Add Poster
        </button>
      </div>

      {/* Posters Grid */}
      <div className="posters-grid">
        {loading ? (
          <div className="loading-state">Loading posters...</div>
        ) : filteredBanners.length > 0 ? (
          filteredBanners.map(banner => (
            <div key={banner._id} className="poster-card">
              <div className="poster-image">
                {banner.imageUrl ? (
                  <img src={banner.imageUrl} alt={banner.title} />
                ) : (
                  <div className="placeholder-image">
                    <Upload size={40} />
                  </div>
                )}
                {!banner.isActive && (
                  <span className="inactive-badge">Inactive</span>
                )}
              </div>
              
              <div className="poster-info">
                <h3>{banner.title}</h3>
                <p className="poster-target">
                  Target: <span>{banner.targetScreen || 'home'}</span>
                </p>
                <p className="poster-order">
                  Order: <span>{banner.sortOrder || 0}</span>
                </p>

                <div className="poster-actions">
                  <button className="edit-btn" onClick={() => handleOpenModal(banner)}>
                    <Edit2 size={16} />
                    Edit
                  </button>
                  <button className="delete-btn" onClick={() => handleDelete(banner._id)}>
                    <Trash2 size={16} />
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="empty-state">
            <Upload size={48} />
            <p>No posters found</p>
            <p className="empty-subtext">Create your first carousel poster</p>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>{editingBanner ? 'Edit Poster' : 'Add New Poster'}</h2>
            
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Title</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                  placeholder="Enter poster title"
                  required
                />
              </div>

              <div className="form-group">
                <label>Poster Image</label>
                <div className="file-upload-wrapper">
                  <input
                    type="file"
                    id="poster-image"
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    onChange={handleImageSelect}
                    disabled={uploadingImage}
                  />
                  <label htmlFor="poster-image" className="file-upload-label">
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

              <div className="form-row">
                <div className="form-group">
                  <label>Target Screen</label>
                  <select
                    value={formData.targetScreen}
                    onChange={(e) => setFormData({...formData, targetScreen: e.target.value})}
                  >
                    {targetScreenOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Display Order</label>
                  <input
                    type="number"
                    value={formData.sortOrder}
                    onChange={(e) => setFormData({...formData, sortOrder: parseInt(e.target.value)})}
                    min="0"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({...formData, isActive: e.target.checked})}
                  />
                  <span>Active</span>
                </label>
              </div>

              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={handleCloseModal}>
                  Cancel
                </button>
                <button type="submit" className="submit-btn" disabled={!formData.imageUrl}>
                  {editingBanner ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Posters;
