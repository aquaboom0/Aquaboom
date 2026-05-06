import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const deliveryAgentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  phone: {
    type: String,
    required: true,
    unique: true,
  },
  email: String,
  profileImage: String,
  vehicleType: {
    type: String,
    enum: ['bike', 'scooter', 'cycle'],
    default: 'bike',
  },
  vehicleNumber: {
    type: String,
    required: true,
  },
  licenseNumber: String,
  isActive: {
    type: Boolean,
    default: true,
  },
  isOnline: {
    type: Boolean,
    default: false,
  },
  isAvailable: {
    type: Boolean,
    default: false,
  },
  currentLocation: {
    lat: Number,
    lng: Number,
    updatedAt: Date,
  },
  activeOrderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    default: null,
  },
  stats: {
    totalDeliveries: {
      type: Number,
      default: 0,
    },
    totalEarnings: {
      type: Number,
      default: 0,
    },
    rating: {
      type: Number,
      default: 0,
    },
    totalRatings: {
      type: Number,
      default: 0,
    },
  },
  fcmToken: String,
  password: {
    type: String,
    required: true,
  },
  lastSeen: Date,
}, {
  timestamps: true,
});

// Hash password before saving
deliveryAgentSchema.pre('save', async function (next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 12);
  }
  next();
});

// Compare password method
deliveryAgentSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Index for geospatial queries
deliveryAgentSchema.index({ currentLocation: '2dsphere' });
deliveryAgentSchema.index({ phone: 1 });
deliveryAgentSchema.index({ isOnline: 1, isAvailable: 1 });

const DeliveryAgent = mongoose.model('DeliveryAgent', deliveryAgentSchema);

export default DeliveryAgent;