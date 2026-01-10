const jwt = require("jsonwebtoken");

// User info
const userId = "694925273c77d9bc88af35eb";
const role = "admin";
const secretKey = "your_super_secret_jwt_key_change_in_production";
const expiresIn = "30d"; // token valid for 30 days

// Generate JWT
const token = jwt.sign(
    {
        userId,   // MongoDB _id
        role
    },
    secretKey,
    { expiresIn }
);

console.log("Your JWT token:\n", token);