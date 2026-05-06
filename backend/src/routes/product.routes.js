import express from 'express';
import Product from '../models/Product.js';
import { verifyAdminToken } from '../middleware/adminAuth.middleware.js';
import { uploadImage, deleteImage } from '../config/cloudinary.js';
import { logger } from '../config/logger.js';

const router = express.Router();

// Get all products (public)
router.get('/', async (req, res) => {
  try {
    const { category, isAvailable, search, page = 1, limit = 20 } = req.query;

    const query = {};

    if (category) {
      query.category = category;
    }

    if (isAvailable !== undefined) {
      query.isAvailable = isAvailable === 'true';
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const products = await Product.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Product.countDocuments(query);

    res.json({
      success: true,
      data: products,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error(`Get products error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products.',
    });
  }
});

// Get single product (public)
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found.',
      });
    }

    res.json({
      success: true,
      data: product,
    });
  } catch (error) {
    logger.error(`Get product error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch product.',
    });
  }
});

// Create product (admin only)
router.post('/', verifyAdminToken, async (req, res) => {
  try {
    const { name, description, pricePerUnit, unit, stock, category, weight, mrp, badge, images } = req.body;

    const product = await Product.create({
      name,
      description,
      pricePerUnit,
      unit,
      stock,
      category,
      weight,
      mrp,
      badge,
      images: images || [],
    });

    res.status(201).json({
      success: true,
      data: product,
      message: 'Product created successfully.',
    });
  } catch (error) {
    logger.error(`Create product error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to create product.',
    });
  }
});

// Update product (admin only)
router.put('/:id', verifyAdminToken, async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found.',
      });
    }

    res.json({
      success: true,
      data: product,
      message: 'Product updated successfully.',
    });
  } catch (error) {
    logger.error(`Update product error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to update product.',
    });
  }
});

// Delete product (admin only) - soft delete
router.delete('/:id', verifyAdminToken, async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { isAvailable: false },
      { new: true }
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found.',
      });
    }

    res.json({
      success: true,
      message: 'Product deleted successfully.',
    });
  } catch (error) {
    logger.error(`Delete product error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to delete product.',
    });
  }
});

// Upload product image (admin only)
router.post('/upload-image', verifyAdminToken, async (req, res) => {
  try {
    // Note: In production, use multer for file upload
    // This is a placeholder for the upload logic
    const { imageUrl } = req.body;

    if (!imageUrl) {
      return res.status(400).json({
        success: false,
        message: 'Image URL is required.',
      });
    }

    res.json({
      success: true,
      data: { url: imageUrl },
      message: 'Image uploaded successfully.',
    });
  } catch (error) {
    logger.error(`Upload image error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to upload image.',
    });
  }
});

export default router;