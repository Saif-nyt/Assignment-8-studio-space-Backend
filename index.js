import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import "dotenv/config";

const app = express();
const port = process.env.PORT || 5001;

app.use(
  cors({
    origin: "http://localhost:3000",
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
app.delete("/my-booking/:id", async (req, res) => {
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


app.delete("/delete-studio/:id", async (req, res) => {
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


app.get("/studios/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const studio = await studiosCollection.findOne({ _id: new ObjectId(id) });
    res.send(studio);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Error fetching studio" });
  }
});
app.get("/my-bookings/:email", async (req, res) => {
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


app.put("/studios/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid studio ID" });
    }

    const existingStudio = await studiosCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!existingStudio) {
      return res.status(404).send({ message: "Studio not found" });
    }

    // Basic ownership check. Add proper backend authentication
    // before deploying this API publicly.
    const ownerEmail = (updates.ownerEmail || "").trim().toLowerCase();
    const existingOwnerEmail = (existingStudio.ownerEmail || "")
      .trim()
      .toLowerCase();

    if (!ownerEmail || ownerEmail !== existingOwnerEmail) {
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
      if (updates[field] !== undefined) {
        safeUpdates[field] = updates[field];
      }
    }

    safeUpdates.updatedAt = new Date();

    const result = await studiosCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: safeUpdates },
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({ message: "Studio not found" });
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
    res.status(500).send({ message: "Failed to update studio" });
  }
});



app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
