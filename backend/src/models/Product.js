import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    default: '',
  },
  images: [{
    type: String,
  }],
  pricePerUnit: {
    type: Number,
    required: true,
    min: 0,
  },
  unit: {
    type: String,
    enum: ['bottle', 'pack', 'litre', 'can'],
    default: 'bottle',
  },
  stock: {
    type: Number,
    default: 100,
    min: 0,
  },
  isAvailable: {
    type: Boolean,
    default: true,
  },
  category: {
    type: String,
    enum: ['500ml', '1L', '2L', '5L', '20L', 'can'],
    required: true,
  },
  weight: {
    type: Number,
    default: 1, // in kg
  },
  mrp: {
    type: Number,
    min: 0,
  },
  badge: {
    type: String,
    enum: ['Best Seller', 'New', 'Sale', 'Popular', null],
    default: null,
  },
}, {
  timestamps: true,
});

// Index for faster queries
productSchema.index({ category: 1 });
productSchema.index({ isAvailable: 1 });

const Product = mongoose.model('Product', productSchema);

export default Product;