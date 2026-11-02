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

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
