import Tracking from '../models/tracking.model';
import {
  ITracking,
  ITrackingEvent,
  TrackingStatus
} from '../interfaces/tracking.interface';

export class TrackingDao {
  async findByOrderId(orderId: string): Promise<ITracking | null> {
    return (await Tracking.findOne({ orderId })) as ITracking | null;
  }

  async findByTrackingNumber(
    trackingNumber: string
  ): Promise<ITracking | null> {
    return (await Tracking.findOne({ trackingNumber })) as ITracking | null;
  }

  async createOrUpdate(trackingData: Partial<ITracking>): Promise<ITracking> {
    return (await Tracking.findOneAndUpdate(
      { orderId: trackingData.orderId },
      { $set: trackingData },
      { new: true, upsert: true }
    )) as ITracking;
  }

  async addEvent(
    orderId: string,
    status: TrackingStatus,
    event: ITrackingEvent
  ): Promise<ITracking | null> {
    return (await Tracking.findOneAndUpdate(
      { orderId },
      {
        $set: { status },
        $push: { events: event }
      },
      { new: true }
    )) as ITracking | null;
  }
}

export const trackingDao = new TrackingDao();
export default trackingDao;
