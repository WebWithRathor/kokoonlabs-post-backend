# API Route Map

Organized around the top-level split:

```typescript
// index.ts
router.use('/public', publicRoutes);
router.use('/private', adminRoutes);
router.use('/webhooks', webhookRoutes);   // machine-to-machine, verified by signature/token, no login
```

- **`/public`** — user-facing (auth guards applied per-router where needed)
- **`/private`** — admin only (`isAuthenticated` + `isAdmin` applied once in the index)
- **`/webhooks`** — belongs to neither; verified by signature/token

---

## `publicRoutes` index

```typescript
router.use('/auth', authRoutes);                             // done
router.use('/me', meRoutes);                                 // done
router.use('/courses', courseRoutes);
router.use('/kits', kitsRoutes);                             // done
router.use('/coupons', couponRoutes);
router.use('/course-registrations', courseRegistrationRoutes);
router.use('/payments', paymentRoutes);
router.use('/enrollments', enrollmentRoutes);
router.use('/tracking', trackingRoutes);                     // done
```

## `adminRoutes` index

Apply the gate once here so no sub-router repeats it:

```typescript
router.use(isAuthenticated, isAdmin);

router.use('/users', adminUserRoutes);
router.use('/courses', adminCourseRoutes);
router.use('/kits', adminKitRoutes);
router.use('/equipment', adminEquipmentRoutes);
router.use('/coupons', adminCouponRoutes);
router.use('/course-registrations', adminCourseRegistrationRoutes);
router.use('/payments', adminPaymentRoutes);
router.use('/failed-payments', adminFailedPaymentRoutes);
router.use('/enrollments', adminEnrollmentRoutes);
router.use('/tracking', adminTrackingRoutes);
router.use('/error-logs', adminErrorLogRoutes);
```

---

# Public routers

### courseRoutes → `/public/courses`
```typescript
router.get('/', validateListCourses, parseQueryParams, listCourses);
router.get('/:slug', getCourseBySlug);
router.get('/:slug/content', optionalAuthentication, getCourseContent); // enrolled = full, else preview
router.get('/:slug/kits', getCourseKits);
```

### couponRoutes → `/public/coupons`
```typescript
router.use(isAuthenticated);
router.post('/validate', validateApplyCoupon, applyCoupon);   // returns discount + final price
```

### courseRegistrationRoutes → `/public/course-registrations`
```typescript
router.post('/', optionalAuthentication, validateCreateRegistration, createRegistration);
```

### paymentRoutes → `/public/payments`
```typescript
router.use(isAuthenticated);
router.post('/create-order', validateCreatePaymentOrder, createPaymentOrder);
router.post('/verify', validateVerifyPayment, verifyPayment);
router.get('/my-payments', parseQueryParams, getMyPayments);
router.get('/my-failed-payments', parseQueryParams, getMyFailedPayments);
router.post('/retry', validateRetryPayment, retryPayment);
```

### enrollmentRoutes → `/public/enrollments`
```typescript
router.use(isAuthenticated);
router.get('/my-courses', parseQueryParams, getMyEnrollments);
router.get('/:courseSlug', getMyEnrollment);          // ownership check inside
router.post('/update-progress', validateUpdateProgress, updateProgress);
```

### trackingRoutes → `/public/tracking`  *(already built — target shape)*
```typescript
router.use(isAuthenticated);
router.get('/:orderId', getMyTracking);               // confirm order belongs to req.user
```

---

# System router

### webhookRoutes → `/webhooks`
```typescript
router.post('/payment', verifyPaymentWebhook, handlePaymentWebhook);
router.post('/shiprocket', verifyShiprocketWebhook, handleShiprocketWebhook);
```

---

# Admin routers  *(gate already applied by the index)*

### adminUserRoutes → `/private/users`
```typescript
router.get('/', validateListUsers, parseQueryParams, listUsers);
router.get('/:id', getUserById);
router.post('/update-role', validateUpdateUserRole, updateUserRole);
router.post('/toggle-active', validateToggleUserActive, toggleUserActive);  // ban / unban
router.post('/delete', validateDeleteUser, deleteUser);                     // soft delete
```

### adminCourseRoutes → `/private/courses`
```typescript
router.get('/', parseQueryParams, adminListCourses);   // includes drafts
router.get('/:id', adminGetCourse);
router.post('/create', validateCreateCourse, upload.single('thumbnail'), createCourse);
router.post('/update', validateUpdateCourse, updateCourse);
router.post('/toggle-status', validateToggleCourseStatus, toggleCourseStatus); // publish/unpublish
router.post('/delete', validateDeleteCourse, deleteCourse);
```

