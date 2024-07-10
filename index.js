const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const connectDB = require("./db");
const CodeBlock = require("./models/codeBlock");
const cors = require("cors");
const codeBlockRoute = require("./routes/codeBlocks");

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api/codeblocks", codeBlockRoute);

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    allowedHeaders: ["my-custom-header"],
    credentials: true,
  },
});

connectDB();

const initializeDB = async () => {
  const initialCodeBlocks = [
    { _id: 1, name: "Async case", solution: "....code..." },
    { _id: 2, name: "Promises", solution: "....code..." },
    { _id: 3, name: "Callbacks", solution: "....code..." },
    { _id: 4, name: "Event Loop", solution: "....code..." },
  ];

  for (const block of initialCodeBlocks) {
    let existingBlock = await CodeBlock.findById(block._id);
    if (!existingBlock) {
      let newBlock = new CodeBlock(block);
      await newBlock.save();
    }
  }
};

initializeDB();

io.on("connection", (socket) => {
  socket.on("join", async ({ codeBlockId }) => {
    if (!codeBlockId) {
      console.error("codeBlockId is undefined");
      return;
    }

    let block = await CodeBlock.findById(codeBlockId);

    if (!block) {
      block = new CodeBlock({
        _id: codeBlockId,
        name: `Block ${codeBlockId}`,
        solution: "....code.....",
        mentor: socket.id,
        users: 1,
      });
      await block.save();
    } else if (block.mentor === null || block.mentor === "") {
      block.mentor = socket.id;
      block.users = 1;
      await block.save();
    } else {
      block.users += 1;
      await block.save();
    }

    socket.join(codeBlockId);

    console.log("User joined", {
      codeBlockId,
      socketId: socket.id,
      role: block.mentor === socket.id ? "mentor" : "student",
    });

    socket.emit("init", {
      initialCode: block.code,
      solution: block.solution,
      role: block.mentor === socket.id ? "mentor" : "student",
      students: block.users,
    });

    io.to(codeBlockId).emit("studentsCount", block.users);
  });

  socket.on("codeChange", async ({ codeBlockId, newCode }) => {
    let block = await CodeBlock.findById(codeBlockId);
    if (block) {
      block.code = newCode;
      await block.save();
      console.log("Code changed", { codeBlockId, newCode });
      io.to(codeBlockId).emit("codeUpdate", newCode);
    }
  });

  socket.on("solutionChange", async ({ codeBlockId, newSolution }) => {
    let block = await CodeBlock.findById(codeBlockId);
    if (block) {
      block.solution = newSolution;
      await block.save();
      console.log("Solution changed", { codeBlockId, newSolution });
      io.to(codeBlockId).emit("solutionUpdate", newSolution);
    }
  });

  socket.on("leave", async ({ codeBlockId }) => {
    let block = await CodeBlock.findById(codeBlockId);
    if (block) {
      block.users -= 1;
      if (block.mentor === socket.id) {
        block.mentor = null;
      }
      if (block.users === 0) {
        block.code = "// Write your code here";
      }
      await block.save();
      console.log("User left", { codeBlockId, socketId: socket.id });
      io.to(codeBlockId).emit("studentsCount", block.users);
    } else {
      console.error(`CodeBlock with ID ${codeBlockId} not found`);
    }
  });

  socket.on("disconnect", async () => {
    console.log("Client disconnected", socket.id);
    const codeBlocks = await CodeBlock.find();
    for (const block of codeBlocks) {
      if (block.mentor === socket.id) {
        block.mentor = null;
        block.users -= 1;
        if (block.users <= 0) {
          block.users = 0;
          block.code = "// Write your code here";
        }
        await block.save();
        io.to(block._id).emit("studentsCount", block.users);
      }
    }
  });
});

server.listen(3001, () => {
  console.log("Server is running on port 3001");
});
