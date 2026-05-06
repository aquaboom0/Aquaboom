import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const addressSchema = new mongoose.Schema({
  label: {
    type: String,
    enum: ['Home', 'Office', 'Other'],
    default: 'Home',
  },
  line1: { type: String, required: true },
  line2: String,
  city: { type: String, required: true },
  pincode: { type: String, required: true },
  landmark: String,
  lat: Number,
  lng: Number,
  isDefault: { type: Boolean, default: false },
}, { _id: true });

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  /** 10-digit Indian mobile (digits only); used by delivery agents to reach the customer */
  phone: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    maxlength: 15,
  },
  email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
  password: String,
  role: {
    type: String,
    enum: ['customer', 'admin', 'delivery_agent'],
    default: 'customer',
  },
  profileImage: String,
  fcmToken: String,
  addresses: [addressSchema],
  isActive: { type: Boolean, default: true },
}, {
  timestamps: true,
});

userSchema.pre('save', async function (next) {
  if (this.isModified('password') && this.password) {
    this.password = await bcrypt.hash(this.password, 12);
  }
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);

export default User;