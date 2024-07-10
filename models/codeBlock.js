const mongoose = require("mongoose");

const codeBlockSchema = new mongoose.Schema(
  {
    _id: { type: Number, required: true },
    name: { type: String, required: true },
    code: { type: String, default: "// Write code here" },
    solution: { type: String, required: true },
    users: { type: [String], default: [] },
    mentor: { type: String, default: null },
  },
  { versionKey: "__v" }
); // Add this line

module.exports = mongoose.model("CodeBlock", codeBlockSchema);
