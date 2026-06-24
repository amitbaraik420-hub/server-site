const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8000;

// মিডলওয়্যার
app.use(cors());
app.use(express.json());

// MongoDB Connection
const uri = process.env.MONGO_URI || "mongodb://blood:wEbDDnLtIco9e735@ac-hsq8z3i-shard-00-00.dnimeu3.mongodb.net:27017,ac-hsq8z3i-shard-00-01.dnimeu3.mongodb.net:27017,ac-hsq8z3i-shard-00-02.dnimeu3.mongodb.net:27017/?ssl=true&replicaSet=atlas-yukkn2-shard-0&authSource=admin&appName=Cluster0";

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

// কালেকশন ভেরিয়েবলসমূহ
let database;
let usersCollection;
let districtsCollection;
let upazilasCollection;
let donationRequestsCollection;
let fundingCollection;

async function run() {
    try {
        console.log("MongoDB তে কানেক্ট হওয়ার চেষ্টা করা হচ্ছে...");
        await client.connect();
        database = client.db("blood-doner");
        
        usersCollection = database.collection("users");
        districtsCollection = database.collection("districts");
        upazilasCollection = database.collection("upazilas");
        donationRequestsCollection = database.collection("blood-collection");
        fundingCollection = database.collection("fundings");
        
        console.log("🟢 MongoDB তে সফলভাবে কানেক্ট হয়েছে!");

        // ⚡ কালেকশনগুলো অ্যাসাইন হওয়ার ঠিক পরে ডাটা সিড করার লজিক
        const districtCount = await districtsCollection.countDocuments();
        console.log(`বর্তমান ডিস্ট্রিক্ট সংখ্যা: ${districtCount}`);

        if (districtCount === 0) {
            console.log("📥 ডাটাবেজ খালি! ডেমো ডাটা ইনসার্ট করা হচ্ছে...");
            const tempDistricts = [
                { "id": "1", "district_id": "1", "name": "Comilla", "bn_name": "কুমিল্লা" },
                { "id": "2", "district_id": "2", "name": "Feni", "bn_name": "ফেনী" }
            ];
            const tempUpazilas = [
                { "id": "1", "district_id": "1", "name": "Debidwar", "bn_name": "দেবিদ্বার" },
                { "id": "2", "district_id": "1", "name": "Muradnagar", "bn_name": "মুরাদনগর" },
                { "id": "3", "district_id": "2", "name": "Chhagalnaiya", "bn_name": "ছাগলনাইয়া" }
            ];

            const dRes = await districtsCollection.insertMany(tempDistricts);
            const uRes = await upazilasCollection.insertMany(tempUpazilas);
            
            console.log(`⚡ [SUCCESS] ডাটাবেজে ${dRes.insertedCount}টি জেলা এবং ${uRes.insertedCount}টি উপজেলা যোগ হয়েছে!`);
        } else {
            console.log("ℹ️ ডাটাবেজে ইতিমধ্যে ডাটা আছে, তাই নতুন করে সিড করা হয়নি।");
        }

    } catch (error) {
        console.error("❌ MongoDB কানেকশন বা সিডিং এরর:", error);
    }
}
run();

// ==========================================
// 🛡️ JWT & ROLE VERIFICATION MIDDLEWARES
// ==========================================

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
    const email = req.decoded.email;
    const user = await usersCollection.findOne({ email });
    if (!user || user.role !== 'admin') {
        return res.status(403).send({ message: 'Forbidden access! Admin only.' });
    }
    next();
};


// ==========================================
// 🔐 AUTHENTICATION & USER APIs
// ==========================================

app.post('/api/v1/register', async (req, res) => {
    try {
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


// ==========================================
// 👤 USER PROFILE API
// ==========================================
const { getUserProfile } = require('./userController'); // কন্ট্রোলার ইম্পোর্ট

// 🔒 প্রটেক্টড প্রোফাইল রাউট (টোকেন ভেরিফাই করে ইউজারের ডাটা পাঠাবে)
app.get('/api/v1/profile', verifyToken, (req, res) => {
    getUserProfile(req, res, usersCollection);
});


// ==========================================
// 📍 LOCATION APIs (উইথ ফোর্সড ব্যাকআপ লজিক)
// ==========================================

app.get('/api/v1/districts', async (req, res) => {
    try {
        let result = [];
        if (districtsCollection) {
            result = await districtsCollection.find().toArray();
        }
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

app.get('/api/v1/upazilas', async (req, res) => {
    try {
        const districtId = req.query.districtId;
        let result = [];
        if (upazilasCollection && districtId) {
            result = await upazilasCollection.find({ district_id: districtId.toString() }).toArray();
        }
        if (!result || result.length === 0) {
            const tempUpazilas = [
                { "id": "1", "district_id": "1", "name": "Debidwar", "bn_name": "দেবিদ্বার" },
                { "id": "2", "district_id": "1", "name": "Muradnagar", "bn_name": "মুরাদনগর" },
                { "id": "3", "district_id": "2", "name": "Chhagalnaiya", "bn_name": "ছাগলনাইয়া" }
            ];
            if (districtId) {
                result = tempUpazilas.filter(u => u.district_id === districtId.toString());
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
        const { bloodGroup, district, upazila } = req.query;
        let query = { role: 'donor', status: 'active' }; // শুধু একটিভ ডোনারদের খুঁজবো

        // ফ্রন্টঅ্যান্ড থেকে ফিল্টার পাঠালে কুয়েরিতে যোগ হবে
        if (bloodGroup) query.bloodGroup = bloodGroup;
        if (district) query.district = district;
        if (upazila) query.upazila = upazila;

        const donors = await usersCollection.find(query).toArray();
        res.send(donors);
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

// ==========================================
// 🩸 CREATE BLOOD DONATION REQUEST API
// ==========================================
app.post('/api/v1/donation-requests', verifyToken, async (req, res) => {
    try {
        const requestData = req.body;
        
        // ফ্রন্টএন্ড থেকে আসা ডাটা সাজিয়ে নেওয়া
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
            deliveryStatus: 'pending', // ডিফল্ট স্ট্যাটাস পেন্ডিং থাকবে
            createdAt: new Date()
        };

        const result = await donationRequestsCollection.insertOne(newRequest);
        res.status(201).send(result);
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

// ==========================================
// 🩸 GET ALL BLOOD DONATION REQUESTS API
// ==========================================
app.get('/api/v1/donation-requests', async (req, res) => {
    try {
        // নতুন রিকোয়েস্টগুলো আগে দেখানোর জন্য sort({ _id: -1 }) ব্যবহার করা হয়েছে
        const requests = await donationRequestsCollection.find().sort({ _id: -1 }).toArray();
        res.send(requests);
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

// ==========================================
// 🔐 GET SPECIFIC USER'S DONATION REQUESTS
// ==========================================
app.get('/api/v1/my-donation-requests', verifyToken, async (req, res) => {
    try {
        // verifyToken মিডলওয়্যার থেকে ইউজারের ইমেইল নেওয়া হচ্ছে
        const email = req.decoded.email; 
        
        const query = { requesterEmail: email };
        const myRequests = await donationRequestsCollection.find(query).sort({ _id: -1 }).toArray();
        res.send(myRequests);
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

app.get('/blog', (req, res) => res.send('সার্ভার সচল আছে!'));

app.listen(port, () => {
    console.log(`সার্ভারটি http://localhost:${port} এ চলছে...`);
});