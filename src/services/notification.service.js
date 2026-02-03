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
                console.log(`🔔 DEBUG: Emitting new_notification to user_${userId}`);
                io.to(`user_${userId}`).emit('new_notification', populatedNotification);
            } else {
                console.log('🔔 DEBUG: IO instance not found during createNotification');
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
        console.log(`🔔 DEBUG: sendOrderNotification called. Type: ${type}, Order: ${order._id}`);
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
                },
                seller: {
                    title: 'Refill Pickup Scheduled',
                    message: `A driver has been assigned to pick up refill order ${orderId}.`
                }
            },
            refill_requested: {
                seller: {
                    title: 'New Refill Request',
                    message: `Refill requested for order ${orderId}.`
                },
                buyer: {
                    title: 'Refill Received',
                    message: `Your refill request ${orderId} has been received.`
                }
            },
            return_requested: {
                seller: {
                    title: 'New Return Request',
                    message: `Return requested for order ${orderId}.`
                },
                buyer: {
                    title: 'Return Received',
                    message: `Your return request ${orderId} has been received.`
                }
            },
            return_pickup: {
                driver: {
                    title: 'New Return Pickup',
                    message: `You have been assigned to pick up return order ${orderId}.`
                },
                seller: {
                    title: 'Return Pickup Scheduled',
                    message: `A driver has been assigned to pick up return order ${orderId}.`
                },
                buyer: {
                    title: 'Driver Assigned',
                    message: `Driver assigned for your return pickup (Order ${orderId}).`
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
            },
            empty_return: {
                seller: {
                    title: 'Return Update',
                    message: `Empty cylinder is returning to you (Swap).`
                },
                buyer: {
                    title: 'Return Picked Up',
                    message: `Driver has picked up the empty cylinder from you.`
                },
                driver: {
                    title: 'Return Collected',
                    message: `Empty cylinder collected. Return to seller.`
                }
            }
        };

        const template = notificationTemplates[type];

        // Even if no template found (e.g. just status update without notif), we should emit socket status update
        // But current logic returns empty notifications array if no template

        // Emit real-time status update regardless of notification creation
        emitOrderStatusUpdate(order);

        if (!template) {
            console.log(`🔔 DEBUG: No template found for type ${type}`);
            return notifications;
        }

        for (const [role, content] of Object.entries(template)) {
            let userId;

            if (role === 'buyer') userId = buyer?._id || buyer;
            else if (role === 'seller') userId = seller?._id || seller;
            else if (role === 'driver') userId = driver?._id || driver;

            if (userId) {
                try {
                    console.log(`🔔 DEBUG: Creating notification for ${role} (${userId})`);
                    const notification = await this.createNotification(userId, {
                        ...content,
                        type,
                        relatedOrder: order._id
                    });
                    notifications.push(notification);
                } catch (error) {
                    console.error(`Error sending ${type} notification to ${role}:`, error);
                }
            } else {
                console.log(`🔔 DEBUG: No userId found for role ${role} in order`);
            }
        }

        return notifications;
    }
}

module.exports = new NotificationService();
