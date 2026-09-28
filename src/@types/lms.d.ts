import { IEnrolledCourseLink } from '../interfaces/enrolled-course-link.interface';

declare global {
  namespace Express {
    interface Request {
      // Set by requireEnrollment for /lms/courses/:courseId routes
      lmsEnrollment?: IEnrolledCourseLink;
    }
  }
}
export {};
