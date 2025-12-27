// src/config/swagger.js
const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");
const path = require("path");

const routesPath = path.resolve(__dirname, "../routes/**/*.js");
console.log("🔍 Swagger scanning routes from:", routesPath);

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Total Access Seller API",
      version: "1.0.0",
      description:
        "Seller management API documentation for Gas Cylinder Booking Platform",
      contact: {
        name: "API Support",
        email: "support@totalaccess.com",
      },
    },
    servers: [
      { url: "http://localhost:5000/api", description: "Development server" },
      { url: "https://api.totalaccess.com", description: "Production server" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
  },
  apis: [routesPath],
};

const swaggerSpec = swaggerJsdoc(options);

function swaggerDocs(app) {
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get("/api-docs.json", (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(swaggerSpec);
  });
  console.log("✅ Swagger docs available at http://localhost:5000/api-docs");
}

module.exports = swaggerDocs;


//   openapi: "3.0.0",
//   info: {
//     title: "LPG Cylinder Management System API",
//     description: `Complete backend API for LPG cylinder management with real-time tracking, inventory management, and multi-role support.

// ## Key Features:
// - 🔐 **Multi-role Authentication** (Admin, Seller, Driver, Buyer)
// - 📱 **OTP Verification** with mocked SMS service
// - 💳 **Payment Processing** with mocked payment gateways
// - 📍 **Geolocation Services** for nearby seller discovery
// - 📦 **Real-time Order Tracking** with Socket.io
// - 🏪 **Inventory Management** for sellers
// - 🚚 **Driver Assignment & Tracking**
// - 🎯 **QR Code Generation & Scanning**
// - 📄 **Invoice Generation** with PDF download
// - 🔔 **Real-time Notifications**

// ## Authentication:
// All protected endpoints require JWT token in Authorization header:
// \`Authorization: Bearer <your_token>\`

// ## User Roles:
// 1. **Admin** - Full system access, user management, analytics
// 2. **Seller** - Inventory management, order processing, business analytics
// 3. **Driver** - Order delivery, real-time tracking, QR code operations
// 4. **Buyer** - Order placement, cylinder management, refill requests

// ## Mock Services:
// - **OTP Service**: OTPs are logged to console in development
// - **Payment Service**: Mocked payment processing with simulated success/failure
// - **File Upload**: Firebase Storage integration for images and documents

// ## Real-time Features:
// WebSocket events for:
// - Order status updates
// - Driver location tracking
// - Seller approval notifications
// - Delivery confirmations

