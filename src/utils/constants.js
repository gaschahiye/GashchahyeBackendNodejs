module.exports = {
  CYLINDER_SIZES: ['15kg', '11.8kg', '6kg', '4.5kg'],
  ORDER_STATUS: {
    PENDING: 'pending',
    ASSIGNED: 'assigned',
    PICKUP_READY: 'pickup_ready',
    IN_TRANSIT: 'in_transit',
    DELIVERED: 'delivered',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled'
  },
  USER_ROLES: {
    ADMIN: 'admin',
    SELLER: 'seller',
    DRIVER: 'driver',
    BUYER: 'buyer'
  },
  PAYMENT_METHODS: ['jazzcash', 'easypaisa', 'debit_card', 'credit_card', 'cod'],
  NOTIFICATION_TYPES: {
    ORDER_CREATED: 'order_created',
    ORDER_ASSIGNED: 'order_assigned',
    ORDER_STATUS_UPDATE: 'order_status_update',
    PAYMENT_SUCCESS: 'payment_success',
    PAYMENT_FAILED: 'payment_failed'
  }
};