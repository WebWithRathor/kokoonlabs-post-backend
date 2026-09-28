import { Request, Response } from 'express';
import ResponseHandler from '../../utils/response-handler';
import asyncHandler from '../../utils/async-handler';
import ErrorHandler from '../../utils/error-handler';
import { ERROR_CODES } from '../../constants/error-codes';
import {
  downloadCertificate,
  verifyCertificate
} from '../../services/public/certificate.service';

export const downloadCertificateController = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.user?._id) throw new ErrorHandler(ERROR_CODES.USER_NOT_LOGGED_IN);
    const { fileName, bytes } = await downloadCertificate(
      String(req.user._id),
      String(req.params.certificateId)
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).send(Buffer.from(bytes));
  }
);

export const verifyCertificateController = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const result = await verifyCertificate(String(req.params.certificateId));
    ResponseHandler.success(result, result.message).send(res);
  }
);
