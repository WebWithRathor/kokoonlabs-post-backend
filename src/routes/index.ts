import { Router } from 'express';
import publicRoutes from './public';
import privateRoutes from './private';
import reviewRoutes from './review';
import ResponseHandler from '../utils/response-handler';

const router = Router();

router.get('/health', (req, res) => {
  ResponseHandler.success({ message: 'Welcome to Kokoonlabs Backend' }).send(
    res
  );
});

// Namespaced API routes
router.use('/public', publicRoutes);
router.use('/private', privateRoutes);
router.use('/review', reviewRoutes);

export default router;