// ## Error Handling:
// All endpoints follow consistent error response format with proper HTTP status codes.`,
//     version: "1.0.0",
//     contact: {
//       name: "API Support",
//       email: "support@lpgmanagement.com",
//       url: "https://lpgmanagement.com"
//     },
//     license: {
//       name: "MIT",
//       url: "https://opensource.org/licenses/MIT"
//     }
//   },
//   servers: [
//     {
//       url: "http://localhost:5000/api",
//       description: "Development server"
//     },
//     {
//       url: "https://api.lpgmanagement.com/api",
//       description: "Production server"
//     }
//   ],
//   tags: [
//     {
//       name: "Authentication",
//       description: "User registration, login, and OTP verification"
//     },
//     {
//       name: "Buyer",
//       description: "Buyer-specific operations - orders, cylinders, refills"
//     },
//     {
//       name: "Seller",
//       description: "Seller operations - inventory, locations, orders"
//     },
//     {
//       name: "Driver",
//       description: "Driver operations - order delivery, tracking"
//     },
//     {
//       name: "Admin",
//       description: "Administrative operations - user management, analytics"
//     },
//     {
//       name: "Public",
//       description: "Public endpoints accessible without authentication"
//     }
//   ],
//   paths: {
//     "/auth/register": {
//       post: {
//         tags: ["Authentication"],
//         summary: "Register a new buyer",
//         description: "Creates a new buyer account and sends OTP for verification",
//         requestBody: {
//           required: true,
//           content: {
//             "application/json": {
//               schema: {
//                 $ref: "#/components/schemas/RegisterBuyerRequest"
//               },
//               examples: {
//                 basic: {
//                   summary: "Basic Registration",
//                   value: {
//                     phoneNumber: "+923001234567",
//                     email: "buyer@example.com",
//                     password: "password123",
//                     fullName: "John Doe",
//                     cnic: "12345-1234567-1",
//                     userType: "domestic",
//                     language: "english"
//                   }
//                 }
//               }
//             }
//           }
//         },
//         responses: {
//           201: {
//             description: "Registration successful, OTP sent",
//             content: {
//               "application/json": {
//                 schema: {
//                   $ref: "#/components/schemas/OTPResponse"
//                 },
//                 example: {
//                   success: true,
//                   message: "Registration successful. OTP sent to your phone.",
//                   userId: "507f1f77bcf86cd799439011",
//                   otp: "123456"
//                 }
//               }
//             }
//           },
//           400: {
//             description: "Validation error or user already exists",
//             content: {
//               "application/json": {
//                 schema: {
//                   $ref: "#/components/schemas/ErrorResponse"
//                 },
//                 example: {
//                   success: false,
//                   message: "User already exists with this phone number",
//                   errors: [
//                     {
//                       field: "phoneNumber",
//                       message: "Phone number already registered"
//                     }
//                   ]
//                 }
//               }
//             }
//           }
//         }
//       }
//     },
//     "/auth/register-seller": {
//       post: {
//         tags: ["Authentication"],
//         summary: "Register a new seller",
//         description: "Creates a new seller account awaiting admin approval",
//         requestBody: {
//           required: true,
//           content: {
//             "application/json": {
//               schema: {
//                 $ref: "#/components/schemas/RegisterSellerRequest"
//               },
//               examples: {
//                 basic: {
//                   summary: "Seller Registration",
//                   value: {
//                     businessName: "ABC Gas Company",
//                     phoneNumber: "+923001234568",
//                     email: "seller@example.com",
//                     orgaLicenseNumber: "ORGA-12345",
//                     orgaExpDate: "2026-12-31",
//                     ntnNumber: "NTN-123456",
//                     password: "password123"
//                   }
//                 }
//               }
//             }
//           }
//         },
//         responses: {
//           201: {
//             description: "Seller registration submitted for approval",
//             content: {
//               "application/json": {
//                 schema: {
//                   $ref: "#/components/schemas/OTPResponse"
//                 },
//                 example: {
//                   success: true,
//                   message: "Registration successful. Awaiting admin approval.",
//                   userId: "507f1f77bcf86cd799439012",
//                   otp: "654321"
//                 }
//               }
//             }
//           }
//         }
//       }
//     },
//     "/auth/verify-otp": {
//       post: {
//         tags: ["Authentication"],
//         summary: "Verify OTP and activate account",
//         requestBody: {
//           required: true,
//           content: {
//             "application/json": {
//               schema: {
//                 $ref: "#/components/schemas/VerifyOTPRequest"
//               },
//               example: {
//                 phoneNumber: "+923001234567",
//                 otp: "123456"
//               }
//             }
//           }
//         },
//         responses: {
//           200: {
//             description: "OTP verified successfully",
//             content: {
//               "application/json": {
//                 schema: {
//                   $ref: "#/components/schemas/AuthSuccessResponse"
//                 },
//                 example: {
//                   success: true,
//                   message: "Account verified successfully",
//                   accessToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
//                   refreshToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
//                   user: {
//                     _id: "507f1f77bcf86cd799439011",
//                     role: "buyer",
//                     phoneNumber: "+923001234567",
//                     email: "buyer@example.com",
//                     fullName: "John Doe",
//                     isVerified: true,
//                     sellerStatus: null
//                   }
//                 }
//               }
//             }
//           },
//           400: {
//             description: "Invalid or expired OTP",
//             content: {
//               "application/json": {
//                 schema: {
//                   $ref: "#/components/schemas/ErrorResponse"
//                 },
//                 example: {
//                   success: false,
//                   message: "Invalid OTP"
//                 }
//               }
//             }
//           }
//         }
//       }
//     },
//     "/auth/login": {
//       post: {
//         tags: ["Authentication"],
//         summary: "User login",
//         requestBody: {
//           required: true,
//           content: {
//             "application/json": {
//               schema: {
//                 $ref: "#/components/schemas/LoginRequest"
//               },
//               example: {
//                 phoneNumber: "+923001234567",
//                 password: "password123"
//               }
//             }
//           }
//         },
//         responses: {
//           200: {
//             description: "Login successful",
//             content: {
//               "application/json": {
//                 schema: {
//                   $ref: "#/components/schemas/AuthSuccessResponse"
//                 }
//               }
//             }
//           },
//           401: {
//             description: "Invalid credentials",
//             content: {
//               "application/json": {
//                 schema: {
//                   $ref: "#/components/schemas/ErrorResponse"
//                 },
//                 example: {
//                   success: false,
//                   message: "Invalid phone number or password"
//                 }
//               }
//             }
//           }
//         }
//       }
//     },
//     "/buyer/nearby-sellers": {
//       get: {
//         tags: ["Buyer"],
//         summary: "Find nearby sellers based on location",
//         security: [{ "BearerAuth": [] }],
//         parameters: [
//           {
//             name: "lat",
//             in: "query",
//             required: true,
//             description: "Latitude coordinate",
//             schema: { 
//               type: "number", 
//               format: "float",
//               example: 33.6844
//             }
//           },
//           {
//             name: "lng",
//             in: "query",
//             required: true,
//             description: "Longitude coordinate",
//             schema: { 
//               type: "number", 
//               format: "float",
//               example: 73.0479
//             }
//           },
//           {
//             name: "radius",
//             in: "query",
//             description: "Search radius in meters",
//             schema: { 
//               type: "integer", 
//               default: 5000,
//               example: 5000
//             }
//           },
//           {
//             name: "sortBy",
//             in: "query",
//             description: "Sorting criteria for sellers",
//             schema: {
//               type: "string",
//               enum: ["distance", "rating", "price_low", "price_high"],
//               default: "distance",
//               example: "rating"
//             }
//           }
//         ],
//         responses: {
//           200: {
//             description: "List of nearby sellers",
//             content: {
//               "application/json": {
//                 schema: {
//                   $ref: "#/components/schemas/NearbySellersResponse"
//                 },
//                 example: {
//                   success: true,
//                   sellers: [
//                     {
//                       _id: "507f1f77bcf86cd799439021",
//                       businessName: "Islamabad Gas Services",
//                       rating: { average: 4.5, count: 120 },
//                       distance: 1250.5,
//                       locations: [
//                         {
//                           _id: "507f1f77bcf86cd799439031",
//                           warehouseName: "Main Warehouse",
//                           city: "Islamabad",
//                           address: "Sector F-7, Islamabad",
//                           location: {
//                             type: "Point",
//                             coordinates: [73.0479, 33.6844]
//                           }
//                         }
//                       ],
//                       inventory: {
//                         pricePerKg: 250,
//                         cylinders: {
//                           "15kg": { quantity: 100, price: 3750 },
//                           "11.8kg": { quantity: 50, price: 2950 }
//                         }
//                       }
//                     }
//                   ]
//                 }
//               }
//             }
//           }
//         }
//       }
//     },
//     "/buyer/orders": {
//       post: {
//         tags: ["Buyer"],
//         summary: "Create a new order",
//         security: [{ "BearerAuth": [] }],
//         requestBody: {
//           required: true,
//           content: {
//             "application/json": {
//               schema: {
//                 $ref: "#/components/schemas/CreateOrderRequest"
//               },
//               example: {
//                 seller: "507f1f77bcf86cd799439021",
//                 orderType: "new",
//                 cylinderSize: "15kg",
//                 quantity: 1,
//                 deliveryLocation: {
//                   address: "House 123, Street 45, F-7/2, Islamabad",
//                   location: {
//                     type: "Point",
//                     coordinates: [73.0479, 33.6844]
//                   }
//                 },
//                 addOns: [
//                   {
//                     title: "Gas Pipe",
//                     price: 500,
//                     quantity: 1
//                   }
//                 ],
//                 isUrgent: false,
//                 payment: {
//                   method: "jazzcash"
//                 }
//               }
//             }
//           }
//         },
//         responses: {
//           201: {
//             description: "Order created successfully",
//             content: {
//               "application/json": {
//                 schema: {
//                   $ref: "#/components/schemas/OrderResponse"
//                 },
//                 example: {
//                   success: true,
//                   message: "Order created successfully",
//                   order: {
//                     _id: "507f1f77bcf86cd799439041",
//                     orderId: "ORD-1698765432109-1",
//                     buyer: {
//                       _id: "507f1f77bcf86cd799439011",
//                       fullName: "John Doe",
//                       phoneNumber: "+923001234567"
//                     },
//                     seller: {
//                       _id: "507f1f77bcf86cd799439021",
//                       businessName: "Islamabad Gas Services"
//                     },
//                     cylinderSize: "15kg",
//                     quantity: 1,
//                     pricing: {
//                       cylinderPrice: 3750,
//                       deliveryCharges: 100,
//                       subtotal: 4250,
//                       grandTotal: 4250
//                     },
//                     status: "pending",
//                     payment: {
//                       method: "jazzcash",
//                       status: "completed",
//                       transactionId: "JC1698765432109ABC123"
//                     }
//                   },
//                   payment: {
//                     success: true,
//                     transactionId: "JC1698765432109ABC123",
//                     message: "Payment processed successfully"
//                   }
//                 }
//               }
//             }
//           }
//         }
//       },
//       get: {
//         tags: ["Buyer"],
//         summary: "Get buyer's order history",
//         security: [{ "BearerAuth": [] }],
//         parameters: [
//           {
//             name: "status",
//             in: "query",
//             description: "Filter by order status",
//             schema: {
//               type: "string",
//               enum: ["pending", "in_transit", "delivered", "completed", "cancelled"]
//             }
//           },
//           {
//             name: "page",
//             in: "query",
//             schema: { 
//               type: "integer", 
//               default: 1,
//               minimum: 1
//             }
//           },
//           {
//             name: "limit",
//             in: "query",
//             schema: { 
//               type: "integer", 
//               default: 10,
//               minimum: 1,
//               maximum: 100
//             }
//           }
//         ],
//         responses: {
//           200: {
//             description: "Order list retrieved successfully",
//             content: {
//               "application/json": {
//                 schema: {
//                   $ref: "#/components/schemas/OrderListResponse"
//                 },
//                 example: {
//                   success: true,
//                   orders: [
//                     {
//                       _id: "507f1f77bcf86cd799439041",
//                       orderId: "ORD-1698765432109-1",
//                       cylinderSize: "15kg",
//                       status: "delivered",
//                       pricing: { grandTotal: 4250 },
//                       createdAt: "2024-10-20T10:30:00.000Z"
//                     }
//                   ],
//                   pagination: {
//                     currentPage: 1,
//                     totalPages: 5,
//                     totalOrders: 48,
//                     hasNext: true
//                   }
//                 }
//               }
//             }
//           }
//         }
//       }
//     },
//     "/buyer/refill": {
//       post: {
//         tags: ["Buyer"],
//         summary: "Request cylinder refill",
//         security: [{ "BearerAuth": [] }],
//         requestBody: {
//           required: true,
//           content: {
//             "application/json": {
//               schema: {
//                 $ref: "#/components/schemas/RefillRequest"
//               },
//               example: {
//                 cylinderId: "507f1f77bcf86cd799439051",
//                 newSize: "15kg"
//               }
//             }
//           }
//         },
//         responses: {
//           200: {
//             description: "Refill request submitted",
//             content: {
//               "application/json": {
//                 schema: {
//                   $ref: "#/components/schemas/OrderResponse"
//                 }
//               }
//             }
//           }
//         }
//       }
//     },
//     "/seller/locations": {
//       post: {
//         tags: ["Seller"],
//         summary: "Add new location",
//         security: [{ "BearerAuth": [] }],
//         requestBody: {
//           required: true,
//           content: {
//             "application/json": {
//               schema: {
//                 $ref: "#/components/schemas/AddLocationRequest"
//               },
//               example: {
//                 warehouseName: "Main Warehouse",
//                 city: "Islamabad",
//                 address: "Sector F-7, Islamabad",
//                 location: {
//                   coordinates: [73.0479, 33.6844]
//                 }
//               }
//             }
//           }
//         },
//         responses: {
//           201: {
//             description: "Location added successfully",
//             content: {
//               "application/json": {
//                 schema: {
//                   $ref: "#/components/schemas/LocationResponse"
//                 },
//                 example: {
//                   success: true,
//                   message: "Location added successfully",
//                   location: {
//                     _id: "507f1f77bcf86cd799439031",
//                     warehouseName: "Main Warehouse",
//                     city: "Islamabad",
//                     address: "Sector F-7, Islamabad",
//                     location: {
//                       type: "Point",
//                       coordinates: [73.0479, 33.6844]
//                     },
//                     isActive: true,
//                     createdAt: "2024-10-20T10:30:00.000Z"
//                   }
//                 }
//               }
//             }
//           }
//         }
//       },
//       get: {
//         tags: ["Seller"],
//         summary: "Get seller's locations",
//         security: [{ "BearerAuth": [] }],
//         responses: {
//           200: {
//             description: "Locations retrieved successfully",
//             content: {
//               "application/json": {
//                 schema: {
//                   $ref: "#/components/schemas/LocationListResponse"
//                 }
//               }
//             }
//           }
//         }
//       }
//     },
//     "/seller/inventory": {
//       post: {
//         tags: ["Seller"],
//         summary: "Add or update inventory",
//         security: [{ "BearerAuth": [] }],
//         requestBody: {
//           required: true,
//           content: {
//             "application/json": {
//               schema: {
//                 $ref: "#/components/schemas/InventoryRequest"
//               },
//               example: {
//                 location: "507f1f77bcf86cd799439031",
//                 city: "Islamabad",
//                 pricePerKg: 250,
//                 cylinders: {
//                   "15kg": { quantity: 100, price: 3750 },
//                   "11.8kg": { quantity: 50, price: 2950 },
//                   "6kg": { quantity: 75, price: 1500 },
//                   "4.5kg": { quantity: 30, price: 1125 }
//                 },
//                 addOns: [
//                   {
//                     title: "Gas Pipe",
//                     price: 500,
//                     description: "High quality gas pipe",
//                     discount: 10,
//                     quantity: 200
//                   }
//                 ]
//               }
//             }
//           }
//         },
//         responses: {
//           200: {
//             description: "Inventory updated successfully",
//             content: {
//               "application/json": {
//                 schema: {
//                   $ref: "#/components/schemas/InventoryResponse"
//                 }
//               }
//             }
//           }
//         }
//       },
//       get: {
//         tags: ["Seller"],
//         summary: "Get seller's inventory",
//         security: [{ "BearerAuth": [] }],
//         parameters: [
//           {
//             name: "city",
//             in: "query",
//             schema: { type: "string" }
//           },
//           {
//             name: "location",
//             in: "query",
//             schema: { type: "string" }
//           }
//         ],
//         responses: {
//           200: {
//             description: "Inventory retrieved successfully",
//             content: {
//               "application/json": {
//                 schema: {
//                   $ref: "#/components/schemas/InventoryListResponse"
//                 }
//               }
//             }
//           }
//         }
//       }
//     },
//     "/seller/dashboard/stats": {
//       get: {
//         tags: ["Seller"],
//         summary: "Get seller dashboard statistics",
//         security: [{ "BearerAuth": [] }],
//         responses: {
//           200: {
//             description: "Dashboard stats retrieved",
//             content: {
//               "application/json": {
//                 schema: {
//                   $ref: "#/components/schemas/SellerDashboardResponse"
//                 },
//                 example: {
//                   success: true,
//                   stats: {
//                     totalInventory: 255,
//                     issuedCylinders: 50,
//                     newOrders: 10,
//                     inProcessOrders: 5,
//                     completedOrders: 150,
//                     returnRequests: 2,
//                     refillRequests: 8,
//                     emptyCylinders: 3,
//                     revenue: {
//                       today: 15000,
//                       thisWeek: 75000,
//                       thisMonth: 300000
//                     }
//                   }
//                 }
//               }
//             }
//           }
//         }
//       }
//     },