### adminKitRoutes → `/private/kits`
```typescript
router.get('/', parseQueryParams, adminListKits);
router.get('/:id', adminGetKit);
router.post('/create', validateCreateKit, upload.array('images'), createKit);
router.post('/update', validateUpdateKit, updateKit);
router.post('/delete', validateDeleteKit, deleteKit);
```

### adminEquipmentRoutes → `/private/equipment`
```typescript
router.get('/', parseQueryParams, adminListEquipment);
router.get('/:id', adminGetEquipment);
router.post('/create', validateCreateEquipment, upload.array('images'), createEquipment);
router.post('/update', validateUpdateEquipment, updateEquipment);
router.post('/delete', validateDeleteEquipment, deleteEquipment);   // block if referenced by a kit
```

### adminCouponRoutes → `/private/coupons`
```typescript
router.get('/', parseQueryParams, adminListCoupons);
router.get('/:id', adminGetCoupon);
router.post('/create', validateCreateCoupon, createCoupon);
router.post('/update', validateUpdateCoupon, updateCoupon);
router.post('/toggle-active', validateToggleCouponActive, toggleCouponActive);
router.post('/delete', validateDeleteCoupon, deleteCoupon);
```

### adminCourseRegistrationRoutes → `/private/course-registrations`  *(read-only)*
```typescript
router.get('/', parseQueryParams, adminListRegistrations);
router.get('/stats', validateRegistrationStats, getRegistrationStats); // registrations vs enrollments
```

### adminPaymentRoutes → `/private/payments`
```typescript
router.get('/', parseQueryParams, adminListPayments);
router.get('/:id', adminGetPayment);
router.post('/refund', validateRefundPayment, refundPayment);
```

### adminFailedPaymentRoutes → `/private/failed-payments`  *(write-by-system, read only)*
```typescript
router.get('/', parseQueryParams, adminListFailedPayments);
router.get('/:id', adminGetFailedPayment);
```

### adminEnrollmentRoutes → `/private/enrollments`
```typescript
router.get('/', parseQueryParams, adminListEnrollments);
router.get('/course/:courseId', getCourseEnrollmentCount);
router.post('/grant', validateGrantEnrollment, grantEnrollment);    // manual / comp access
router.post('/revoke', validateRevokeEnrollment, revokeEnrollment);
```

### adminTrackingRoutes → `/private/tracking`  *(Shiprocket fulfillment)*
```typescript
router.get('/', parseQueryParams, adminListTracking);
router.get('/:orderId', adminGetTracking);
router.post('/create-shipment', validateCreateShipment, createShipment);   // push to Shiprocket
router.post('/assign-awb', validateAssignAwb, assignAwb);
router.post('/schedule-pickup', validateSchedulePickup, schedulePickup);
router.post('/cancel-shipment', validateCancelShipment, cancelShipment);
```

### adminErrorLogRoutes → `/private/error-logs`  *(write-by-middleware, read + purge)*
```typescript
router.get('/', parseQueryParams, listErrorLogs);
router.get('/:id', getErrorLog);
router.post('/purge', validatePurgeErrorLogs, purgeErrorLogs);
```

---

## Conventions carried through

- **Reads use a param, mutations use verb-paths with the id in the body** — matching your address routes (`/update-address` takes the id in the body). Params appear only on single-resource reads (`/:slug`, `/:id`, `/:orderId`).
- **All writes are `POST`**, all reads are `GET`.
- **Validators are the first middleware** (`validateXxx`), `parseQueryParams` on every list.
- **`failed-payments` and `error-logs` are write-by-system, read-by-admin** — no create/update/delete.
- **Webhooks never use `isAuthenticated`** — Shiprocket and the payment gateway can't log in; they're gated by signature/token.

## Must-verify (security, not tidiness)

- `getMyTracking` (`/:orderId`) and `getMyEnrollment` (`/:courseSlug`) take an id from the URL — the controller must confirm the record belongs to `req.user`, or one user can read another's shipment/enrollment.
- `retryPayment` and `applyCoupon` touch money — re-check coupon validity and payment ownership server-side even though the client already "validated".
- The only thing separating `/public` from `/private` is the mount path — make sure no `/public` router leaks admin data.