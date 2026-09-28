import { Router } from 'express';
import { verifyCertificateController } from '../../controllers/public/certificate.controller';
import { validateCertificateParam } from '../../validators/public/certificate.validator';

// No login: anyone with the ID printed on a certificate can check it
const router = Router();

router.get('/verify/:certificateId', validateCertificateParam, verifyCertificateController);

export default router;
