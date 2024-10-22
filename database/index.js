const mongoose = require("mongoose");
require("dotenv").config();

mongoose.connect(
  "mongodb+srv://Ketan281:lqEgwZRLYPNHWRb1@cluster0.ux6oa.mongodb.net/mydatabase?retryWrites=true&w=majority",
  {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  }
);

const conn = mongoose.connection;

conn.on("connected", () => {
  console.log("Database connected successfully!");
});

conn.on("disconnected", () => {
  console.log("Database disconnected!");
});

conn.on("error", (err) =>
  console.error(err, "<<-- Error in database connection!")
);

module.exports = conn;
