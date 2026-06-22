const express = require('express');
const cors = require('cors');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 8000;

// মিডলওয়্যার
app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = "mongodb://blood:wEbDDnLtIco9e735@ac-hsq8z3i-shard-00-00.dnimeu3.mongodb.net:27017,ac-hsq8z3i-shard-00-01.dnimeu3.mongodb.net:27017,ac-hsq8z3i-shard-00-02.dnimeu3.mongodb.net:27017/?ssl=true&replicaSet=atlas-yukkn2-shard-0&authSource=admin&appName=Cluster0";

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

// কালেকশন ভেরিয়েবলসমূহ
let bloodCollection;
let districtsCollection;
let upazilasCollection;
let donationRequestsCollection;

async function run() {
    try {
        await client.connect();
        const database = client.db("blood-doner");
        
        bloodCollection = database.collection("blood-collection");
        districtsCollection = database.collection("districts");
        upazilasCollection = database.collection("upazilas");
        donationRequestsCollection = database.collection("donation-requests");
        
        console.log("MongoDB তে সফলভাবে কানেক্ট হয়েছে!");
    } catch (error) {
        console.error("MongoDB কানেকশন এরর:", error);
    }
}
run();

// রুটসমূহ
app.get('/', (req, res) => res.send('সার্ভার সচল আছে!'));

// ১. ডোনেশন রিকোয়েস্ট পাওয়ার রুট (GET)
app.get('/api/v1/donation-requests', async (req, res) => {
    try {
        const result = await donationRequestsCollection.find({}).toArray();
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

// ২. নতুন ডোনেশন রিকোয়েস্ট তৈরি করার রুট (POST)
app.post('/api/v1/donation-requests', async (req, res) => {
    try {
        const newRequest = req.body;
        newRequest.status = 'pending'; // ডিফল্ট স্ট্যাটাস
        const result = await donationRequestsCollection.insertOne(newRequest);
        res.status(201).send(result);
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

// ৩. জেলা ও উপজেলা রুট
app.get('/api/v1/districts', async (req, res) => {
    try {
        const result = await districtsCollection.find().toArray();
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

app.get('/api/v1/upazilas', async (req, res) => {
    try {
        const districtId = req.query.districtId;
        const query = districtId ? { district_id: districtId } : {};
        const result = await upazilasCollection.find(query).toArray();
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

// ৪. সিডিং রুট
app.post('/api/v1/seed-locations', async (req, res) => {
    try {
        const { districts, upazilas } = req.body;
        await districtsCollection.deleteMany({});
        await upazilasCollection.deleteMany({});
        const dRes = await districtsCollection.insertMany(districts);
        const uRes = await upazilasCollection.insertMany(upazilas);
        res.send({ message: "সফলভাবে আপলোড হয়েছে!", districtsInserted: dRes.insertedCount, upazilasInserted: uRes.insertedCount });
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

app.listen(port, () => {
    console.log(`সার্ভারটি http://localhost:${port} এ চলছে`);
});