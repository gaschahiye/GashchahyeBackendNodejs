const Notification = require('../models/Notification');
const { getIO, emitOrderStatusUpdate } = require('../config/socket');

class NotificationService {
  async createNotification(userId, notificationData) {
    try {
      const notification = await Notification.create({
        user: userId,
        ...notificationData
      });

      // Populate notification for socket emission
      const populatedNotification = await Notification.findById(notification._id)
        .populate('relatedOrder', 'orderId status')
        .populate('user', 'fullName phoneNumber');

      // Emit real-time notification
      const io = getIO();
      if (io) {
        io.to(`user_${userId}`).emit('new_notification', populatedNotification);
      }

      return populatedNotification;
    } catch (error) {
      console.error('Error creating notification:', error);
      throw error;
    }
  }

  async getUserNotifications(userId, options = {}) {
    const { page = 1, limit = 20, unreadOnly = false } = options;
    const skip = (page - 1) * limit;

    const query = { user: userId };
    if (unreadOnly) {
      query.isRead = false;
    }

    const notifications = await Notification.find(query)
      .populate('relatedOrder', 'orderId status')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Notification.countDocuments(query);
    const unreadCount = await Notification.countDocuments({
      user: userId,
      isRead: false
    });

    return {
      notifications,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalNotifications: total,
        unreadCount
      }
    };
  }

  async markAsRead(notificationId, userId) {
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, user: userId },
      { isRead: true },
      { new: true }
    ).populate('relatedOrder', 'orderId status');

    return notification;
  }

  async markAllAsRead(userId) {
    const result = await Notification.updateMany(
      { user: userId, isRead: false },
      { isRead: true }
    );

    return result;
  }

  async sendOrderNotification(order, type) {
    const notifications = [];
    const { buyer, seller, driver, orderId, status } = order;

    const notificationTemplates = {
      order_created: {
        buyer: {
          title: 'Order Confirmed',
          message: `Your order ${orderId} has been placed successfully.`
        },
        seller: {
          title: 'New Order Received',
          message: `You have a new order ${orderId}. Please prepare for pickup.`
        }
      },
      order_assigned: {
        driver: {
          title: 'New Delivery Assignment',
          message: `You have been assigned to deliver order ${orderId}.`
        },
        buyer: {
          title: 'Driver Assigned',
          message: `A driver has been assigned to your order ${orderId}.`
        }
      },
      order_status_update: {
        buyer: {
          title: 'Order Status Updated',
          message: `Your order ${orderId} is now ${status}.`
        }
      },
      refill_pickup: {
        driver: {
          title: 'New Refill Pickup',
          message: `You have been assigned to pick up refill order ${orderId}.`
        },
        buyer: {
          title: 'Driver Assigned',
          message: `Driver assigned for your refill pickup (Order ${orderId}).`
        }
      },
      refill_requested: {
        seller: {
          title: 'New Refill Request',
          message: `Refill requested for order ${orderId}.`
        }
      },
      delivery_confirmed: {
        buyer: {
          title: 'Delivery Completed',
          message: `Your order ${orderId} has been delivered successfully.`
        },
        driver: {
          title: 'Delivery Confirmed',
          message: `Delivery for order ${orderId} has been confirmed.`
        },
        seller: {
          title: 'Order Delivered',
          message: `Order ${orderId} has been delivered to customer.`
        }
      }
    };

    const template = notificationTemplates[type];

    // Even if no template found (e.g. just status update without notif), we should emit socket status update
    // But current logic returns empty notifications array if no template

    // Emit real-time status update regardless of notification creation
    emitOrderStatusUpdate(order);

    if (!template) return notifications;

    for (const [role, content] of Object.entries(template)) {
      let userId;

      if (role === 'buyer') userId = buyer;
      else if (role === 'seller') userId = seller;
      else if (role === 'driver') userId = driver;

      if (userId) {
        try {
          const notification = await this.createNotification(userId, {
            ...content,
            type,
            relatedOrder: order._id
          });
          notifications.push(notification);
        } catch (error) {
          console.error(`Error sending ${type} notification to ${role}:`, error);
        }
      }
    }

    return notifications;
  }
}

module.exports = new NotificationService();