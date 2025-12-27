/**
 * @swagger
 * tags:
 *   name: Socket Events
 *   description: Real-time communication layer for live updates and tracking.
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     AuthenticatedEvent:
 *       type: object
 *       properties:
 *         userId:
 *           type: string
 *           example: "66a8f93e9c0f5f2e3e8d6a1b"
 *         role:
 *           type: string
 *           example: "driver"
 *     DriverLocationUpdate:
 *       type: object
 *       properties:
 *         orderId:
 *           type: string
 *           example: "66a8f93e9c0f5f2e3e8d6a1b"
 *         location:
 *           type: object
 *           properties:
 *             latitude:
 *               type: number
 *               example: 33.6844
 *             longitude:
 *               type: number
 *               example: 73.0479
 *         driver:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             vehicleNumber:
 *               type: string
 *     OrderStatusUpdate:
 *       type: object
 *       properties:
 *         orderId:
 *           type: string
 *         status:
 *           type: string
 *           example: "in_transit"
 *         timestamp:
 *           type: string
 *           format: date-time
 *           example: "2025-10-23T12:34:56Z"
 */

/**
 * @swagger
 * /socket.io:
 *   get:
 *     summary: Socket.IO Events
 *     tags: [Socket Events]
 *     description: >
 *       ### Socket.IO Event Reference
 *       Connect using a Socket.IO client at:
 *       ```
 *       const socket = io("https://api.totalaccess.com");
 *       ```
 *       After connecting, you can emit or listen to the following events:
 *
 *       #### 🔐 Authentication
 *       - **Event:** `authenticate`  
 *         **Payload:** `{ token: "<JWT_TOKEN>" }`  
 *         **Response:** Emits `authenticated` or `auth_error`
 *
 *       #### 🚚 Driver Location Updates
 *       - **Event:** `driver_location_update`  
 *         **Payload:** `{ latitude, longitude }`  
 *         **Broadcasts:** `driver_location_update` → to buyer rooms
 *
 *       #### 📦 Order Tracking
 *       - **Event:** `join_order_room`  
 *         **Payload:** `{ orderId }`  
 *         **Purpose:** Join a room to receive real-time order updates.
 *
 *       #### 🧾 Seller Approval Updates
 *       - **Event:** `seller_approval_update`  
 *         **Payload:** `{ status, message, timestamp }`
 *
 *       ---
 *       🧠 **Note:** Socket events are not callable via Swagger.  
 *       Use Postman WebSocket tab or a Socket.IO client for live testing.
 *     responses:
 *       200:
 *         description: Socket event documentation only (no live endpoint)
 */
