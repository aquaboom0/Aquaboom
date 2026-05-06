import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import Banner from '../models/Banner.js';
import { verifyAdminToken } from '../middleware/adminAuth.middleware.js';
import { logger } from '../config/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '../../uploads/banners');
fs.mkdirSync(uploadsDir, { recursive: true });

const router = express.Router();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '.jpg';
    cb(null, `banner-${Date.now()}${ext.toLowerCase()}`);
  },
});

const uploadPoster = multer({
  storage,
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|jpg|png|webp)$/i.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG or WebP images'));
    }
  },
});

function normalizeBannerDoc(doc) {
  if (!doc) return doc;
  const o = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    ...o,
    image: o.imageUrl,
    imageUrl: o.imageUrl,
    order: o.sortOrder,
    sortOrder: o.sortOrder,
  };
}

/** Public carousel — admin-managed posters (home “Offers”). */
router.get('/', async (_req, res) => {
  try {
    const raw = await Banner.find({ isActive: true }).sort({ sortOrder: 1, createdAt: -1 }).lean();
    const data = raw.map((b) => {
      const img = b.imageUrl || b.image;
      const ord = b.sortOrder ?? b.order ?? 0;
      return {
        ...b,
        imageUrl: img,
        sortOrder: ord,
        image: img,
        order: ord,
      };
    });

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    logger.error(`Get banners error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch banners.',
    });
  }
});

/** Upload poster asset (saved under /uploads/banners/). */
router.post(
  '/upload',
  verifyAdminToken,
  (req, res, next) => {
    uploadPoster.single('image')(req, res, (err) => {
      if (err) {
        logger.error(`Banner upload: ${err.message}`);
        return res.status(400).json({ success: false, message: err.message || 'Invalid file' });
      }
      next();
    });
  },
  (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'Missing image file (field name: image).' });
      }
      const publicPath = `/uploads/banners/${req.file.filename}`;
      const base = `${req.protocol}://${req.get('host')}`;
      res.json({
        success: true,
        data: {
          path: publicPath,
          url: `${base}${publicPath}`,
        },
      });
    } catch (error) {
      logger.error(`Banner upload response: ${error.message}`);
      res.status(500).json({ success: false, message: 'Upload failed.' });
    }
  }
);

router.get('/admin', verifyAdminToken, async (_req, res) => {
  try {
    const banners = await Banner.find().sort({ sortOrder: 1, createdAt: -1 });
    res.json({
      success: true,
      data: banners.map((b) => normalizeBannerDoc(b)),
    });
  } catch (error) {
    logger.error(`Admin get banners error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to fetch banners.' });
  }
});

router.post('/', verifyAdminToken, async (req, res) => {
  try {
    const title = req.body.title?.trim();
    const imageUrl = (req.body.imageUrl || req.body.image)?.trim?.();
    const sortOrder = req.body.sortOrder ?? req.body.order ?? 0;
    const targetScreen = (req.body.targetScreen ?? req.body.link ?? '').trim();
    const isActive = req.body.isActive !== false;

    if (!title || !imageUrl) {
      return res.status(400).json({
        success: false,
        message: 'Title and image URL are required.',
      });
    }

    const banner = await Banner.create({
      title,
      imageUrl,
      sortOrder: Number(sortOrder) || 0,
      targetScreen,
      isActive,
    });

    res.status(201).json({
      success: true,
      message: 'Banner created.',
      data: normalizeBannerDoc(banner),
    });
  } catch (error) {
    logger.error(`Create banner error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to create banner.' });
  }
});

router.put('/:bannerId', verifyAdminToken, async (req, res) => {
  try {
    const patch = {};

    if (req.body.title != null) patch.title = String(req.body.title).trim();
    const img = req.body.imageUrl ?? req.body.image;
    if (img != null && String(img).trim()) patch.imageUrl = String(img).trim();
    if (req.body.targetScreen !== undefined || req.body.link !== undefined) {
      patch.targetScreen = String(req.body.targetScreen ?? req.body.link ?? '').trim();
    }
    if (req.body.sortOrder !== undefined || req.body.order !== undefined) {
      patch.sortOrder = Number(req.body.sortOrder ?? req.body.order) || 0;
    }
    if (req.body.isActive !== undefined) patch.isActive = Boolean(req.body.isActive);

    const banner = await Banner.findByIdAndUpdate(req.params.bannerId, patch, { new: true });

    if (!banner) {
      return res.status(404).json({ success: false, message: 'Banner not found.' });
    }

    res.json({
      success: true,
      message: 'Banner updated.',
      data: normalizeBannerDoc(banner),
    });
  } catch (error) {
    logger.error(`Update banner error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to update banner.' });
  }
});

router.delete('/:bannerId', verifyAdminToken, async (req, res) => {
  try {
    const banner = await Banner.findByIdAndDelete(req.params.bannerId);

    if (!banner) {
      return res.status(404).json({ success: false, message: 'Banner not found.' });
    }

    res.json({
      success: true,
      message: 'Banner deleted.',
    });
  } catch (error) {
    logger.error(`Delete banner error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to delete banner.' });
  }
});

router.post('/reorder', verifyAdminToken, async (req, res) => {
  try {
    const { bannerIds } = req.body;

    if (!bannerIds || !Array.isArray(bannerIds)) {
      return res.status(400).json({
        success: false,
        message: 'bannerIds array required.',
      });
    }

    for (let i = 0; i < bannerIds.length; i++) {
      await Banner.findByIdAndUpdate(bannerIds[i], { sortOrder: i });
    }

    const banners = await Banner.find().sort({ sortOrder: 1 });
    res.json({
      success: true,
      data: banners.map((b) => normalizeBannerDoc(b)),
    });
  } catch (error) {
    logger.error(`Reorder banners error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to reorder banners.' });
  }
});

export default router;
