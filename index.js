import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import "dotenv/config";
import { createRemoteJWKSet, jwtVerify } from "jose";

const app = express();
const port = process.env.PORT || 5001;

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  }),
);
app.use(express.json({ limit: "10mb" }));

const client = new MongoClient(process.env.MONGODB_URI);

async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
    throw err;
  }
}

const dbclient = await connectToMongoDB();
const db = dbclient.db("Studio-space");
const bookingsCollection = db.collection("bookings");
const studiosCollection = db.collection("studios");



const CLIENT_URL = process.env.CLIENT_URL.replace(/\/$/, "");

const JWKS = createRemoteJWKSet(new URL(`${CLIENT_URL}/api/auth/jwks`));

const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).send({
        message: "Authorization header missing",
      });
    }

    const [scheme, token] = authHeader.trim().split(/\s+/);

    if (scheme !== "Bearer" || !token) {
      return res.status(401).send({
        message: "Invalid authorization format",
      });
    }

    const { payload } = await jwtVerify(token, JWKS, {
      issuer: CLIENT_URL,
      audience: CLIENT_URL,
    });

    const userId = payload.id || payload.sub;

    if (typeof userId !== "string" || typeof payload.email !== "string") {
      return res.status(401).send({
        message: "Invalid user information",
      });
    }

    req.user = {
      id: userId,
      email: payload.email.trim().toLowerCase(),
      name: payload.name || payload.email,
    };

    next();
  } catch (error) {
    console.error("JWT verification error:", error.message);

    return res.status(401).send({
      message: "Invalid or expired token",
    });
  }
};




app.post("/add-studio", async (req, res) => {
  try {
    const studio = req.body;
    const result = await studiosCollection.insertOne(studio);
    res.status(201).send(result);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Error adding studio" });
  }
});

app.post("/bookings", async (req, res) => {
  try {
    const booking = req.body;
    const result = await bookingsCollection.insertOne(booking);
    res.status(201).send(result);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Error creating booking" });
  }
});

app.get("/studios", async (req, res) => {
  try {
    const studios = await studiosCollection.find().toArray();
    res.send(studios);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Error fetching studios" });
  }
});

// Get top 6 featured studios
app.get("/studios/featured", async (req, res) => {
  try {
    const featuredStudios = await studiosCollection
      .find({})
      .sort({ rating: -1 })
      .limit(6)
      .toArray();

    res.status(200).send(featuredStudios);
  } catch (error) {
    console.error("Featured studios API error:", error);

    res.status(500).send({
      message: "Failed to fetch featured studios.",
    });
  }
});
app.delete("/my-booking/:id", verifyToken, async (req, res) => {
  try {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid booking ID" });
    }

    const result = await bookingsCollection.deleteOne({
      _id: new ObjectId(id),
    });

    if (result.deletedCount === 0) {
      return res.status(404).send({ message: "Booking not found" });
    }

    res.status(200).send({ message: "Booking cancelled successfully" });
  } catch (err) {
    console.error("Error cancelling booking:", err);
    res.status(500).send({ message: "Error cancelling booking" });
  }
});


app.delete("/delete-studio/:id", verifyToken, async (req, res) => {
  try {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid studio ID" });
    }

    const result = await studiosCollection.deleteOne({
      _id: new ObjectId(id),
    });

    if (result.deletedCount === 0) {
      return res.status(404).send({ message: "Studio not found" });
    }

    res.status(200).send({ message: "Your Studio deleted successfully" });
  } catch (err) {
    console.error("Error deleting studio:", err);
    res.status(500).send({ message: "Error deleting studio" });
  }
});


app.get("/studios/:id",verifyToken, async (req, res) => {
  try {
    const id = req.params.id;
    const studio = await studiosCollection.findOne({ _id: new ObjectId(id) });
    res.send(studio);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Error fetching studio" });
  }
});
app.get("/my-bookings/:email", verifyToken, async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email);
    const bookings = await bookingsCollection.find({ email }).toArray();
    res.send(bookings);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Error fetching bookings" });
  }
});



app.get("/", (req, res) => {
  res.send("Hello World!");
});


app.put("/studios/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid studio ID",
      });
    }

    const ownerEmail = (req.user?.email || "").trim().toLowerCase();

    if (!ownerEmail) {
      return res.status(401).send({
        message: "User authentication information missing",
      });
    }

    const existingStudio = await studiosCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!existingStudio) {
      return res.status(404).send({
        message: "Studio not found",
      });
    }

    const existingOwnerEmail = (existingStudio.ownerEmail || "")
      .trim()
      .toLowerCase();

    if (ownerEmail !== existingOwnerEmail) {
      return res.status(403).send({
        message: "You are not allowed to edit this studio",
      });
    }

    const allowedFields = [
      "title",
      "category",
      "hourlyRate",
      "securityDeposit",
      "maxCapacity",
      "location",
      "image",
      "images",
      "amenities",
      "overview",
    ];

    const safeUpdates = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        safeUpdates[field] = req.body[field];
      }
    }

    if (Object.keys(safeUpdates).length === 0) {
      return res.status(400).send({
        message: "No valid fields provided for update",
      });
    }

    if (
      safeUpdates.hourlyRate !== undefined &&
      (!Number.isFinite(Number(safeUpdates.hourlyRate)) ||
        Number(safeUpdates.hourlyRate) < 0)
    ) {
      return res.status(400).send({
        message: "Invalid hourly rate",
      });
    }

    if (
      safeUpdates.securityDeposit !== undefined &&
      (!Number.isFinite(Number(safeUpdates.securityDeposit)) ||
        Number(safeUpdates.securityDeposit) < 0)
    ) {
      return res.status(400).send({
        message: "Invalid security deposit",
      });
    }

    if (
      safeUpdates.maxCapacity !== undefined &&
      (!Number.isInteger(Number(safeUpdates.maxCapacity)) ||
        Number(safeUpdates.maxCapacity) < 1)
    ) {
      return res.status(400).send({
        message: "Invalid maximum capacity",
      });
    }

    safeUpdates.updatedAt = new Date();

    const result = await studiosCollection.updateOne(
      {
        _id: new ObjectId(id),
        ownerEmail: existingStudio.ownerEmail,
      },
      {
        $set: safeUpdates,
      },
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({
        message: "Studio not found",
      });
    }

    const updatedStudio = await studiosCollection.findOne({
      _id: new ObjectId(id),
    });

    res.status(200).send({
      message: "Studio updated successfully",
      studio: updatedStudio,
    });
  } catch (error) {
    console.error("Update studio error:", error);

    res.status(500).send({
      message: "Failed to update studio",
    });
  }
});



app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
