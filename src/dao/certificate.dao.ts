import { Types } from 'mongoose';
import Certificate from '../models/certificate.model';
import { ICertificate } from '../interfaces/lms-rewards.interface';

type Id = Types.ObjectId | string;

const FIELDS = 'user course type certificateId issueDate metadata';

export class CertificateDao {
  // Owner only: another student's certificate id returns null (404, not 403)
  async findForOwner(certificateId: string, userId: Id): Promise<ICertificate | null> {
    return await Certificate.findOne({ certificateId, user: userId }).select(FIELDS).lean<ICertificate>();
  }

  // Public verification by the id printed on the certificate
  async findByCertificateId(certificateId: string): Promise<ICertificate | null> {
    return await Certificate.findOne({ certificateId }).select(FIELDS).lean<ICertificate>();
  }
}

export default new CertificateDao();
