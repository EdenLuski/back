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
    origin: "https://tom-class.netlify.app",
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

    let block = await CodeBlock.findOneAndUpdate(
      { _id: codeBlockId },
      {
        $addToSet: { users: socket.id },
        $setOnInsert: { mentor: socket.id, code: "// Write code here" },
      },
      { new: true, upsert: true }
    );

    // Check if there's no mentor in the room, and set the current user as the mentor
    if (!block.mentor) {
      block.mentor = socket.id;
    }

    socket.join(codeBlockId);

    console.log("User joined", {
      codeBlockId,
      socketId: socket.id,
      role: block.mentor === socket.id ? "mentor" : "student",
    });

    // Count the number of students only
    const studentCount = block.users.filter(
      (userId) => userId !== block.mentor
    ).length;

    if (block.mentor !== socket.id) {
      socket.emit("init", {
        initialCode: block.code,
        solution: block.solution,
        role: block.mentor === socket.id ? "mentor" : "student",
        students: studentCount,
      });
    } else {
      // If the user is the mentor, don't send the "reset" event
      socket.emit("init", {
        initialCode: block.code,
        solution: block.solution,
        role: "mentor",
        students: studentCount,
      });
    }

    io.to(codeBlockId).emit("studentsCount", studentCount);
  });

  socket.on("codeChange", async ({ codeBlockId, newCode }) => {
    let block = await CodeBlock.findByIdAndUpdate(
      codeBlockId,
      { $set: { code: newCode } },
      { new: true }
    );
    if (block) {
      console.log("Code changed", { codeBlockId, newCode });
      io.to(codeBlockId).emit("codeUpdate", newCode);
    }
  });

  socket.on("solutionChange", async ({ codeBlockId, newSolution }) => {
    let block = await CodeBlock.findByIdAndUpdate(
      codeBlockId,
      { $set: { solution: newSolution } },
      { new: true }
    );
    if (block) {
      console.log("Solution changed", { codeBlockId, newSolution });
      io.to(codeBlockId).emit("solutionUpdate", newSolution);
    }
  });

  socket.on("leave", async ({ codeBlockId }) => {
    let block = await CodeBlock.findByIdAndUpdate(
      codeBlockId,
      { $pull: { users: socket.id } },
      { new: true }
    );
    if (block) {
      if (block.mentor === socket.id) {
        // Choose another user as the mentor, if available
        block.mentor = block.users[0] || null;
        block.users = []; // Reset users count when mentor leaves
        block.code = "// Write your code here"; // Reset code when mentor leaves
        await block.save();
        io.to(codeBlockId).emit("reset"); // Notify students to leave and reset
        io.to(codeBlockId).socketsLeave(codeBlockId); // Disconnect all users in the room
      } else {
        // Count the number of students only
        const studentCount = block.users.filter(
          (userId) => userId !== block.mentor
        ).length;
        await block.save();
        io.to(codeBlockId).emit("studentsCount", studentCount);
      }
    } else {
      console.error(`CodeBlock with ID ${codeBlockId} not found`);
    }
  });

  socket.on("disconnect", async () => {
    console.log("Client disconnected", socket.id);
    const codeBlocks = await CodeBlock.find();
    for (const block of codeBlocks) {
      if (block.mentor === socket.id) {
        // Choose another user as the mentor, if available
        block.mentor = block.users[0] || null;
        block.users = []; // Reset users count when mentor disconnects
        block.code = "// Write your code here"; // Reset code when mentor disconnects
        await block.save();
        io.to(block._id).emit("reset"); // Notify students to leave and reset
        io.to(block._id).socketsLeave(block._id); // Disconnect all users in the room
      } else {
        block.users = block.users.filter((userId) => userId !== socket.id);
        await block.save();
        // Count the number of students only
        const studentCount = block.users.filter(
          (userId) => userId !== block.mentor
        ).length;
        io.to(block._id).emit("studentsCount", studentCount);
      }
    }
  });
});

server.listen(3001, () => {
  console.log("Server is running on port 3001");
});
