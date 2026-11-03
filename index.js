import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import "dotenv/config";
import { createRemoteJWKSet, jwtVerify } from "jose";

const app = express();
const port = process.env.PORT || 5001;

const CLIENT_URL = (process.env.CLIENT_URL || "http://localhost:3000").replace(
  /\/$/,
  "",
);

const API_ORIGIN = CLIENT_URL;

app.use(
  cors({
    origin: API_ORIGIN,
    credentials: true,
  }),
);

app.use(express.json({ limit: "10mb" }));

if (!process.env.MONGODB_URI) {
  throw new Error("MONGODB_URI is missing from environment variables");
}

const client = new MongoClient(process.env.MONGODB_URI);

await client.connect();

console.log("Successfully connected to MongoDB!");

const db = client.db("Studio-space");

const bookingsCollection = db.collection("bookings");
const studiosCollection = db.collection("studios");

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

const isValidObjectId = (id) => ObjectId.isValid(id);

const getTimeInMinutes = (time) => {
  if (typeof time !== "string" || !/^\d{2}:\d{2}$/.test(time)) {
    return null;
  }

  const [hours, minutes] = time.split(":").map(Number);

  if (hours > 23 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
};

const getTimeString = (minutes) => {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(remainingMinutes).padStart(
    2,
    "0",
  )}`;
};

const isValidBookingDate = (date) => {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }

  const parsedDate = new Date(`${date}T00:00:00.000Z`);

  return (
    !Number.isNaN(parsedDate.getTime()) &&
    parsedDate.toISOString().slice(0, 10) === date
  );
};

const getTodayDate = () => {
  return new Date().toISOString().slice(0, 10);
};

const getStudioOwnerFilter = (user) => ({
  $or: [{ ownerEmail: user.email }, { ownerId: user.id }],
});

const getBookingOwnerFilter = (user) => ({
  $or: [
    { email: user.email },
    { customerEmail: user.email },
    { customerId: user.id },
    { userId: user.id },
  ],
});

app.get("/", (req, res) => {
  res.send("StudioSpace API is running!");
});

app.post("/add-studio", verifyToken, async (req, res) => {
  try {
    const {
      title,
      category,
      hourlyRate,
      securityDeposit,
      maxCapacity,
      location,
      image,
      images,
      amenities,
      overview,
      ownerImage,
    } = req.body;

    if (!title || !category || !location) {
      return res.status(400).send({
        message: "Title, category, and location are required",
      });
    }

    const rate = Number(hourlyRate);
    const deposit = Number(securityDeposit || 0);
    const capacity = Number(maxCapacity);

    if (!Number.isFinite(rate) || rate < 0) {
      return res.status(400).send({
        message: "Invalid hourly rate",
      });
    }

    if (!Number.isFinite(deposit) || deposit < 0) {
      return res.status(400).send({
        message: "Invalid security deposit",
      });
    }

    if (!Number.isInteger(capacity) || capacity < 1) {
      return res.status(400).send({
        message: "Invalid maximum capacity",
      });
    }

    const studio = {
      title,
      category,
      hourlyRate: rate,
      securityDeposit: deposit,
      maxCapacity: capacity,
      location,
      image: image || "",
      images: Array.isArray(images) ? images : [],
      amenities: Array.isArray(amenities) ? amenities : [],
      overview: overview || "",
      ownerEmail: req.user.email,
      ownerId: req.user.id,
      ownerName: req.user.name,
      ownerImage: ownerImage || "",
      rating: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await studiosCollection.insertOne(studio);

    res.status(201).send({
      message: "Studio added successfully",
      insertedId: result.insertedId,
      studio: {
        ...studio,
        _id: result.insertedId,
      },
    });
  } catch (error) {
    console.error("Add studio error:", error);

    res.status(500).send({
      message: "Error adding studio",
    });
  }
});

app.get("/studios", async (req, res) => {
  try {
    const studios = await studiosCollection.find().toArray();

    res.status(200).send(studios);
  } catch (error) {
    console.error("Fetch studios error:", error);

    res.status(500).send({
      message: "Error fetching studios",
    });
  }
});

app.get("/studios/featured", async (req, res) => {
  try {
    const featuredStudios = await studiosCollection
      .find({})
      .sort({ rating: -1 })
      .limit(6)
      .toArray();

    res.status(200).send(featuredStudios);
  } catch (error) {
    console.error("Featured studios error:", error);

    res.status(500).send({
      message: "Failed to fetch featured studios",
    });
  }
});

app.get("/studios/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).send({
        message: "Invalid studio ID",
      });
    }

    const studio = await studiosCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!studio) {
      return res.status(404).send({
        message: "Studio not found",
      });
    }

    res.status(200).send(studio);
  } catch (error) {
    console.error("Fetch studio error:", error);

    res.status(500).send({
      message: "Error fetching studio",
    });
  }
});

app.put("/studios/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).send({
        message: "Invalid studio ID",
      });
    }

    const studioId = new ObjectId(id);

    const existingStudio = await studiosCollection.findOne({
      _id: studioId,
    });

    if (!existingStudio) {
      return res.status(404).send({
        message: "Studio not found",
      });
    }

    const isOwner =
      existingStudio.ownerEmail?.trim().toLowerCase() === req.user.email ||
      existingStudio.ownerId === req.user.id;

    if (!isOwner) {
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

    if (safeUpdates.hourlyRate !== undefined) {
      const rate = Number(safeUpdates.hourlyRate);

      if (!Number.isFinite(rate) || rate < 0) {
        return res.status(400).send({
          message: "Invalid hourly rate",
        });
      }

      safeUpdates.hourlyRate = rate;
    }

    if (safeUpdates.securityDeposit !== undefined) {
      const deposit = Number(safeUpdates.securityDeposit);

      if (!Number.isFinite(deposit) || deposit < 0) {
        return res.status(400).send({
          message: "Invalid security deposit",
        });
      }

      safeUpdates.securityDeposit = deposit;
    }

    if (safeUpdates.maxCapacity !== undefined) {
      const capacity = Number(safeUpdates.maxCapacity);

      if (!Number.isInteger(capacity) || capacity < 1) {
        return res.status(400).send({
          message: "Invalid maximum capacity",
        });
      }

      safeUpdates.maxCapacity = capacity;
    }

    safeUpdates.updatedAt = new Date();

    await studiosCollection.updateOne({ _id: studioId }, { $set: safeUpdates });

    const updatedStudio = await studiosCollection.findOne({
      _id: studioId,
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

app.delete("/delete-studio/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).send({
        message: "Invalid studio ID",
      });
    }

    const studio = await studiosCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!studio) {
      return res.status(404).send({
        message: "Studio not found",
      });
    }

    const isOwner =
      studio.ownerEmail?.trim().toLowerCase() === req.user.email ||
      studio.ownerId === req.user.id;

    if (!isOwner) {
      return res.status(403).send({
        message: "You are not allowed to delete this studio",
      });
    }

    await studiosCollection.deleteOne({
      _id: new ObjectId(id),
    });

    res.status(200).send({
      message: "Your studio was deleted successfully",
    });
  } catch (error) {
    console.error("Delete studio error:", error);

    res.status(500).send({
      message: "Error deleting studio",
    });
  }
});

app.post("/bookings", verifyToken, async (req, res) => {
  try {
    const { studioId, bookingDate, startTime, durationHours, noteToHost } =
      req.body;

    if (!studioId || !isValidObjectId(studioId)) {
      return res.status(400).send({
        message: "Invalid studio ID",
      });
    }

    if (!isValidBookingDate(bookingDate)) {
      return res.status(400).send({
        message: "Invalid booking date",
      });
    }

    if (bookingDate < getTodayDate()) {
      return res.status(400).send({
        message: "You cannot book a past date",
      });
    }

    const startMinutes = getTimeInMinutes(startTime);

    if (startMinutes === null) {
      return res.status(400).send({
        message: "Invalid start time",
      });
    }

    const hours = Number(durationHours);

    if (!Number.isInteger(hours) || hours < 1 || hours > 24) {
      return res.status(400).send({
        message: "Duration must be between 1 and 24 hours",
      });
    }

    const endMinutes = startMinutes + hours * 60;

    if (endMinutes > 1440) {
      return res.status(400).send({
        message: "Booking cannot extend past midnight",
      });
    }

    const studio = await studiosCollection.findOne({
      _id: new ObjectId(studioId),
    });

    if (!studio) {
      return res.status(404).send({
        message: "Studio not found",
      });
    }

    const studioOwner =
      studio.ownerEmail?.trim().toLowerCase() === req.user.email ||
      studio.ownerId === req.user.id;

    if (studioOwner) {
      return res.status(400).send({
        message: "You cannot book your own studio",
      });
    }

    const existingBookings = await bookingsCollection
      .find({
        studioId,
        bookingDate,
      })
      .toArray();

    const hasConflict = existingBookings.some((booking) => {
      if (booking.status === "cancelled") {
        return false;
      }

      const existingStart = getTimeInMinutes(booking.startTime);

      if (existingStart === null) {
        return false;
      }

      let existingEnd;

      if (booking.endTime) {
        existingEnd = getTimeInMinutes(booking.endTime);
      } else {
        const existingDuration = Number(booking.durationHours);

        if (!Number.isFinite(existingDuration) || existingDuration <= 0) {
          return false;
        }

        existingEnd = existingStart + existingDuration * 60;
      }

      if (existingEnd === null || existingEnd > 1440) {
        return false;
      }

      return startMinutes < existingEnd && endMinutes > existingStart;
    });

    if (hasConflict) {
      return res.status(409).send({
        message: "This studio is already booked during that time",
      });
    }

    const hourlyRate = Number(studio.hourlyRate);
    const securityDeposit = Number(studio.securityDeposit || 0);

    if (
      !Number.isFinite(hourlyRate) ||
      hourlyRate < 0 ||
      !Number.isFinite(securityDeposit) ||
      securityDeposit < 0
    ) {
      return res.status(400).send({
        message: "Studio pricing information is invalid",
      });
    }

    const rentalAmount = hourlyRate * hours;
    const totalAmount = rentalAmount + securityDeposit;

    const booking = {
      studioId,
      studioTitle: studio.title,
      customerId: req.user.id,
      userId: req.user.id,
      email: req.user.email,
      customerEmail: req.user.email,
      customerName: req.user.name,
      userName: req.user.name,
      bookingDate,
      startTime,
      endTime: getTimeString(endMinutes),
      durationHours: hours,
      hourlyRate,
      rentalAmount,
      securityDeposit,
      totalAmount,
      noteToHost: noteToHost || "",
      status: "confirmed",
      createdAt: new Date(),
    };

    const result = await bookingsCollection.insertOne(booking);

    res.status(201).send({
      message: "Booking created successfully",
      booking: {
        ...booking,
        _id: result.insertedId,
      },
    });
  } catch (error) {
    console.error("Create booking error:", error);

    res.status(500).send({
      message: "Error creating booking",
    });
  }
});

app.get("/my-bookings/:email", verifyToken, async (req, res) => {
  try {
    const requestedEmail = decodeURIComponent(req.params.email)
      .trim()
      .toLowerCase();

    if (requestedEmail !== req.user.email) {
      return res.status(403).send({
        message: "You cannot access another user's bookings",
      });
    }

    const bookings = await bookingsCollection
      .find({
        $or: [{ email: req.user.email }, { customerEmail: req.user.email }],
      })
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).send(bookings);
  } catch (error) {
    console.error("Fetch bookings error:", error);

    res.status(500).send({
      message: "Error fetching bookings",
    });
  }
});

app.delete("/my-booking/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).send({
        message: "Invalid booking ID",
      });
    }

    const result = await bookingsCollection.deleteOne({
      _id: new ObjectId(id),
      ...getBookingOwnerFilter(req.user),
    });

    if (result.deletedCount === 0) {
      return res.status(404).send({
        message: "Booking not found or you do not own this booking",
      });
    }

    res.status(200).send({
      message: "Booking cancelled successfully",
    });
  } catch (error) {
    console.error("Cancel booking error:", error);

    res.status(500).send({
      message: "Error cancelling booking",
    });
  }
});

app.listen(port, () => {
  console.log(`StudioSpace API listening on port ${port}`);
});
