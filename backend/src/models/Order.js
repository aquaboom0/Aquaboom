import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const trackingHistorySchema = new mongoose.Schema({
  status: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  location: {
    lat: Number,
    lng: Number,
  },
  note: String,
}, { _id: true });

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  name: String,
  priceAtOrder: Number,
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  image: String,
}, { _id: true });

const deliveryAddressSchema = new mongoose.Schema({
  label: String,
  line1: { type: String, required: true },
  line2: String,
  city: { type: String, required: true },
  pincode: { type: String, required: true },
  landmark: String,
  lat: Number,
  lng: Number,
}, { _id: false });

const orderSchema = new mongoose.Schema({
  orderId: {
    type: String,
    unique: true,
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  items: [orderItemSchema],
  deliveryAddress: deliveryAddressSchema,
  subtotal: {
    type: Number,
    required: true,
    min: 0,
  },
  deliveryCharge: {
    type: Number,
    default: 0,
    min: 0,
  },
  discount: {
    type: Number,
    default: 0,
    min: 0,
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0,
  },
  paymentMethod: {
    type: String,
    enum: ['ONLINE', 'COD'],
    required: true,
  },
  paymentStatus: {
    type: String,
    enum: ['PENDING', 'PAID', 'FAILED', 'REFUNDED'],
    default: 'PENDING',
  },
  razorpayOrderId: String,
  razorpayPaymentId: String,
  razorpaySignature: String,
  status: {
    type: String,
    enum: [
      'PLACED',
      'PENDING_APPROVAL',
      'AUTO_APPROVED',
      'ASSIGNED',
      'PICKED_UP',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
      'FAILED',
      'CANCELLED',
    ],
    default: 'PLACED',
  },
  assignedAgent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DeliveryAgent',
    default: null,
  },
  assignedAt: Date,
  pickedUpAt: Date,
  deliveredAt: Date,
  failureReason: String,
  otp: {
    type: String,
    length: 4,
  },
  otpVerified: {
    type: Boolean,
    default: false,
  },
  trackingHistory: [trackingHistorySchema],
  isCOD: {
    type: Boolean,
    default: false,
  },
  codCollected: {
    type: Boolean,
    default: false,
  },
  estimatedDelivery: Date,
  customerNote: String,
}, {
  timestamps: true,
});

// Pre-save hook to generate order ID
orderSchema.pre('save', async function (next) {
  if (!this.orderId) {
    const year = new Date().getFullYear();
    const count = await mongoose.model('Order').countDocuments() + 1;
    this.orderId = `AQ-${year}-${String(count).padStart(5, '0')}`;
  }
  
  // Generate OTP if not exists
  if (!this.otp) {
    this.otp = Math.floor(1000 + Math.random() * 9000).toString();
  }
  
  next();
});

// Add initial tracking entry
orderSchema.pre('save', function (next) {
  if (this.isNew && this.trackingHistory.length === 0) {
    const note =
      this.status === 'PENDING_APPROVAL'
        ? 'Order received — awaiting confirmation'
        : 'Order placed successfully';
    this.trackingHistory.push({
      status: this.status,
      timestamp: new Date(),
      note,
    });
  }
  next();
});

// Index for faster queries
orderSchema.index({ customer: 1, createdAt: -1 });
orderSchema.index({ status: 1 });
orderSchema.index({ assignedAgent: 1 });
orderSchema.index({ orderId: 1 });

const Order = mongoose.model('Order', orderSchema);

export default Order;