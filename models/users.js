const mongoose = require("mongoose");

const Schema = mongoose.Schema;

const userModel = new Schema({
  name: {
    type: String,
  },
  email: {
    type: String,
  },
  password: {
    type: String,
  },
  apiKey: {
    type: String,
  },
  secret: {
    type: String,
  },
  createdAt: {
    type: Number,
    default: Date.now(),
  },
  updatedAt: {
    type: Number,
    default: Date.now(),
  },
  status: {
    type: Boolean,
    default: false,
  },
});

module.exports = mongoose.model("users", userModel);
