import { Request, Response, NextFunction } from 'express';
import ResponseHandler from '../../utils/response-handler';
import { createOrderService, getOrderService } from '../../services/public/orders.service';

export const createOrder = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { cart_token, customer, shipping_address, payment_method } = req.body;
    const userId = (req.user as any)?._id;

    const order = await createOrderService({
      cartToken: cart_token,
      customer,
      shippingAddress: shipping_address,
      paymentMethod: payment_method,
      userId
    });

    ResponseHandler.created(order, 'Order created successfully').send(res);
  } catch (error) {
    next(error);
  }
};

export const getOrder = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const orderId = req.params.orderId as string;
    const token = req.query.token as string | undefined;
    const userId = (req.user as any)?._id;

    const order = await getOrderService(orderId, token, userId);
    ResponseHandler.success(order, 'Order fetched successfully').send(res);
  } catch (error) {
    next(error);
  }
};
