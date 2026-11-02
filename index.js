import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import "dotenv/config";
import objectid from "mongodb";
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

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}

// Call this only when your application terminates

  const dbclient = await connectToMongoDB();
  const db = dbclient.db("Studio-space");
  const bookingsCollection = db.collection("bookings");
  console.log("You successfully connected to MongoDB!");

app.post('/add-studio', async (req, res) => {
    const studio = req.body;
    const result = await bookingsCollection.insertOne(studio);
    res.send(result);
  });

app.post("/bookings", async (req, res) => {
  
    const booking = req.body;
    const result = await bookingsCollection.insertOne(booking);

 res.send(result)
});
app.get('/studios', async (req, res) => {
    const studios = await bookingsCollection.find().toArray();
    res.send(studios);
  });

app.get('/studios/:id', async (req, res) => {
    const id = req.params.id;
    const studio = await bookingsCollection.findOne({ _id:new ObjectId(id) });
    res.send(studio);
})

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
