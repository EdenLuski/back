const mongoose = require("mongoose");

const codeBlockSchema = new mongoose.Schema({
  _id:{type:Number,require:true},
  name: { type: String, require: true },
  code: { type: String, default: "// Write code here" },
  solution: { type: String, require: true },
  users: { type: Number, default: 0 },
  mentor: { type: String, default: null },
});

module.exports = mongoose.model("CodeBlock", codeBlockSchema);
