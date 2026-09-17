import { Request, Response } from 'express';
import ResponseHandler from '../../utils/response-handler';
import asyncHandler from '../../utils/async-handler';
// import { trackOrderService } from '../../services/public/tracking.service';

export const trackOrder = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const orderId = req.query.orderId as string;
    const email = req.query.email as string | undefined;
    const phone = req.query.phone as string | undefined;

    // const result = await trackOrderService({
    //   orderId,
    //   email,
    //   phone
    // });

    ResponseHandler.success({}, 'Tracking info fetched successfully').send(res);
  }
);