//     "/seller/generate-test-data":{
//        Post: {
//         tags: ["Seller"],
//         summary: "Add all data to sellers",
//         security: [{ "BearerAuth": [] }],
//         responses: {
//           200: {
//             description: "Dashboard stats retrieved",
//             content: {
//               "application/json": {
//                 schema: {
//                   $ref: "#/components/schemas/SellerDashboardResponse"
//                 },
//                 example: {
//                   success: true,
//                   stats: {
//                     totalInventory: 255,
//                     issuedCylinders: 50,
//                     newOrders: 10,
//                     inProcessOrders: 5,
//                     completedOrders: 150,
//                     returnRequests: 2,
//                     refillRequests: 8,
//                     emptyCylinders: 3,
//                     revenue: {
//                       today: 15000,
//                       thisWeek: 75000,
//                       thisMonth: 300000
//                     }
//                   }
//                 }
//               }
//             }
//           }
//         }
//       }
//     },
//     "/driver/orders": {
//       get: {
//         tags: ["Driver"],
//         summary: "Get assigned orders",
//         security: [{ "BearerAuth": [] }],
//         parameters: [
//           {
//             name: "status",
//             in: "query",
//             schema: {
//               type: "string",
//               enum: ["assigned", "in_transit", "delivered"]
//             }
//           },
//           {
//             name: "page",
//             in: "query",
//             schema: { 
//               type: "integer", 
//               default: 1 
//             }
//           },
//           {
//             name: "limit",
//             in: "query",
//             schema: { 
//               type: "integer", 
//               default: 20 
//             }
//           }
//         ],
//         responses: {
//           200: {
//             description: "Orders retrieved successfully",
//             content: {
//               "application/json": {
//                 schema: {
//                   $ref: "#/components/schemas/DriverOrderListResponse"
//                 }
//               }
//             }
//           }
//         }
//       }
//     },
//     "/driver/orders/{orderId}/accept": {
//       post: {
//         tags: ["Driver"],
//         summary: "Accept and verify order",
//         security: [{ "BearerAuth": [] }],
//         parameters: [
//           {
//             name: "orderId",
//             in: "path",
//             required: true,
//             schema: { type: "string" }
//           }
//         ],
//         requestBody: {
//           required: true,
//           content: {
//             "application/json": {
//               schema: {
//                 $ref: "#/components/schemas/AcceptOrderRequest"
//               },
//               example: {
//                 cylinderPhoto: "base64_encoded_image_data",
//                 tareWeight: 14.5,
//                 netWeight: 15,
//                 grossWeight: 29.5,
//                 serialNumber: "CYL-123456",
//                 weightDifference: 0.5
//               }
//             }
//           }
//         },
//         responses: {
//           200: {
//             description: "Order accepted successfully",
//             content: {
//               "application/json": {
//                 schema: {
//                   $ref: "#/components/schemas/OrderResponse"
//                 }
//               }
//             }
//           }
//         }
//       }
//     },
//     "/driver/orders/{orderId}/generate-qr": {
//       post: {
//         tags: ["Driver"],
//         summary: "Generate QR code for order",
//         security: [{ "BearerAuth": [] }],
//         parameters: [
//           {
//             name: "orderId",
//             in: "path",
//             required: true,
//             schema: { type: "string" }
//           }
//         ],
//         responses: {
//           200: {
//             description: "QR code generated successfully",
//             content: {
//               "application/json": {
//                 schema: {
//                   $ref: "#/components/schemas/QRCodeResponse"
//                 },
//                 example: {
//                   success: true,
//                   message: "QR code generated successfully",
//                   qrCode: "LPG-ORD-1698765432109-1-123456789",
//                   qrCodeUrl: "https://storage.googleapis.com/.../qr-code.png",
//                   qrCodeDataURL: "data:image/png;base64,..."
//                 }
//               }
//             }
//           }
//         }
//       }
//     },
//     "/admin/dashboard/stats": {
//       get: {
//         tags: ["Admin"],
//         summary: "Get admin dashboard statistics",
//         security: [{ "BearerAuth": [] }],
//         responses: {
//           200: {
//             description: "Dashboard stats retrieved",
//             content: {
//               "application/json": {
//                 schema: {
//                   $ref: "#/components/schemas/AdminDashboardResponse"
//                 },
//                 example: {
//                   success: true,
//                   stats: {
//                     totalSellers: 50,
//                     activeSellers: 45,
//                     pendingSellers: 5,
//                     totalDrivers: 100,
//                     activeDrivers: 85,
//                     totalBuyers: 5000,
//                     totalOrders: 15000,
//                     ordersToday: 150,
//                     revenue: { total: 12000000 },
//                     ordersByStatus: {
//                       pending: 20,
//                       in_transit: 50,
//                       delivered: 80,
//                       completed: 14850
//                     }
//                   },
//                   recentOrders: []
//                 }
//               }
//             }
//           }
//         }
//       }
//     },
//     "/admin/sellers": {
//       get: {
//         tags: ["Admin"],
//         summary: "Get sellers list with filters",
//         security: [{ "BearerAuth": [] }],
//         parameters: [
//           {
//             name: "status",
//             in: "query",
//             schema: {
//               type: "string",
//               enum: ["pending", "approved", "rejected"]
//             }
//           },
//           {
//             name: "search",
//             in: "query",
//             schema: { type: "string" }
//           },
//           {
//             name: "page",
//             in: "query",
//             schema: { 
//               type: "integer", 
//               default: 1 
//             }
//           },
//           {
//             name: "limit",
//             in: "query",
//             schema: { 
//               type: "integer", 
//               default: 20 
//             }
//           }
//         ],
//         responses: {
//           200: {
//             description: "Sellers list retrieved",
//             content: {
//               "application/json": {
//                 schema: {
//                   $ref: "#/components/schemas/SellerListResponse"
//                 }
//               }
//             }
//           }
//         }
//       }
//     },
//     "/admin/sellers/{sellerId}/status": {
//       patch: {
//         tags: ["Admin"],
//         summary: "Approve or reject seller",
//         security: [{ "BearerAuth": [] }],
//         parameters: [
//           {
//             name: "sellerId",
//             in: "path",
//             required: true,
//             schema: { type: "string" }
//           }
//         ],
//         requestBody: {
//           required: true,
//           content: {
//             "application/json": {
//               schema: {
//                 $ref: "#/components/schemas/UpdateSellerStatusRequest"
//               },
//               example: {
//                 status: "approved",
//                 notes: "All documents verified successfully"
//               }
//             }
//           }
//         },
//         responses: {
//           200: {
//             description: "Seller status updated successfully",
//             content: {
//               "application/json": {
//                 schema: {
//                   $ref: "#/components/schemas/SellerResponse"
//                 }
//               }
//             }
//           }
//         }
//       }
//     },
//     "/health": {
//       get: {
//         tags: ["Public"],
//         summary: "Health check endpoint",
//         responses: {
//           200: {
//             description: "Service is healthy",
//             content: {
//               "application/json": {
//                 schema: {
//                   type: "object",
//                   properties: {
//                     status: { type: "string" },
//                     timestamp: { type: "string" },
//                     environment: { type: "string" },
//                     version: { type: "string" }
//                   }
//                 },
//                 example: {
//                   status: "OK",
//                   timestamp: "2024-10-20T10:30:00.000Z",
//                   environment: "development",
//                   version: "1.0.0"
//                 }
//               }
//             }
//           }
//         }
//       }
//     }
//   },
//   components: {
//     schemas: {
//       RegisterBuyerRequest: {
//         type: "object",
//         required: ["phoneNumber", "password", "fullName", "userType"],
//         properties: {
//           phoneNumber: {
//             type: "string",
//             example: "+923001234567",
//             pattern: "^(\\+92|0)?3[0-9]{9}$"
//           },
//           email: {
//             type: "string",
//             format: "email",
//             example: "buyer@example.com"
//           },
//           password: {
//             type: "string",
//             minLength: 8,
//             example: "password123"
//           },
//           fullName: {
//             type: "string",
//             example: "John Doe"
//           },
//           cnic: {
//             type: "string",
//             pattern: "^[0-9]{5}-[0-9]{7}-[0-9]$",
//             example: "12345-1234567-1"
//           },
//           userType: {
//             type: "string",
//             enum: ["domestic", "commercial"]
//           },
//           language: {
//             type: "string",
//             enum: ["english", "urdu", "pashto"],
//             default: "english"
//           }
//         }
//       },
//       RegisterSellerRequest: {
//         type: "object",
//         required: ["businessName", "phoneNumber", "email", "orgaLicenseNumber", "orgaExpDate", "ntnNumber", "password"],
//         properties: {
//           businessName: { type: "string", example: "ABC Gas Company" },
//           phoneNumber: { type: "string", example: "+923001234567" },
//           email: { type: "string", format: "email" },
//           orgaLicenseNumber: { type: "string", example: "ORGA-12345" },
//           orgaExpDate: { type: "string", format: "date", example: "2026-12-31" },
//           ntnNumber: { type: "string", example: "NTN-123456" },
//           password: { type: "string", minLength: 8 }
//         }
//       },
//       VerifyOTPRequest: {
//         type: "object",
//         required: ["phoneNumber", "otp"],
//         properties: {
//           phoneNumber: { type: "string" },
//           otp: { type: "string", pattern: "^[0-9]{6}$" }
//         }
//       },
//       LoginRequest: {
//         type: "object",
//         required: ["phoneNumber", "password"],
//         properties: {
//           phoneNumber: { type: "string" },
//           password: { type: "string" }
//         }
//       },
//       OTPResponse: {
//         type: "object",
//         properties: {
//           success: { type: "boolean" },
//           message: { type: "string" },
//           userId: { type: "string" },
//           otp: { type: "string" }
//         }
//       },
//       AuthSuccessResponse: {
//         type: "object",
//         properties: {
//           success: { type: "boolean" },
//           message: { type: "string" },
//           accessToken: { type: "string" },
//           refreshToken: { type: "string" },
//           user: { $ref: "#/components/schemas/UserResponse" }
//         }
//       },
//       UserResponse: {
//         type: "object",
//         properties: {
//           _id: { type: "string" },
//           role: { type: "string", enum: ["admin", "seller", "driver", "buyer"] },
//           phoneNumber: { type: "string" },
//           email: { type: "string" },
//           fullName: { type: "string" },
//           isVerified: { type: "boolean" },
//           sellerStatus: { type: "string", enum: ["pending", "approved", "rejected"] },
//           businessName: { type: "string" }
//         }
//       },
//       NearbySellersResponse: {
//         type: "object",
//         properties: {
//           success: { type: "boolean" },
//           sellers: {
//             type: "array",
//             items: {
//               $ref: "#/components/schemas/SellerResponse"
//             }
//           }
//         }
//       },
//       SellerResponse: {
//         type: "object",
//         properties: {
//           _id: { type: "string" },
//           businessName: { type: "string" },
//           rating: { $ref: "#/components/schemas/Rating" },
//           distance: { type: "number" },
//           locations: {
//             type: "array",
//             items: { $ref: "#/components/schemas/LocationResponse" }
//           },
//           inventory: { $ref: "#/components/schemas/InventoryResponse" }
//         }
//       },
//       Rating: {
//         type: "object",
//         properties: {
//           average: { type: "number", minimum: 0, maximum: 5 },
//           count: { type: "integer" }
//         }
//       },
//       LocationResponse: {
//         type: "object",
//         properties: {
//           _id: { type: "string" },
//           warehouseName: { type: "string" },
//           city: { type: "string" },
//           address: { type: "string" },
//           location: { $ref: "#/components/schemas/GeoJSONPoint" },
//           isActive: { type: "boolean" },
//           createdAt: { type: "string", format: "date-time" }
//         }
//       },
//       GeoJSONPoint: {
//         type: "object",
//         required: ["type", "coordinates"],
//         properties: {
//           type: { type: "string", enum: ["Point"] },
//           coordinates: {
//             type: "array",
//             items: { type: "number" },
//             minItems: 2,
//             maxItems: 2
//           }
//         }
//       },
//       InventoryResponse: {
//         type: "object",
//         properties: {
//           _id: { type: "string" },
//           seller: { type: "string" },
//           location: { $ref: "#/components/schemas/LocationResponse" },
//           city: { type: "string" },
//           pricePerKg: { type: "number" },
//           cylinders: { $ref: "#/components/schemas/CylinderInventory" },
//           addOns: {
//             type: "array",
//             items: { $ref: "#/components/schemas/AddOn" }
//           },
//           totalInventory: { type: "integer" },
//           issuedCylinders: { type: "integer" },
//           isActive: { type: "boolean" }
//         }
//       },
//       CylinderInventory: {
//         type: "object",
//         properties: {
//           "15kg": { $ref: "#/components/schemas/CylinderSize" },
//           "11.8kg": { $ref: "#/components/schemas/CylinderSize" },
//           "6kg": { $ref: "#/components/schemas/CylinderSize" },
//           "4.5kg": { $ref: "#/components/schemas/CylinderSize" }
//         }
//       },
//       CylinderSize: {
//         type: "object",
//         properties: {
//           quantity: { type: "integer", minimum: 0 },
//           price: { type: "number", minimum: 0 }
//         }
//       },
//       AddOn: {
//         type: "object",
//         properties: {
//           title: { type: "string" },
//           price: { type: "number" },
//           description: { type: "string" },
//           discount: { type: "number", minimum: 0, maximum: 100 },
//           quantity: { type: "integer", minimum: 0 }
//         }
//       },
//       CreateOrderRequest: {
//         type: "object",
//         required: ["seller", "orderType", "cylinderSize", "quantity", "deliveryLocation", "payment"],
//         properties: {
//           seller: { type: "string" },
//           orderType: {
//             type: "string",
//             enum: ["new", "refill", "return", "supplier_change"]
//           },
//           cylinderSize: {
//             type: "string",
//             enum: ["15kg", "11.8kg", "6kg", "4.5kg"]
//           },
//           quantity: { type: "integer", minimum: 1 },
//           deliveryLocation: { $ref: "#/components/schemas/DeliveryLocation" },
//           addOns: {
//             type: "array",
//             items: { $ref: "#/components/schemas/OrderAddOn" }
//           },
//           isUrgent: { type: "boolean", default: false },
//           payment: { $ref: "#/components/schemas/PaymentMethod" }
//         }
//       },
//       DeliveryLocation: {
//         type: "object",
//         required: ["address", "location"],
//         properties: {
//           address: { type: "string" },
//           location: { $ref: "#/components/schemas/GeoJSONPoint" }
//         }
//       },
//       OrderAddOn: {
//         type: "object",
//         required: ["title", "price", "quantity"],
//         properties: {
//           title: { type: "string" },
//           price: { type: "number" },
//           quantity: { type: "integer", minimum: 1 }
//         }
//       },
//       PaymentMethod: {
//         type: "object",
//         required: ["method"],
//         properties: {
//           method: {
//             type: "string",
//             enum: ["jazzcash", "easypaisa", "debit_card", "credit_card", "cod"]
//           }
//         }
//       },
//       OrderResponse: {
//         type: "object",
//         properties: {
//           success: { type: "boolean" },
//           message: { type: "string" },
//           order: { $ref: "#/components/schemas/Order" },
//           payment: { $ref: "#/components/schemas/PaymentResult" }
//         }
//       },
//       Order: {
//         type: "object",
//         properties: {
//           _id: { type: "string" },
//           orderId: { type: "string" },
//           buyer: { $ref: "#/components/schemas/UserResponse" },
//           seller: { $ref: "#/components/schemas/SellerResponse" },
//           driver: { $ref: "#/components/schemas/DriverResponse" },
//           orderType: { type: "string" },
//           cylinderSize: { type: "string" },
//           quantity: { type: "integer" },
//           pricing: { $ref: "#/components/schemas/OrderPricing" },
//           status: { type: "string" },
//           statusHistory: {
//             type: "array",
//             items: { $ref: "#/components/schemas/StatusHistory" }
//           },
//           qrCode: { type: "string" },
//           payment: { $ref: "#/components/schemas/PaymentInfo" },
//           deliveryLocation: { $ref: "#/components/schemas/DeliveryLocation" },
//           createdAt: { type: "string", format: "date-time" }
//         }
//       },
//       DriverResponse: {
//         type: "object",
//         properties: {
//           _id: { type: "string" },
//           fullName: { type: "string" },
//           phoneNumber: { type: "string" },
//           vehicleNumber: { type: "string" },
//           zone: { type: "string" },
//           driverStatus: { type: "string" },
//           currentLocation: { $ref: "#/components/schemas/GeoJSONPoint" }
//         }
//       },
//       OrderPricing: {
//         type: "object",
//         properties: {
//           cylinderPrice: { type: "number" },
//           securityCharges: { type: "number" },
//           deliveryCharges: { type: "number" },
//           urgentDeliveryFee: { type: "number" },
//           addOnsTotal: { type: "number" },
//           subtotal: { type: "number" },
//           grandTotal: { type: "number" }
//         }
//       },
//       StatusHistory: {
//         type: "object",
//         properties: {
//           status: { type: "string" },
//           timestamp: { type: "string", format: "date-time" },
//           updatedBy: { type: "string" },
//           notes: { type: "string" }
//         }
//       },
//       PaymentInfo: {
//         type: "object",
//         properties: {
//           method: { type: "string" },
//           status: { type: "string", enum: ["pending", "completed", "failed", "refunded"] },
//           transactionId: { type: "string" },
//           paidAt: { type: "string", format: "date-time" }
//         }
//       },
//       PaymentResult: {
//         type: "object",
//         properties: {
//           success: { type: "boolean" },
//           transactionId: { type: "string" },
//           paymentUrl: { type: "string" },
//           message: { type: "string" }
//         }
//       },
//       OrderListResponse: {
//         type: "object",
//         properties: {
//           success: { type: "boolean" },
//           orders: {
//             type: "array",
//             items: { $ref: "#/components/schemas/Order" }
//           },
//           pagination: { $ref: "#/components/schemas/Pagination" }
//         }
//       },
//       Pagination: {
//         type: "object",
//         properties: {
//           currentPage: { type: "integer" },
//           totalPages: { type: "integer" },
//           totalOrders: { type: "integer" },
//           hasNext: { type: "boolean" }
//         }
//       },
//       RefillRequest: {
//         type: "object",
//         required: ["cylinderId"],
//         properties: {
//           cylinderId: { type: "string" },
//           newSize: {
//             type: "string",
//             enum: ["15kg", "11.8kg", "6kg", "4.5kg"]
//           }
//         }
//       },
//       AddLocationRequest: {
//         type: "object",
//         required: ["warehouseName", "city", "address", "location"],
//         properties: {
//           warehouseName: { type: "string" },
//           city: { type: "string" },
//           address: { type: "string" },
//           location: { $ref: "#/components/schemas/GeoJSONPoint" }
//         }
//       },
//       LocationListResponse: {
//         type: "object",
//         properties: {
//           success: { type: "boolean" },
//           message: { type: "string" },
//           locations: {
//             type: "array",
//             items: { $ref: "#/components/schemas/LocationResponse" }
//           }
//         }
//       },
//       InventoryRequest: {
//         type: "object",
//         required: ["location", "city", "pricePerKg", "cylinders"],
//         properties: {
//           location: { type: "string" },
//           city: { type: "string" },
//           pricePerKg: { type: "number" },
//           cylinders: { $ref: "#/components/schemas/CylinderInventory" },
//           addOns: {
//             type: "array",
//             items: { $ref: "#/components/schemas/AddOn" }
//           }
//         }
//       },
//       InventoryListResponse: {
//         type: "object",
//         properties: {
//           success: { type: "boolean" },
//           inventories: {
//             type: "array",
//             items: { $ref: "#/components/schemas/InventoryResponse" }
//           }
//         }
//       },
//       SellerDashboardResponse: {
//         type: "object",
//         properties: {
//           success: { type: "boolean" },
//           stats: {
//             type: "object",
//             properties: {
//               totalInventory: { type: "integer" },
//               issuedCylinders: { type: "integer" },
//               newOrders: { type: "integer" },
//               inProcessOrders: { type: "integer" },
//               completedOrders: { type: "integer" },
//               returnRequests: { type: "integer" },
//               refillRequests: { type: "integer" },
//               emptyCylinders: { type: "integer" },
//               revenue: { $ref: "#/components/schemas/RevenueStats" }
//             }
//           }
//         }
//       },
//       RevenueStats: {
//         type: "object",
//         properties: {
//           today: { type: "number" },
//           thisWeek: { type: "number" },
//           thisMonth: { type: "number" }
//         }
//       },
//       DriverOrderListResponse: {
//         type: "object",
//         properties: {
//           success: { type: "boolean" },
//           orders: {
//             type: "array",
//             items: { $ref: "#/components/schemas/Order" }
//           },
//           pagination: { $ref: "#/components/schemas/Pagination" }
//         }
//       },
//       AcceptOrderRequest: {
//         type: "object",
//         required: ["tareWeight", "netWeight", "grossWeight", "serialNumber", "weightDifference"],
//         properties: {
//           cylinderPhoto: { type: "string" },
//           tareWeight: { type: "number" },
//           netWeight: { type: "number" },
//           grossWeight: { type: "number" },
//           serialNumber: { type: "string" },
//           weightDifference: { type: "number" }
//         }
//       },
//       QRCodeResponse: {
//         type: "object",
//         properties: {
//           success: { type: "boolean" },
//           message: { type: "string" },
//           qrCode: { type: "string" },
//           qrCodeUrl: { type: "string" },
//           qrCodeDataURL: { type: "string" }
//         }
//       },
//       AdminDashboardResponse: {
//         type: "object",
//         properties: {
//           success: { type: "boolean" },
//           stats: {
//             type: "object",
//             properties: {
//               totalSellers: { type: "integer" },
//               activeSellers: { type: "integer" },
//               pendingSellers: { type: "integer" },
//               totalDrivers: { type: "integer" },
//               activeDrivers: { type: "integer" },
//               totalBuyers: { type: "integer" },
//               totalOrders: { type: "integer" },
//               ordersToday: { type: "integer" },
//               revenue: { $ref: "#/components/schemas/AdminRevenueStats" },
//               ordersByStatus: { type: "object" }
//             }
//           },
//           recentOrders: {
//             type: "array",
//             items: { $ref: "#/components/schemas/Order" }
//           }
//         }
//       },
//       AdminRevenueStats: {
//         type: "object",
//         properties: {
//           total: { type: "number" }
//         }
//       },
//       SellerListResponse: {
//         type: "object",
//         properties: {
//           success: { type: "boolean" },
//           sellers: {
//             type: "array",
//             items: { $ref: "#/components/schemas/SellerResponse" }
//           },
//           pagination: { $ref: "#/components/schemas/Pagination" }
//         }
//       },
//       UpdateSellerStatusRequest: {
//         type: "object",
//         required: ["status"],
//         properties: {
//           status: {
//             type: "string",
//             enum: ["approved", "rejected"]
//           },
//           notes: { type: "string" }
//         }
//       },
//       ErrorResponse: {
//         type: "object",
//         properties: {
//           success: { type: "boolean", default: false },
//           message: { type: "string" },
//           errors: {
//             type: "array",
//             items: {
//               type: "object",
//               properties: {
//                 field: { type: "string" },
//                 message: { type: "string" }
//               }
//             }
//           },
//           stack: { type: "string" }
//         }
//       }
//     },
//     securitySchemes: {
//       BearerAuth: {
//         type: "http",
//         scheme: "bearer",
//         bearerFormat: "JWT",
//         description: "Enter JWT token in the format: Bearer <token>"
//       }
//     }
//   }
// };

// module.exports = swaggerDocument;