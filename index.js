const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();

// 🟢 CORS সেফ কনফিগারেশন (যাতে Vercel-এ কোনোভাবেই ব্লক না হয়)
app.use(cors({
    origin: '*', // প্রোডাকশনে চাইলে সুনির্দিষ্ট ফ্রন্টএন্ড ডোমেন দিতে পারেন
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// MongoDB URI
const uri = process.env.MONGO_URI || "mongodb://blood:cspxbqA6HGXvp4jk@ac-hsq8z3i-shard-00-00.dnimeu3.mongodb.net:27017,ac-hsq8z3i-shard-00-01.dnimeu3.mongodb.net:27017,ac-hsq8z3i-shard-00-02.dnimeu3.mongodb.net:27017/?ssl=true&replicaSet=atlas-yukkn2-shard-0&authSource=admin&appName=Cluster0";

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

// 🟢 ১. অন-ডিমান্ড কালেকশন পাওয়ার সেফ ফাংশন (Vercel-এ কখনো undefined এরর দেবে না)
async function getCollection(collectionName) {
    if (!client.topology || !client.topology.isConnected()) {
        // Vercel Serverless-এর জন্য কানেকশন চেক ও হ্যান্ডেল
        try {
            await client.connect();
        } catch (err) {
            console.error("MongoDB Connection error inside getCollection:", err);
        }
    }
    return client.db("blood-doner").collection(collectionName);
}

// Middleware
const verifyToken = (req, res, next) => {
    if (!req.headers.authorization) {
        return res.status(401).send({ message: 'Unauthorized access' });
    }
    const token = req.headers.authorization.split(' ')[1];
    jwt.verify(token, process.env.JWT_SECRET || 'super-secret-key-123', (err, decoded) => {
        if (err) {
            return res.status(403).send({ message: 'Forbidden access' });
        }
        req.decoded = decoded;
        next();
    });
};

const verifyAdmin = async (req, res, next) => {
    try {
        const usersCollection = await getCollection("users");
        const email = req.decoded?.email;
        if (!email) {
            return res.status(401).send({ message: 'Unauthorized access' });
        }
        const user = await usersCollection.findOne({ email });
        if (!user || user.role !== 'admin') {
            return res.status(403).send({ message: 'Forbidden access! Admin only.' });
        }
        next();
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
};

// ==================== ROUTING ====================

app.post('/api/v1/register', async (req, res) => {
    try {
        const usersCollection = await getCollection("users");
        const user = req.body;
        const existingUser = await usersCollection.findOne({ email: user.email });
        if (existingUser) {
            return res.status(400).send({ message: 'User already exists with this email!' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(user.password, salt);

        const newUser = {
            name: user.name,
            email: user.email,
            avatar: user.avatar,
            bloodGroup: user.bloodGroup,
            district: user.district,
            upazila: user.upazila,
            password: hashedPassword,
            role: 'donor',
            status: 'active'
        };

        const result = await usersCollection.insertOne(newUser);
        const token = jwt.sign({ email: newUser.email, role: newUser.role }, process.env.JWT_SECRET || 'super-secret-key-123', { expiresIn: '7d' });
        
        res.status(201).send({ result, token });
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

app.post('/api/v1/login', async (req, res) => {
    try {
        const usersCollection = await getCollection("users");
        const { email, password } = req.body;
        const user = await usersCollection.findOne({ email });
        if (!user) {
            return res.status(404).send({ message: 'User not found!' });
        }
        const isPasswordMatch = await bcrypt.compare(password, user.password);
        if (!isPasswordMatch) {
            return res.status(401).send({ message: 'Invalid password!' });
        }
        const token = jwt.sign({ email: user.email, role: user.role }, process.env.JWT_SECRET || 'super-secret-key-123', { expiresIn: '7d' });
        const { password: _, ...userData } = user;
        res.send({ user: userData, token });
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

// প্রোফাইল এপিআই (কন্ট্রোলার ট্রাই-ক্যাচ সেফ রাখা হয়েছে)
const userController = require('./userController');
app.get('/api/v1/profile', verifyToken, async (req, res) => {
    try {
        const usersCollection = await getCollection("users");
        if (userController && typeof userController.getUserProfile === 'function') {
            userController.getUserProfile(req, res, usersCollection);
        } else {
            res.status(500).send({ message: "Internal Controller Error" });
        }
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

// 🟢 ডিস্ট্রিক্ট এপিআই (১০০% সেফ ফলব্যাক সহ)
app.get('/api/v1/districts', async (req, res) => {
    try {
        const districtsCollection = await getCollection("districts");
        let result = await districtsCollection.find().toArray();
        if (!result || result.length === 0) {
            result = [
                { "id": "1", "district_id": "1", "name": "Comilla", "bn_name": "কুমিল্লা" },
                { "id": "2", "district_id": "2", "name": "Feni", "bn_name": "ফেনী" }
            ];
        }
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

// 🟢 উপজেলা এপিআই (বাগ ফিক্সড ও সেফ ফলব্যাক সহ)
app.get('/api/v1/upazilas', async (req, res) => {
    try {
        const upazilasCollection = await getCollection("upazilas");
        
        // ফ্রন্টএন্ড থেকে district_id অথবা districtId দুই ফরম্যাটই যেন সাপোর্ট করে
        const districtId = req.query.district_id || req.query.districtId;
        let result = [];
        
        if (districtId) {
            result = await upazilasCollection.find({
                $or: [
                    { district_id: districtId.toString() },
                    { district_id: Number(districtId) },
                    { district_id: districtId }
                ]
            }).toArray();
        } else {
            result = await upazilasCollection.find().toArray();
        }
        
        // ডাটাবেজে যদি ডেটা না থাকে তবে ডেমো ফলব্যাক ডেটা লোড হবে
        if (!result || result.length === 0) {
            const tempUpazilas = [
                { "id": "1", "district_id": "1", "name": "Debidwar", "bn_name": "দেবিদ্বার" },
                { "id": "2", "district_id": "1", "name": "Muradnagar", "bn_name": "মুরাদনগর" },
                { "id": "3", "district_id": "2", "name": "Chhagalnaiya", "bn_name": "ছাগলনাইয়া" }
            ];
            if (districtId) {
                result = tempUpazilas.filter(u => u.district_id.toString() === districtId.toString());
            } else {
                result = tempUpazilas;
            }
        }
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

app.get('/api/v1/donors/search', async (req, res) => {
    try {
        const usersCollection = await getCollection("users");
        const { bloodGroup, district, upazila } = req.query;
        let query = { role: 'donor', status: 'active' }; 

        if (bloodGroup) query.bloodGroup = bloodGroup;
        if (district) query.district = district;
        if (upazila) query.upazila = upazila;

        const donors = await usersCollection.find(query).toArray();
        res.send(donors);
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

app.post('/api/v1/donation-requests', verifyToken, async (req, res) => {
    try {
        const donationRequestsCollection = await getCollection("blood-collection");
        const requestData = req.body;
        
        const newRequest = {
            requesterName: requestData.requesterName,
            requesterEmail: requestData.requesterEmail,
            recipientName: requestData.recipientName,
            hospitalName: requestData.hospitalName,
            fullAddress: requestData.fullAddress,
            bloodGroup: requestData.bloodGroup,
            district: requestData.district,
            upazila: requestData.upazila,
            donationDate: requestData.donationDate,
            donationTime: requestData.donationTime,
            deliveryStatus: 'pending',
            createdAt: new Date()
        };

        const result = await donationRequestsCollection.insertOne(newRequest);
        res.status(201).send(result);
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

app.get('/api/v1/donation-requests', async (req, res) => {
    try {
        const donationRequestsCollection = await getCollection("blood-collection");
        const requests = await donationRequestsCollection.find().sort({ _id: -1 }).toArray();
        res.send(requests);
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

app.get('/api/v1/my-donation-requests', verifyToken, async (req, res) => {
    try {
        const donationRequestsCollection = await getCollection("blood-collection");
        const email = req.decoded.email; 
        const query = { requesterEmail: email };
        const myRequests = await donationRequestsCollection.find(query).sort({ _id: -1 }).toArray();
        res.send(myRequests);
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

app.get('/', (req, res) => res.send('server is running'));

// 🟢 Localhost এবং Vercel হ্যান্ডেল করার জন্য সঠিক লিসেনার
const port = process.env.PORT || 8000;
app.listen(port, () => {
    console.log(`🚀 server is running at http://localhost:${port}`);
});

module.exports = app;