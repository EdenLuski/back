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

const initialCodeBlocks = [
  { _id: 1, name: "Async case", solution: "....code..." },
  { _id: 2, name: "Promises", solution: "....code..." },
  { _id: 3, name: "Callbacks", solution: "....code..." },
  { _id: 4, name: "Event Loop", solution: "....code..." },
];

const initializeDB = async () => {
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
  socket.on("join", async ({ codeBlockId, isMentor }) => {
    let block = await CodeBlock.findById(codeBlockId);
    if (!codeBlockId) {
      console.error("codeBLockId is undined");
    }

    if (!block) {
      block = new CodeBlock({
        _id: codeBlockId,
        name: `Block ${codeBlockId}`,
        solution: "....code.....",
      });
      await block.save();
    }

    if (block.mentor === null && isMentor) {
      block.mentor = socket.id;
      block.users += 1;
      await block.save();
      socket.emit("init", {
        initialCode: block.code,
        role: "mentor",
        students: block.users,
      });
      socket.join(codeBlockId);
    } else if (block.mentor !== null && !isMentor) {
      block.users += 1;
      await block.save();
      socket.emit("init", {
        initialCode: block.code,
        role: "student",
        students: block.users,
      });
      socket.join(codeBlockId);
    } else {
      socket.emit("error", "Mentor must join first");
    }

    io.to(codeBlockId).emit("studentsCount", block.users);
  });

  socket.on("codeChange", async ({ codeBlockId, newCode }) => {
    let block = await CodeBlock.findById(codeBlockId);
    if (block) {
      block.code = newCode;
      await block.save();
      io.to(codeBlockId).emit("codeUpdate", newCode);
    }
  });

  socket.on("solutionChange", async ({ codeBlockId, newSolution }) => {
    let block = await CodeBlock.findById(codeBlockId);
    if (block) {
      block.solution = newSolution;
      await block.save();
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
      io.to(codeBlockId).emit("studentsCount", block.users);
    } else {
      console.error(`CodeBLock with ID ${codeBlockId} no found`);
    }
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });
});

server.listen(3001, () => {
  console.log("Server is running on port 3001");
});
