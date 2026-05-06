import mongoose from 'mongoose';

/** One row per admin device — FCM token from the unified app when logged in as admin. */
const adminPushTokenSchema = new mongoose.Schema(
  {
    fcmToken: { type: String, required: true, unique: true, trim: true },
  },
  { timestamps: true }
);

export default mongoose.model('AdminPushToken', adminPushTokenSchema);
